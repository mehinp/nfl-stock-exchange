from decimal import Decimal
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, case
from app.database import SessionLocal
from app.models import User, Trades, TeamMarketInformation
from app.api.login import decode_token

router = APIRouter(prefix="/trades", tags=["Trades"])

# ---------------------------
# Schemas
# ---------------------------
class BuyIn(BaseModel):
    team_name: str
    quantity: int = Field(gt=0)

class SellIn(BaseModel):
    team_name: str
    quantity: int = Field(gt=0)

class TradeOut(BaseModel):
    success: bool = True
    team_name: str
    quantity: int
    avg_price: str
    balance: str

class PositionOut(BaseModel):
    team_name: str
    quantity: int
    avg_price: str

class PortfolioOut(BaseModel):
    balance: str
    positions: list[PositionOut]

# ---------------------------
# Database dependency
# ---------------------------
async def get_db():
    async with SessionLocal() as session:
        yield session

# ---------------------------
# Auth dependency
# ---------------------------
async def get_current_user(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Extract and validate JWT token, return current user."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    token = authorization.replace("Bearer ", "")
    
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user

# ---------------------------
# Helpers
# ---------------------------
async def get_current_price(db: AsyncSession, team_name: str) -> Decimal:
    """Get the most recent price for a team."""
    result = await db.execute(
        select(TeamMarketInformation)
        .where(TeamMarketInformation.team_name == team_name)
        .order_by(TeamMarketInformation.timestamp.desc())
        .limit(1)
    )
    team_info = result.scalar_one_or_none()
    
    if not team_info or team_info.value is None:
        raise HTTPException(status_code=404, detail=f"No price data for '{team_name}'")
    
    return Decimal(str(team_info.value))

def to_decimal(x: float) -> Decimal:
    """Convert float to Decimal for precise calculations."""
    return Decimal(str(x))

# ---------------------------
# POST /trades/buy
# ---------------------------
@router.post("/buy", response_model=TradeOut)
async def buy_stock(
    payload: BuyIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    price = await get_current_price(db, payload.team_name)
    cost = price * payload.quantity
    balance = Decimal(str(current_user.balance))

    if balance < cost:
        raise HTTPException(400, detail=f"Insufficient balance (${balance:.2f} < ${cost:.2f})")

    current_user.balance = float(balance - cost)

    # record trade
    trade = Trades(
        user_id=current_user.id,
        team_name=payload.team_name,
        action="buy",
        quantity=payload.quantity,
        price=float(price)
    )
    db.add(trade)
    await db.commit()
    await db.refresh(current_user)

    # get updated aggregate holdings for this team
    result = await db.execute(
        select(
            func.sum(case((Trades.action == 'buy', Trades.quantity), else_=-Trades.quantity)).label('net_qty'),
            func.sum(case((Trades.action == 'buy', Trades.price * Trades.quantity), else_=0)).label('buy_value'),
            func.sum(case((Trades.action == 'buy', Trades.quantity), else_=0)).label('buy_qty')
        ).where(Trades.user_id == current_user.id, Trades.team_name == payload.team_name)
    )
    row = result.one()
    net_qty = row.net_qty or 0
    avg_price = (row.buy_value / row.buy_qty) if row.buy_qty else 0

    return TradeOut(
        team_name=payload.team_name,
        quantity=int(net_qty),
        avg_price=f"{avg_price:.2f}",
        balance=f"{current_user.balance:.2f}"
    )

# ---------------------------
# POST /trades/sell
# ---------------------------
@router.post("/sell", response_model=TradeOut)
async def sell_stock(
    payload: SellIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    price = await get_current_price(db, payload.team_name)
    proceeds = price * payload.quantity

    # get current position dynamically
    result = await db.execute(
        select(
            func.sum(case((Trades.action == 'buy', Trades.quantity), else_=-Trades.quantity))
        ).where(Trades.user_id == current_user.id, Trades.team_name == payload.team_name)
    )
    current_qty = result.scalar() or 0

    if current_qty < payload.quantity:
        raise HTTPException(400, detail=f"Not enough shares to sell. You have {current_qty}")

    # credit balance
    current_user.balance = float(Decimal(str(current_user.balance)) + proceeds)

    # record trade
    trade = Trades(
        user_id=current_user.id,
        team_name=payload.team_name,
        action="sell",
        quantity=payload.quantity,
        price=float(price)
    )
    db.add(trade)
    await db.commit()
    await db.refresh(current_user)

    # recompute holdings
    result = await db.execute(
        select(
            func.sum(case((Trades.action == 'buy', Trades.quantity), else_=-Trades.quantity)).label('net_qty'),
            func.sum(case((Trades.action == 'buy', Trades.price * Trades.quantity), else_=0)).label('buy_value'),
            func.sum(case((Trades.action == 'buy', Trades.quantity), else_=0)).label('buy_qty')
        ).where(Trades.user_id == current_user.id, Trades.team_name == payload.team_name)
    )
    row = result.one()
    net_qty = row.net_qty or 0
    avg_price = (row.buy_value / row.buy_qty) if row.buy_qty else 0

    return TradeOut(
        team_name=payload.team_name,
        quantity=int(net_qty),
        avg_price=f"{avg_price:.2f}",
        balance=f"{current_user.balance:.2f}"
    )

# ---------------------------
# GET /trades/portfolio
# ---------------------------
@router.get("/portfolio", response_model=PortfolioOut)
async def get_portfolio(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(
            Trades.team_name,
            func.sum(case((Trades.action == 'buy', Trades.quantity), else_=-Trades.quantity)).label('net_qty'),
            func.sum(case((Trades.action == 'buy', Trades.price * Trades.quantity), else_=0)).label('buy_value'),
            func.sum(case((Trades.action == 'buy', Trades.quantity), else_=0)).label('buy_qty')
        )
        .where(Trades.user_id == current_user.id)
        .group_by(Trades.team_name)
    )
    rows = result.all()

    positions = []
    for row in rows:
        if (row.net_qty or 0) > 0:
            avg_price = (row.buy_value / row.buy_qty) if row.buy_qty else 0
            positions.append(
                PositionOut(
                    team_name=row.team_name,
                    quantity=int(row.net_qty),
                    avg_price=f"{avg_price:.2f}"
                )
            )

    return PortfolioOut(
        balance=f"{current_user.balance:.2f}",
        positions=positions
    )
