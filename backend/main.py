from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import timedelta, datetime, timezone
from typing import List
import requests
import os
import secrets
import logging

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType

# Local imports
import models
import schemas
import database
from database import engine, get_db

# Auth
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

# --- Configuration ---
SECRET_KEY = os.getenv("SECRET_KEY", "YOUR_SECRET_KEY") # CHANGE THIS IN PROD
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 Days
RECAPTCHA_SECRET = os.getenv("RECAPTCHA_SECRET", "YOUR_RECAPTCHA_SECRET")

# Email Config (Requires Env Vars)
conf = ConnectionConfig(
    MAIL_USERNAME = os.getenv("MAIL_USERNAME", "user@example.com"),
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "password"),
    MAIL_FROM = os.getenv("MAIL_FROM", "user@example.com"),
    MAIL_PORT = int(os.getenv("MAIL_PORT", 587)),
    MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.gmail.com"),
    MAIL_STARTTLS = True,
    MAIL_SSL_TLS = False,
    USE_CREDENTIALS = True,
    VALIDATE_CERTS = True
)

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5500", "http://127.0.0.1:5500", "https://kuroiel.github.io"], # Restrict to known frontends
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- Helpers ---

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_recaptcha(token: str):
    # Skip verification for testing/dev if secret is default or not set
    if RECAPTCHA_SECRET == "YOUR_RECAPTCHA_SECRET":
        logger.warning("Recaptcha Secret is default. Skipping verification.")
        return True

    url = "https://www.google.com/recaptcha/api/siteverify"
    payload = {
        "secret": RECAPTCHA_SECRET,
        "response": token
    }
    try:
        response = requests.post(url, data=payload, timeout=10)
        result = response.json()
        return result.get("success", False)
    except Exception as e:
        logger.error(f"Recaptcha verification failed: {e}")
        return False

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = schemas.TokenData(email=email)
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.email == token_data.email).first()
    if user is None:
        raise credentials_exception
    return user

# --- Email Helpers ---

async def send_email_async(subject: str, email_to: str, body: dict):
    # This is a basic template. In a real app, use HTML templates.
    html = f"""
    <p>{body.get("title")}</p>
    <p>{body.get("msg")}</p>
    """
    message = MessageSchema(
        subject=subject,
        recipients=[email_to],
        body=html,
        subtype=MessageType.html
    )
    fm = FastMail(conf)
    try:
        await fm.send_message(message)
    except Exception as e:
        print(f"Email failed to send: {e}") 
        # We don't want to crash the request if email fails, just log it

# --- Auth Endpoints ---

@app.post("/register", response_model=schemas.Token)
async def register(user: schemas.UserCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # 1. Check existing user
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # 2. Create User
    hashed_password = get_password_hash(user.password)
    new_user = models.User(
        email=user.email, 
        hashed_password=hashed_password,
        is_verified=False # Set to True if you want to skip email verif for now
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # 3. Create Access Token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": new_user.email}, expires_delta=access_token_expires
    )

    # 4. Send Welcome Email (Optional)
    # background_tasks.add_task(send_email_async, "Welcome to RNG Track", user.email, {"title": "Welcome!", "msg": "Thanks for signing up."})

    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/token", response_model=schemas.Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # Note: OAuth2PasswordRequestForm expects 'username' field, frontend must send email as username
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/forgot-password")
async def forgot_password(payload: schemas.ForgotPassword, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user:
        # Don't reveal if user exists
        return {"msg": "If this email exists, a reset link has been sent."}
    
    # Generate Reset Token
    token = secrets.token_urlsafe(32)
    user.reset_token = token
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
    db.commit()

    # Send Email
    # In production, this link points to your frontend reset page
    reset_link = f"https://kuroiel.github.io/RNG-Track/?reset_token={token}"
    email_body = {
        "title": "Password Reset Request",
        "msg": f"Click here to reset your password: <a href='{reset_link}'>Reset Password</a>"
    }
    background_tasks.add_task(send_email_async, "Reset Password", user.email, email_body)

    return {"msg": "If this email exists, a reset link has been sent."}

@app.post("/reset-password")
async def reset_password(payload: schemas.ResetPassword, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.reset_token == payload.token).first()
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid token")
    
    if user.reset_token_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Token expired")

    user.hashed_password = get_password_hash(payload.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()

    return {"msg": "Password updated successfully"}

# --- Data Endpoints ---

@app.get("/games/", response_model=List[schemas.Game])
def read_games(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    games = db.query(models.Game).offset(skip).limit(limit).all()
    return games

@app.get("/events/{game_id}", response_model=List[schemas.Event])
def read_events(game_id: int, db: Session = Depends(get_db)):
    events = db.query(models.Event).filter(models.Event.game_id == game_id).all()
    return events

@app.get("/stats/{event_id}", response_model=schemas.Stats)
def calculate_stats(event_id: int, db: Session = Depends(get_db)):
    # 7.1 Optimization: Use SQL Aggregation
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Count Total
    total_attempts = db.query(func.count(models.Log.id)).filter(models.Log.event_id == event_id).scalar()
    
    # Count Successes (result == True)
    success_count = db.query(func.count(models.Log.id)).filter(
        models.Log.event_id == event_id, 
        models.Log.result == True
    ).scalar()

    # Get expected rate (Assuming single outcome for simplicity per event, or taking the first)
    # If your model supports multiple outcomes per event, logic might need adjustment.
    # Here we take the first outcome's rate associated with the event.
    outcome = db.query(models.Outcome).filter(models.Outcome.event_id == event_id).first()
    expected_rate = outcome.expected_rate if outcome else 0.0

    if total_attempts > 0:
        actual_rate = (success_count / total_attempts) * 100
        # 7.3 Fix Rounding
        actual_rate = round(actual_rate, 4)
    else:
        actual_rate = 0.0
    
    # Convert expected from 0.05 to 5.0 for comparison if needed, or keep normalized.
    # Assuming outcome.expected_rate is like 0.05 (5%)
    expected_rate_pct = expected_rate * 100
    
    deviation = actual_rate - expected_rate_pct
    deviation = round(deviation, 4)

    return schemas.Stats(
        event_name=event.name,
        total_attempts=total_attempts,
        success_count=success_count,
        actual_rate=actual_rate,
        expected_rate=expected_rate_pct,
        deviation=deviation
    )

@app.post("/logs/", response_model=schemas.Log)
def create_log(log: schemas.LogCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_log = models.Log(**log.dict(), user_id=current_user.id)
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

@app.post("/logs/bulk")
def create_logs_bulk(logs: List[schemas.LogCreate], current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Optimization: Use bulk_save_objects if needed, but simple loop is fine for <100 items
    db_logs = [models.Log(**log.dict(), user_id=current_user.id) for log in logs]
    db.add_all(db_logs)
    db.commit()
    return {"msg": f"{len(logs)} logs added"}