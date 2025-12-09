from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class OutcomeBase(BaseModel):
    name: str
    is_success: bool

class OutcomeCreate(OutcomeBase):
    pass

class Outcome(OutcomeBase):
    id: int
    event_id: int

    class Config:
        orm_mode = True

class EventBase(BaseModel):
    name: str
    probability: float

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
    image_url: Optional[str] = None

class GameCreate(GameBase):
    pass

class Game(GameBase):
    id: int
    events: List[Event] = []

    class Config:
        orm_mode = True

class LogBase(BaseModel):
    event_id: int
    outcome_id: int
    user_id: str

class LogCreate(LogBase):
    # Added for Bulk Add (#7) and Import (#4)
    count: Optional[int] = 1 
    is_imported: Optional[bool] = False

class Log(LogBase):
    id: int
    timestamp: datetime
    is_imported: bool

    class Config:
        orm_mode = True