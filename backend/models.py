from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    rawg_id = Column(Integer, unique=True, index=True)
    image_url = Column(String)

    # Relationship to events (templates)
    events = relationship("Event", back_populates="game")


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id"))
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    created_by = Column(String, index=True)  # Stores the UUID of the user who created this template

    game = relationship("Game", back_populates="events")
    outcomes = relationship("Outcome", back_populates="event", cascade="all, delete-orphan")


class Outcome(Base):
    __tablename__ = "outcomes"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"))
    name = Column(String)
    expected_probability = Column(Float)  # e.g., 0.1 for 10% chance

    event = relationship("Event", back_populates="outcomes")
    logs = relationship("Log", back_populates="outcome")


class Log(Base):
    __tablename__ = "logs"

    id = Column(Integer, primary_key=True, index=True)
    outcome_id = Column(Integer, ForeignKey("outcomes.id"))
    user_id = Column(String, index=True)  # UUID of the user who logged this result
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    outcome = relationship("Outcome", back_populates="logs")