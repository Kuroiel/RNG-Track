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
SECRET_KEY = "CHANGE_THIS_SECRET_KEY_IN_PRODUCTION_9823409823"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

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

async def get_optional_user(token: Optional[str] = None, db: Session = Depends(get_db)):
    # Helper for stats endpoint where login is optional
    if not token:
        return None
    try:
        # Manually extract token if it comes as "Bearer <token>" string or just <token>
        if token.startswith("Bearer "):
            token = token.split(" ")[1]
        
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
        return db.query(models.User).filter(models.User.username == username).first()
    except:
        return None

# --- Auth Endpoints ---

@app.post("/register", response_model=schemas.Token)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
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

@app.get("/games/my/", response_model=List[schemas.Game])
def read_games_user_participated_in(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Optimized Join Query
    return db.query(models.Game).join(models.Event).join(models.Log).filter(models.Log.user_id == current_user.id).distinct().all()

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
    # Verify outcome exists for this event
    # (Optional validation step, can be added for strictness)
    
    db_log = models.Log(event_id=event_id, outcome_name=log.outcome_name, user_id=current_user.id)
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

# --- Stats Logic (Optimized) ---

@app.get("/stats/{event_id}", response_model=schemas.StatsResponse)
def read_stats(event_id: int, token: Optional[str] = None, db: Session = Depends(get_db)):
    # 1. Get Event and defined Outcomes
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    defined_outcomes = {o.name: o.probability for o in event.outcomes}
    
    # 2. Get Global Counts (Database Aggregation)
    # SELECT outcome_name, COUNT(*) FROM logs WHERE event_id = ... GROUP BY outcome_name
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
    
    # Check for user (handle manual token extraction since this is an optional auth endpoint)
    current_user = None
    if token:
        # Basic check to clean 'Bearer ' prefix if frontend sends it
        clean_token = token.replace("Bearer ", "") if token.startswith("Bearer ") else token
        if clean_token != "null": # frontend might send string "null"
            try:
                # Re-use dependency logic manually or use a helper
                payload = jwt.decode(clean_token, SECRET_KEY, algorithms=[ALGORITHM])
                username = payload.get("sub")
                if username:
                    current_user = db.query(models.User).filter(models.User.username == username).first()
            except:
                pass # Invalid token, just return global stats

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