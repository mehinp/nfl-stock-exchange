# app/crud.py
from fastapi import FastAPI, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import SessionLocal
from app.models import TeamMarketLive

app = FastAPI(title="NFL Stock Trader API")

# Dependency: database session
async def get_db():
    async with SessionLocal() as session:
        yield session

@app.get("/team/{team_name}")
async def get_team_value(team_name: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TeamMarketLive).where(TeamMarketLive.team_name == team_name))
    team = result.scalar_one_or_none()
    if not team:
        return {"error": f"Team '{team_name}' not found"}
    return {
        "team_name": team.team_name,
        "price": team.price,
        "sentiment_score": team.sentiment_score,
        "change": team.change,
        "updated_at": team.updated_at,
    }

@app.get("/all-teams")
async def get_all_teams(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TeamMarketLive))
    teams = result.scalars().all()
    return [
        {
            "team_name": t.team_name,
            "price": t.price,
            "change": t.change,
            "sentiment_score": t.sentiment_score,
            "updated_at": t.updated_at,
        }
        for t in teams
    ]
