import asyncio
import pandas as pd
from datetime import datetime
from app.database import SessionLocal
from app.models import TeamMarketInformation

async def load_csv_to_db():
    df = pd.read_csv("team_values_formatted_no_price_volume.csv")
    print(f"Loaded {len(df)} rows from CSV")

    async with SessionLocal() as session:
        inserted = 0
        skipped = 0

        for _, row in df.iterrows():
            # skip if value column missing or NaN
            if "value" not in row or pd.isna(row["value"]):
                skipped += 1
                continue

            record = TeamMarketInformation(
                team_name=row["team_name"],
                value=float(row["value"]) * 2.5,
                timestamp=pd.to_datetime(row["timestamp"]) if "timestamp" in row else datetime.utcnow(),
            )
            session.add(record)
            inserted += 1

        await session.commit()
        print(f"✅ Inserted {inserted} rows, skipped {skipped} (missing values)")

if __name__ == "__main__":
    asyncio.run(load_csv_to_db())
