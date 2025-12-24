from pydantic import BaseModel, EmailStr, validator
from typing import Optional, List
import re

# --- Shared Properties ---
class UserBase(BaseModel):
    email: EmailStr

# --- Auth Schemas ---
class UserCreate(UserBase):
    password: str

    @validator('password')
    def validate_password(cls, v):
        """
        Enforce password complexity:
        - At least 8 chars
        - At least one uppercase
        - At least one lowercase
        - At least one digit
        """
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r"[A-Z]", v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r"[a-z]", v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r"\d", v):
            raise ValueError('Password must contain at least one number')
        return v

class UserLogin(UserBase):
    password: str
    recaptcha_token: str 

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# --- Password Reset Schemas ---
class ForgotPassword(BaseModel):
    email: EmailStr

class ResetPassword(BaseModel):
    token: str
    new_password: str

    @validator('new_password')
    def validate_password(cls, v):
        # Re-use logic or call a shared helper
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r"[A-Z]", v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r"[a-z]", v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r"\d", v):
            raise ValueError('Password must contain at least one number')
        return v

# --- Data Schemas ---
class OutcomeBase(BaseModel):
    name: str
    expected_rate: float

class Outcome(OutcomeBase):
    id: int
    class Config:
        orm_mode = True

class EventBase(BaseModel):
    name: str

class Event(EventBase):
    id: int
    game_id: int
    outcomes: List[Outcome] = []
    class Config:
        orm_mode = True

class GameBase(BaseModel):
    name: str
    icon_url: Optional[str] = None

class Game(GameBase):
    id: int
    events: List[Event] = []
    class Config:
        orm_mode = True

class LogBase(BaseModel):
    event_id: int
    result: bool

class LogCreate(LogBase):
    pass

class Log(LogBase):
    id: int
    user_id: int
    class Config:
        orm_mode = True

class Stats(BaseModel):
    event_name: str
    total_attempts: int
    success_count: int
    actual_rate: float
    expected_rate: float
    deviation: float