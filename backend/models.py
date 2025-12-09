from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Float, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime

class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    image_url = Column(String, nullable=True)

    events = relationship("Event", back_populates="game")

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id"))
    name = Column(String)
    probability = Column(Float) # Stored as 0.0 to 1.0

    game = relationship("Game", back_populates="events")
    outcomes = relationship("Outcome", back_populates="event")
    logs = relationship("Log", back_populates="event")

class Outcome(Base):
    __tablename__ = "outcomes"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"))
    name = Column(String)
    is_success = Column(Boolean, default=False)

    event = relationship("Event", back_populates="outcomes")
    logs = relationship("Log", back_populates="outcome")

class Log(Base):
    __tablename__ = "logs"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"))
    outcome_id = Column(Integer, ForeignKey("outcomes.id"))
    user_id = Column(String, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    is_imported = Column(Boolean, default=False) # New field for Req #4

    event = relationship("Event", back_populates="logs")
    outcome = relationship("Outcome", back_populates="logs")