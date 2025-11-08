from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import crud, login

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
app.include_router(crud.router)

@app.get("/")
def root():
    return {"message": "API is running"}
