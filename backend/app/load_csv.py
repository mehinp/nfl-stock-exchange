import asyncio
import pandas as pd
from datetime import datetime
from app.database import engine, SessionLocal
from app.models import TeamMarketInformation

async def load_csv_to_db():
    # Read CSV file
    df = pd.read_csv("team_values.csv")  # adjust path if needed
    print(f"Loaded {len(df)} rows from CSV")

    # Expect columns: team_name, price, value, volume, timestamp (timestamp optional)
    async with SessionLocal() as session:
        for _, row in df.iterrows():
            record = TeamMarketInformation(
                team_name=row["team_name"],
                price=float(row["price"]),
                value=float(row["value"]) if "value" in row and not pd.isna(row["value"]) else None,
                volume=float(row["volume"]),
                timestamp=pd.to_datetime(row["timestamp"]) if "timestamp" in row else datetime.utcnow(),
            )
            session.add(record)
        await session.commit()

    print("CSV data successfully inserted into team_market_history")

if __name__ == "__main__":
    asyncio.run(load_csv_to_db())
