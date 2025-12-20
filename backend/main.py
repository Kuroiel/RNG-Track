import os
import httpx # Already in your requirements.txt
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import timedelta, datetime
from jose import JWTError, jwt
from passlib.context import CryptContext

from . import models, schemas, database

# --- Configuration ---
# SECURITY: Load from env, fallback only for local dev (unsafe for prod)
SECRET_KEY = os.getenv("SECRET_KEY", "UNSAFE_DEFAULT_KEY_CHANGE_ON_PROD")
RECAPTCHA_SECRET_KEY = os.getenv("RECAPTCHA_SECRET_KEY") 

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 24 hours

models.Base.metadata.create_all(bind=database.engine)

app = FastAPI()

# --- Security & Auth Setup ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def verify_recaptcha(token: str):
    if not RECAPTCHA_SECRET_KEY:
        # If no key configured, skip verification
        return True
        
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://www.google.com/recaptcha/api/siteverify",
            data={
                "secret": RECAPTCHA_SECRET_KEY,
                "response": token
            }
        )
        result = response.json()
        
        return result.get("success", False) and result.get("score", 0.0) >= 0.5

# --- Dependencies ---
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = schemas.TokenData(username=username)
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.username == token_data.username).first()
    if user is None:
        raise credentials_exception
    return user

# --- Auth Endpoints ---

@app.post("/register", response_model=schemas.Token)
async def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # 1. Verify Captcha
    is_valid_captcha = await verify_recaptcha(user.captcha_token)
    if not is_valid_captcha:
        raise HTTPException(status_code=400, detail="Invalid reCAPTCHA. Please try again.")

    # 2. Check existing user
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    # 3. Create User
    hashed_password = get_password_hash(user.password)
    new_user = models.User(username=user.username, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token = create_access_token(data={"sub": new_user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/token", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# --- Game/Event Endpoints ---

@app.post("/games/", response_model=schemas.Game)
def create_game(game: schemas.GameCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_game = models.Game(name=game.name)
    db.add(db_game)
    db.commit()
    db.refresh(db_game)
    return db_game

@app.get("/games/", response_model=List[schemas.Game])
def read_games(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Game).offset(skip).limit(limit).all()

@app.post("/events/", response_model=schemas.Event)
def create_event(event: schemas.EventCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_event = models.Event(name=event.name, game_id=event.game_id)
    db.add(db_event)
    db.commit()
    db.refresh(db_event)

    for outcome in event.outcomes:
        db_outcome = models.Outcome(name=outcome.name, probability=outcome.probability, event_id=db_event.id)
        db.add(db_outcome)
    
    db.commit()
    db.refresh(db_event)
    return db_event

@app.get("/events/{game_id}", response_model=List[schemas.Event])
def read_events(game_id: int, db: Session = Depends(get_db)):
    return db.query(models.Event).filter(models.Event.game_id == game_id).all()

# --- Logging Endpoints ---

@app.post("/logs/", response_model=schemas.Log)
def create_log(log: schemas.LogCreate, event_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 1. Validate Event existence
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # 2. Validate Outcome exists in this event (Bug Fix)
    valid_outcomes = [o.name for o in event.outcomes]
    if log.outcome_name not in valid_outcomes:
        raise HTTPException(status_code=400, detail=f"Invalid outcome. Must be one of: {valid_outcomes}")
    
    db_log = models.Log(event_id=event_id, outcome_name=log.outcome_name, user_id=current_user.id)
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

@app.post("/logs/bulk", status_code=201)
def create_bulk_logs(bulk_data: schemas.BulkLogCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Optimization: Create many logs in one transaction
    if bulk_data.count > 1000: # Backend enforce limit
        raise HTTPException(status_code=400, detail="Batch size limit exceeded (max 1000)")

    event = db.query(models.Event).filter(models.Event.id == bulk_data.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    valid_outcomes = [o.name for o in event.outcomes]
    if bulk_data.outcome_name not in valid_outcomes:
        raise HTTPException(status_code=400, detail=f"Invalid outcome. Must be one of: {valid_outcomes}")

    logs_to_create = []
    for _ in range(bulk_data.count):
        logs_to_create.append(
            models.Log(
                event_id=bulk_data.event_id,
                outcome_name=bulk_data.outcome_name,
                user_id=current_user.id
            )
        )
    
    db.bulk_save_objects(logs_to_create)
    db.commit()
    return {"message": f"Successfully logged {bulk_data.count} items"}

# --- Stats Logic ---

@app.get("/stats/{event_id}", response_model=schemas.StatsResponse)
def read_stats(event_id: int, token: Optional[str] = None, db: Session = Depends(get_db)):
    # 1. Get Event and defined Outcomes
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    defined_outcomes = {o.name: o.probability for o in event.outcomes}
    
    # 2. Get Global Counts
    global_counts_query = db.query(
        models.Log.outcome_name, func.count(models.Log.id)
    ).filter(models.Log.event_id == event_id).group_by(models.Log.outcome_name).all()
    
    global_counts = {name: count for name, count in global_counts_query}
    total_attempts = sum(global_counts.values())

    # 3. Calculate Global Stats
    actual_rates = {}
    expected_rates = {}
    deviation = {}

    for name, prob in defined_outcomes.items():
        count = global_counts.get(name, 0)
        rate = (count / total_attempts) * 100 if total_attempts > 0 else 0.0
        actual_rates[name] = rate
        expected_rates[name] = prob
        deviation[name] = rate - prob

    # 4. Get User Stats (if logged in)
    user_counts = {}
    user_total = 0
    user_actual_rates = {}
    
    current_user = None
    if token and token != "null":
        clean_token = token.replace("Bearer ", "") if token.startswith("Bearer ") else token
        try:
            payload = jwt.decode(clean_token, SECRET_KEY, algorithms=[ALGORITHM])
            username = payload.get("sub")
            if username:
                current_user = db.query(models.User).filter(models.User.username == username).first()
        except:
            pass 

    if current_user:
        user_counts_query = db.query(
            models.Log.outcome_name, func.count(models.Log.id)
        ).filter(
            models.Log.event_id == event_id, 
            models.Log.user_id == current_user.id
        ).group_by(models.Log.outcome_name).all()
        
        user_counts = {name: count for name, count in user_counts_query}
        user_total = sum(user_counts.values())
        
        for name in defined_outcomes.keys():
            count = user_counts.get(name, 0)
            rate = (count / user_total) * 100 if user_total > 0 else 0.0
            user_actual_rates[name] = rate

    return {
        "total_attempts": total_attempts,
        "outcomes": global_counts,
        "actual_rates": actual_rates,
        "expected_rates": expected_rates,
        "deviation": deviation,
        "user_total_attempts": user_total,
        "user_outcomes": user_counts,
        "user_actual_rates": user_actual_rates
    }