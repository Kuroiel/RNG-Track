import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

from .models import Base 

load_dotenv()

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL:
    raise ValueError("No DATABASE_URL set for the application")

engine = create_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """
    This function connects to the database and creates all tables
    defined in models.py if they do not already exist.
    It should be called once when the application starts.
    """
    print("Initializing database...")

    Base.metadata.create_all(bind=engine)
    print("Database initialized successfully.")