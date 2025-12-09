import sys
import os

# --- DEPLOYMENT FIX: Add current directory to sys.path ---
# This ensures Python finds 'models.py' and 'database.py' even if run from root
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)
# ---------------------------------------------------------

from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional

# Now these imports will work correctly on Render
import models
import schemas
from database import SessionLocal, engine

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

# --- SERVE FRONTEND (Makes deployment easier) ---
@app.get("/")
async def read_index():
    # Looks for index.html in the folder above 'backend'
    file_path = os.path.join(current_dir, "../index.html")
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return {"error": "index.html not found"}

@app.get("/script.js")
async def read_script():
    # Looks for script.js in the folder above 'backend'
    file_path = os.path.join(current_dir, "../script.js")
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return {"error": "script.js not found"}
# ------------------------------------------------

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

@app.get("/games/my/", response_model=List[schemas.Game])
def read_user_games(user_id: str, db: Session = Depends(get_db)):
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
    created_logs = []
    count = log.count if log.count and log.count > 0 else 1
    
    for _ in range(count):
        db_log = models.Log(
            event_id=log.event_id,
            outcome_id=log.outcome_id,
            user_id=log.user_id,
            is_imported=log.is_imported
        )
        db.add(db_log)
        created_logs.append(db_log)
    
    db.commit()
    return created_logs

@app.get("/stats/{event_id}")
def read_stats(event_id: int, user_id: Optional[str] = None, db: Session = Depends(get_db)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    query = db.query(models.Log).filter(models.Log.event_id == event_id)
    
    if user_id:
        query = query.filter(models.Log.user_id == user_id)
    else:
        query = query.filter(models.Log.is_imported == False)

    logs = query.all()
    total = len(logs)
    
    outcome_counts = {}
    success_count = 0

    for log in logs:
        o_id = log.outcome_id
        if o_id not in outcome_counts:
            outcome_counts[o_id] = 0
        outcome_counts[o_id] += 1
        
        outcome = next((o for o in event.outcomes if o.id == o_id), None)
        if outcome and outcome.is_success:
            success_count += 1

    expected_hits = total * event.probability
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

@app.get("/logs/export/")
def export_user_logs(user_id: str, db: Session = Depends(get_db)):
    logs = db.query(models.Log).filter(models.Log.user_id == user_id).all()
    return logs