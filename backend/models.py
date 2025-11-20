from sqlalchemy import create_engine, Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship, declarative_base


Base = declarative_base()


class Game(Base):
    __tablename__ = 'games'  

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    rawg_id = Column(Integer, nullable=True) 
    image_url = Column(String, nullable=True) 


    events = relationship("Event", back_populates="game", cascade="all, delete-orphan")


class Event(Base):
    __tablename__ = 'events' 


    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    success_count = Column(Integer, default=0)
    failure_count = Column(Integer, default=0)
    

    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)


    game = relationship("Game", back_populates="events")