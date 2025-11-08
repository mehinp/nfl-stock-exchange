from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import login, market, trades

app = FastAPI(title="NFL Stock Trader API")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # relax for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(login.router)
app.include_router(market.router)
app.include_router(trades.router)

@app.get("/")
def root():
    return {"message": "API is running"}
