from pydantic import BaseModel, ConfigDict 
from typing import List, Optional


class EventBase(BaseModel):
    name: str

class EventCreate(EventBase):
    pass

class Event(EventBase):
    id: int
    success_count: int
    failure_count: int
    game_id: int


    model_config = ConfigDict(from_attributes=True)



class GameBase(BaseModel):
    name: str
    rawg_id: Optional[int] = None
    image_url: Optional[str] = None

class GameCreate(GameBase):
    pass

class Game(GameBase):
    id: int
    events: List[Event] = []


    model_config = ConfigDict(from_attributes=True)