from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Float, DateTime
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)
    # New fields for Auth & Recovery
    is_verified = Column(Boolean, default=False)
    verification_token = Column(String, nullable=True)
    reset_token = Column(String, nullable=True)
    reset_token_expires = Column(DateTime, nullable=True)

    logs = relationship("Log", back_populates="owner")

class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    icon_url = Column(String, nullable=True)

    events = relationship("Event", back_populates="game")

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    game_id = Column(Integer, ForeignKey("games.id"))
    
    game = relationship("Game", back_populates="events")
    outcomes = relationship("Outcome", back_populates="event")
    logs = relationship("Log", back_populates="event")

class Outcome(Base):
    __tablename__ = "outcomes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    expected_rate = Column(Float) # e.g., 0.05 for 5%
    event_id = Column(Integer, ForeignKey("events.id"))

    event = relationship("Event", back_populates="outcomes")

class Log(Base):
    __tablename__ = "logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    event_id = Column(Integer, ForeignKey("events.id"))
    # For simple "success/fail" tracking or specific outcome
    result = Column(Boolean) # True = Got the target, False = Missed
    
    owner = relationship("User", back_populates="logs")
    event = relationship("Event", back_populates="logs")