import os
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
import httpx

from . import models, schemas, database

# Create tables if they don't exist
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI()

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows all origins
    allow_credentials=True,
    allow_methods=["*"], # Allows all methods
    allow_headers=["*"], # Allows all headers
)

# Dependency to get DB session
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

# RAWG API Configuration
RAWG_API_KEY = os.getenv("RAWG_API_KEY") 
RAWG_BASE_URL = "https://api.rawg.io/api/games"

# --- Game Routes ---

@app.get("/games/search", response_model=List[schemas.GameBase])
async def search_games(query: str):
    if not RAWG_API_KEY:
        raise HTTPException(status_code=500, detail="Server Error: RAWG API Key not configured.")

    async with httpx.AsyncClient() as client:
        response = await client.get(
            RAWG_BASE_URL,
            params={"key": RAWG_API_KEY, "search": query, "page_size": 5}
        )
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch data from RAWG")
        
        data = response.json()
        results = []
        for item in data.get("results", []):
            results.append(schemas.GameBase(
                name=item["name"],
                rawg_id=item["id"],
                image_url=item.get("background_image")
            ))
        return results

@app.post("/games", response_model=schemas.Game)
def create_game(game: schemas.GameCreate, db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.rawg_id == game.rawg_id).first()
    if db_game:
        return db_game
    
    new_game = models.Game(
        name=game.name,
        rawg_id=game.rawg_id,
        image_url=game.image_url
    )
    db.add(new_game)
    db.commit()
    db.refresh(new_game)
    return new_game

@app.get("/games", response_model=List[schemas.Game])
def list_games(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Game).offset(skip).limit(limit).all()

# --- Event & Outcome Routes ---

@app.post("/events", response_model=schemas.Event)
def create_event(event: schemas.EventCreate, db: Session = Depends(get_db)):
    # 1. Create the Event
    db_event = models.Event(
        game_id=event.game_id,
        name=event.name,
        description=event.description,
        created_by=event.created_by
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)

    # 2. Create the Outcomes
    for outcome in event.outcomes:
        db_outcome = models.Outcome(
            event_id=db_event.id,
            name=outcome.name,
            expected_probability=outcome.expected_probability
        )
        db.add(db_outcome)
    
    db.commit()
    db.refresh(db_event)
    
    # Construct response
    response_outcomes = []
    for o in db_event.outcomes:
        response_outcomes.append(schemas.OutcomeDisplay(
            id=o.id,
            name=o.name,
            expected_probability=o.expected_probability,
            global_count=0,
            user_count=0
        ))

    return schemas.Event(
        id=db_event.id,
        game_id=db_event.game_id,
        name=db_event.name,
        description=db_event.description,
        created_by=db_event.created_by,
        outcomes=response_outcomes
    )

@app.get("/events/{game_id}", response_model=List[schemas.Event])
def get_events_for_game(
    game_id: int, 
    user_id: str = Query(..., description="The UUID of the current user"),
    db: Session = Depends(get_db)
):
    events = db.query(models.Event).filter(models.Event.game_id == game_id).all()
    results = []
    
    for event in events:
        outcomes_data = []
        # Accessing event.outcomes will crash if DB schema is old
        for outcome in event.outcomes:
            global_count = db.query(models.Log).filter(
                models.Log.outcome_id == outcome.id
            ).count()
            
            user_count = db.query(models.Log).filter(
                models.Log.outcome_id == outcome.id,
                models.Log.user_id == user_id
            ).count()

            outcomes_data.append(schemas.OutcomeDisplay(
                id=outcome.id,
                name=outcome.name,
                expected_probability=outcome.expected_probability,
                global_count=global_count,
                user_count=user_count
            ))

        results.append(schemas.Event(
            id=event.id,
            game_id=event.game_id,
            name=event.name,
            description=event.description,
            created_by=event.created_by,
            outcomes=outcomes_data
        ))
        
    return results

# --- Logging Routes ---

@app.post("/logs")
def log_outcome(log_data: schemas.LogCreate, db: Session = Depends(get_db)):
    outcome = db.query(models.Outcome).filter(models.Outcome.id == log_data.outcome_id).first()
    if not outcome:
        raise HTTPException(status_code=404, detail="Outcome not found")

    new_log = models.Log(
        outcome_id=log_data.outcome_id,
        user_id=log_data.user_id
    )
    db.add(new_log)
    db.commit()
    return {"status": "success", "message": "Log recorded"}

# --- UTILITY ROUTE TO FIX DATABASE ---
@app.get("/force-reset-db")
def force_reset_db():
    """
    WARNING: This deletes all data and recreates tables.
    Run this once to fix the '500 Internal Server Error' caused by schema mismatch.
    """
    try:
        models.Base.metadata.drop_all(bind=database.engine)
        models.Base.metadata.create_all(bind=database.engine)
        return {"status": "Database successfully wiped and recreated."}
    except Exception as e:
        return {"status": "Error", "details": str(e)}