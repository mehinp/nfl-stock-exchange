from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class TeamMarketInformation(Base):
    __tablename__ = "team_market_information"

    id = Column(Integer, primary_key=True, index=True)
    team_name = Column(String(50), index=True, nullable=False)
    value = Column(Float, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)


class User(Base):
    __tablename__ = "user"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(50), index=True, nullable=False)
    password = Column(String(250), nullable=False)
    balance = Column(Float, default=100, nullable=False)

    # establish relationship with trades
    trades = relationship("Trades", back_populates="user")


class Trades(Base):
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False)
    team_name = Column(String(50), nullable=False)
    action = Column(String(10), nullable=False)  # 'buy' or 'sell'
    quantity = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="trades")
