import bcrypt, secrets
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.database import SessionLocal
from app.models import User

router = APIRouter(prefix="/auth", tags=["Auth"])

# -----------------------------------------------------------------
# Schemas
# -----------------------------------------------------------------
class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    confirm_password: str
    initial_deposit: float = Field(ge=0)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class TokenOut(BaseModel):
    success: bool = True
    access_token: str
    token_type: str = "x-header"
    user_id: int

# -----------------------------------------------------------------
# Simple in-memory session store (can replace with DB table)
# -----------------------------------------------------------------
SESSION_TOKENS = {}  # {token: (user_id, expires_at)}

TOKEN_LIFETIME = timedelta(days=7)  # expire tokens after 7 days


def make_token(user_id: int) -> str:
    """Generate a random token and store it in memory."""
    token = secrets.token_hex(32)  # 64-char hex string
    expires_at = datetime.utcnow() + TOKEN_LIFETIME
    SESSION_TOKENS[token] = (user_id, expires_at)
    print(f"✅ Created session token for user {user_id}: {token}")
    return token


def validate_token(token: str) -> int:
    """Return user_id if token valid, else raise 401."""
    if token not in SESSION_TOKENS:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id, expires_at = SESSION_TOKENS[token]
    if datetime.utcnow() > expires_at:
        del SESSION_TOKENS[token]
        raise HTTPException(status_code=401, detail="Session expired")

    return user_id


async def get_db():
    async with SessionLocal() as session:
        yield session

# -----------------------------------------------------------------
# CRUD Helpers
# -----------------------------------------------------------------
async def create_user(email: str, password_hash: str, initial_deposit: float, db: AsyncSession):
    existing_user = await db.execute(select(User).where(User.email == email))
    if existing_user.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(email=email, password=password_hash, balance=initial_deposit)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(email: str, password: str, db: AsyncSession) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or not bcrypt.checkpw(password.encode(), user.password.encode()):
        return None
    return user

# -----------------------------------------------------------------
# Header validation (no JWT)
# -----------------------------------------------------------------
async def get_current_user(
    x_auth_header: Optional[str] = Header(None, alias="X-Auth-Header"),
    db: AsyncSession = Depends(get_db)
) -> User:
    if not x_auth_header:
        raise HTTPException(status_code=401, detail="Missing X-Auth-Header")

    user_id = validate_token(x_auth_header)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# -----------------------------------------------------------------
# Routes
# -----------------------------------------------------------------
@router.post("/signup", response_model=TokenOut, status_code=201)
async def signup(payload: SignupIn, db: AsyncSession = Depends(get_db)):
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    hashed = bcrypt.hashpw(payload.password.encode(), bcrypt.gensalt()).decode()
    user = await create_user(payload.email, hashed, payload.initial_deposit, db)
    token = make_token(user.id)
    return TokenOut(access_token=token, user_id=user.id)


@router.post("/login", response_model=TokenOut)
async def login(payload: LoginIn, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(payload.email, payload.password, db)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = make_token(user.id)
    return TokenOut(access_token=token, user_id=user.id)
