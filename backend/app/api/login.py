import os, jwt, bcrypt, uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import SessionLocal
from app.models import User

load_dotenv()
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
JWT_ALG = "HS256"
print("🔐 JWT_SECRET in use:", JWT_SECRET)



router = APIRouter(prefix="/auth", tags=["Auth"])

# ---------------------------
# Schemas
# ---------------------------
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
    token_type: str = "bearer"
    user_id: int

# ---------------------------
# JWT helpers
# ---------------------------
def make_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(datetime.utcnow().timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ---------------------------
# Database Dependency
# ---------------------------
async def get_db():
    async with SessionLocal() as session:
        yield session

# ---------------------------
# CRUD Functions
# ---------------------------
async def create_user(email: str, password_hash: str, initial_deposit: float, db: AsyncSession):
    # Check if user exists
    existing_user = await db.execute(select(User).where(User.email == email))
    if existing_user.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=email,
        password=password_hash,
        balance=initial_deposit
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

async def authenticate_user(email: str, password: str, db: AsyncSession) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        return None
    if not bcrypt.checkpw(password.encode("utf-8"), user.password.encode("utf-8")):
        return None
    return user

# ---------------------------
# Routes
# ---------------------------
@router.post("/signup", response_model=TokenOut, status_code=201)
async def signup(payload: SignupIn, db: AsyncSession = Depends(get_db)):
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    pwd_hash = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user = await create_user(payload.email, pwd_hash, payload.initial_deposit, db)
    token = make_token(str(user.id), user.email)

    return TokenOut(access_token=token, user_id=user.id)

@router.post("/login", response_model=TokenOut)
async def login(payload: LoginIn, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(payload.email, payload.password, db)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = make_token(str(user.id), user.email)
    return TokenOut(access_token=token, user_id=user.id)
