import os
import httpx
from dotenv import load_dotenv

from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict

from . import models, schemas
from .database import SessionLocal, engine, init_db

from fastapi.middleware.cors import CORSMiddleware

load_dotenv()
RAWG_API_KEY = os.getenv("RAWG_API_KEY")

init_db()
app = FastAPI(
    title="RNG event track",
    description="An API for tracking and auditing random events in your favorite games.",
    version="1.0.0",
)

origins = [
    "https://kuroiel.github.io",  
    "http://localhost:8001",     
    "http://127.0.0.1:8001",     
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,      
    allow_credentials=True,
    allow_methods=["*"],        
    allow_headers=["*"],    
)

@app.get("/")
def read_root():
    """A simple health check endpoint."""
    return {"status": "ok", "message": "RNG API is running!"}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/api/search-games/")
async def search_games(query: str):
    """
    Search for games using the external RAWG.io API.
    This endpoint is a proxy to avoid exposing our API key to the frontend.
    """
    if not query:
        return []
    if not RAWG_API_KEY:
        raise HTTPException(status_code=500, detail="RAWG API key is not configured on the server")

    search_url = f"https://api.rawg.io/api/games"
    params = {
        "key": RAWG_API_KEY,
        "search": query,
        "page_size": 5 
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(search_url, params=params)
            response.raise_for_status() 
        except httpx.RequestError as exc:
            raise HTTPException(status_code=503, detail=f"Error communicating with RAWG API: {exc}")


    rawg_data = response.json()
    results = []
    for game in rawg_data.get("results", []):
        results.append({
            "name": game.get("name"),
            "rawg_id": game.get("id"),
            "image_url": game.get("background_image")
        })
    
    return results



@app.post("/api/games/", response_model=schemas.Game)
def create_game(game: schemas.GameCreate, db: Session = Depends(get_db)):
    """
    Create a new game profile.
    Checks if a game with the same name already exists to prevent duplicates.
    """
    db_game = db.query(models.Game).filter(models.Game.name == game.name).first()
    if db_game:
        raise HTTPException(status_code=400, detail="A game with this name already exists")
    
    new_game = models.Game(
        name=game.name, 
        rawg_id=game.rawg_id, 
        image_url=game.image_url
    )
    
    db.add(new_game)
    db.commit()
    db.refresh(new_game)
    return new_game

@app.get("/api/games/", response_model=List[schemas.Game])
def read_games(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    Retrieve a list of all game profiles.
    """
    games = db.query(models.Game).offset(skip).limit(limit).all()
    return games



@app.post("/api/games/{game_id}/events/", response_model=schemas.Event)
def create_event_for_game(game_id: int, event: schemas.EventCreate, db: Session = Depends(get_db)):
    """
    Create a new event tracker associated with a specific game.
    """
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    new_event = models.Event(**event.dict(), game_id=game_id)
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    return new_event

@app.get("/api/games/{game_id}/events/", response_model=List[schemas.Event])
def read_events_for_game(game_id: int, db: Session = Depends(get_db)):
    """
    Retrieve a list of all event trackers for a specific game.
    """
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game:
        raise HTTPException(status_code=404, detail="Game not found")
        
    return db_game.events


from .schemas import EventCreate 
from pydantic import BaseModel, constr

class LogCreate(BaseModel):
    outcome: constr(strip_whitespace=True, to_lower=True, pattern=r'^(success|failure)$')


@app.post("/api/events/{event_id}/log/", response_model=schemas.Event)
def log_event_outcome(event_id: int, log: LogCreate, db: Session = Depends(get_db)):
    """
    Log an outcome (success or failure) for a specific event tracker.
    This is the core action of the application.
    """

    db_event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not db_event:
        raise HTTPException(status_code=404, detail="Event not found")

    if log.outcome == "success":
        db_event.success_count += 1
    else: 
        db_event.failure_count += 1
    
    db.commit()
    db.refresh(db_event)
    return db_event