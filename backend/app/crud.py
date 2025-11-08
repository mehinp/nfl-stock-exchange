# app/crud.py
from fastapi import FastAPI, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import SessionLocal
from app.models import TeamMarketInformation

app = FastAPI(title="NFL Stock Trader API")

# Dependency: database session
async def get_db():
    async with SessionLocal() as session:
        yield session

@app.get("/team/{team_name}")
async def get_team_value(team_name: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TeamMarketInformation).where(TeamMarketInformation.team_name == team_name))
    teams = result.scalars().all()
    if not teams:
        return {"error": f"Team '{team_name}' not found"}
    return [ {
        "team_name": t.team_name,
        "price": t.price,
        "value": t.value,
        "volume": t.volume,
        "timestamp": t.timestamp,
    }
        for t in teams
    ]

@app.get("/all-teams")
async def get_all_teams(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TeamMarketInformation))
    teams = result.scalars().all()
    return [
        {
            "team_name": t.team_name,
            "price": t.price,
            "value": t.value,
            "volume": t.volume,
            "timestamp": t.timestamp,
        }
        for t in teams
    ]
