from typing import List, Optional
from pydantic import BaseModel

# --- Game Schemas ---
class GameBase(BaseModel):
    name: str
    rawg_id: int
    image_url: Optional[str] = None

class GameCreate(GameBase):
    pass

class Game(GameBase):
    id: int
    
    class Config:
        orm_mode = True

# --- Outcome Schemas ---
class OutcomeBase(BaseModel):
    name: str
    expected_probability: float

class OutcomeCreate(OutcomeBase):
    pass

class OutcomeDisplay(OutcomeBase):
    id: int
    # These fields are calculated dynamically in the API, not stored directly in this table
    global_count: int = 0
    user_count: int = 0

    class Config:
        orm_mode = True

# --- Event Schemas ---
class EventBase(BaseModel):
    name: str
    description: Optional[str] = None

class EventCreate(EventBase):
    game_id: int
    created_by: str # User UUID
    outcomes: List[OutcomeCreate]

class Event(EventBase):
    id: int
    game_id: int
    created_by: str
    outcomes: List[OutcomeDisplay] = []

    class Config:
        orm_mode = True

# --- Log Schemas ---
class LogCreate(BaseModel):
    outcome_id: int
    user_id: str