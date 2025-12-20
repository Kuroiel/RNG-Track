from typing import List, Optional, Dict
from pydantic import BaseModel
from datetime import datetime

# --- Auth Schemas ---

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    
    class Config:
        orm_mode = True

# --- Application Schemas ---

class OutcomeBase(BaseModel):
    name: str
    probability: float

class OutcomeCreate(OutcomeBase):
    pass

class Outcome(OutcomeBase):
    id: int
    event_id: int

    class Config:
        orm_mode = True

class EventBase(BaseModel):
    name: str

class EventCreate(EventBase):
    outcomes: List[OutcomeCreate]

class Event(EventBase):
    id: int
    game_id: int
    outcomes: List[Outcome] = []

    class Config:
        orm_mode = True

class GameBase(BaseModel):
    name: str

class GameCreate(GameBase):
    pass

class Game(GameBase):
    id: int
    events: List[Event] = []

    class Config:
        orm_mode = True

class LogBase(BaseModel):
    outcome_name: str

class LogCreate(LogBase):
    # We no longer ask for user_id here; we get it from the token
    pass

class Log(LogBase):
    id: int
    event_id: int
    user_id: int
    timestamp: datetime

    class Config:
        orm_mode = True

class StatsResponse(BaseModel):
    # Global Stats
    total_attempts: int
    outcomes: Dict[str, int]
    actual_rates: Dict[str, float]
    expected_rates: Dict[str, float]
    deviation: Dict[str, float]
    
    # User Specific Stats (Optional, populated if user is logged in)
    user_total_attempts: Optional[int] = 0
    user_outcomes: Optional[Dict[str, int]] = {}
    user_actual_rates: Optional[Dict[str, float]] = {}