from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app, get_db
from backend import models
import pytest

# Setup in-memory SQLite for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

models.Base.metadata.create_all(bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def run_around_tests():
    # Code that runs before each test
    models.Base.metadata.drop_all(bind=engine)
    models.Base.metadata.create_all(bind=engine)
    yield
    # Code that runs after each test

def test_read_games_empty():
    response = client.get("/games/")
    assert response.status_code == 200
    assert response.json() == []

def test_read_games_with_data():
    # Create a game
    db = TestingSessionLocal()
    game = models.Game(name="Test Game", icon_url="http://test.com/icon.png")
    db.add(game)
    db.commit()
    db.close()

    response = client.get("/games/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Test Game"
