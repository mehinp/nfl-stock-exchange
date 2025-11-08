import uvicorn

if __name__ == "__main__":
    # Tell uvicorn to load the FastAPI instance from app/crud.py
    uvicorn.run("app.crud:app", host="0.0.0.0", port=8000, reload=True)
