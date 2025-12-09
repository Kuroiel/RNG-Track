from fastapi import FastAPI, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import models, schemas
from database import SessionLocal, engine
from fastapi.middleware.cors import CORSMiddleware

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.post("/games/", response_model=schemas.Game)
def create_game(game: schemas.GameCreate, db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.name == game.name).first()
    if db_game:
        return db_game
    db_game = models.Game(name=game.name, image_url=game.image_url)
    db.add(db_game)
    db.commit()
    db.refresh(db_game)
    return db_game

@app.get("/games/", response_model=List[schemas.Game])
def read_games(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    games = db.query(models.Game).offset(skip).limit(limit).all()
    return games

# Req #5: Endpoint to get only games the user has interacted with
@app.get("/games/my/", response_model=List[schemas.Game])
def read_user_games(user_id: str, db: Session = Depends(get_db)):
    # Subquery to find distinct game_ids from user logs
    # Join Log -> Event -> Game
    user_game_ids = (
        db.query(models.Event.game_id)
        .join(models.Log, models.Log.event_id == models.Event.id)
        .filter(models.Log.user_id == user_id)
        .distinct()
    )
    
    games = db.query(models.Game).filter(models.Game.id.in_(user_game_ids)).all()
    return games

@app.post("/games/{game_id}/events/", response_model=schemas.Event)
def create_event(game_id: int, event: schemas.EventCreate, db: Session = Depends(get_db)):
    # Req #1: Handle Percentage Input. 
    # If user sends 42, we store 0.42. If user sends 0.5, we store 0.005.
    # We assume input is always percentage (0-100).
    final_prob = event.probability / 100.0
    
    db_event = models.Event(name=event.name, probability=final_prob, game_id=game_id)
    db.add(db_event)
    db.commit()
    db.refresh(db_event)

    for outcome in event.outcomes:
        db_outcome = models.Outcome(name=outcome.name, is_success=outcome.is_success, event_id=db_event.id)
        db.add(db_outcome)
    
    db.commit()
    db.refresh(db_event)
    return db_event

@app.post("/logs/", response_model=List[schemas.Log])
def create_log(log: schemas.LogCreate, db: Session = Depends(get_db)):
    # Req #7: Bulk Add Logic
    created_logs = []
    count = log.count if log.count and log.count > 0 else 1
    
    for _ in range(count):
        db_log = models.Log(
            event_id=log.event_id,
            outcome_id=log.outcome_id,
            user_id=log.user_id,
            is_imported=log.is_imported # Req #4: Track imports
        )
        db.add(db_log)
        created_logs.append(db_log)
    
    db.commit()
    # We don't refresh all 100 logs for speed, just return the list
    return created_logs

@app.get("/stats/{event_id}")
def read_stats(event_id: int, user_id: Optional[str] = None, db: Session = Depends(get_db)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    query = db.query(models.Log).filter(models.Log.event_id == event_id)
    
    if user_id:
        # Personal Stats: Show everything (organic + imported)
        query = query.filter(models.Log.user_id == user_id)
    else:
        # Global Stats: Show ONLY organic (Req #4)
        query = query.filter(models.Log.is_imported == False)

    logs = query.all()
    total = len(logs)
    
    outcome_counts = {}
    success_count = 0

    for log in logs:
        # Count outcomes
        o_id = log.outcome_id
        if o_id not in outcome_counts:
            outcome_counts[o_id] = 0
        outcome_counts[o_id] += 1
        
        # Check success for analysis
        # (Optimized: we could join Outcome table, but simple lookup is fine for now)
        outcome = next((o for o in event.outcomes if o.id == o_id), None)
        if outcome and outcome.is_success:
            success_count += 1

    # Req #8: Analysis Data
    # Expected hits = Total * Probability
    expected_hits = total * event.probability
    
    # Deviation (Difference between actual and expected)
    deviation = success_count - expected_hits
    
    return {
        "event_name": event.name,
        "total_logs": total,
        "probability": event.probability,
        "outcomes": outcome_counts,
        "analysis": {
            "success_count": success_count,
            "expected_hits": round(expected_hits, 2),
            "deviation": round(deviation, 2),
            "is_above_avg": deviation > 0
        }
    }

# Endpoint for Req #2: Export Data
@app.get("/logs/export/")
def export_user_logs(user_id: str, db: Session = Depends(get_db)):
    logs = db.query(models.Log).filter(models.Log.user_id == user_id).all()
    return logs