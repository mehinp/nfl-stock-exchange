from sqlalchemy import Column, Integer, String, Float, DateTime
from datetime import datetime
from .database import Base

class TeamMarketInformation(Base):
    __tablename__ = "team_market_information"

    id = Column(Integer, primary_key=True, index=True)
    team_name = Column(String(50), index=True, nullable=False)
    price = Column(Float, nullable=False)
    value = Column(Float, nullable=True)
    volume = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
