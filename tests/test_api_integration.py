from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from backend.main import app

client = TestClient(app)


MOCK_RAWG_RESPONSE = {
    "results": [
        {
            "id": 3498,
            "name": "Grand Theft Auto V",
            "background_image": "https://media.rawg.io/media/games/456/456dea5e1c7e3cd07060c14e96612001.jpg"
        }
    ]
}


@patch('backend.main.httpx.AsyncClient')
def test_search_games_endpoint(MockAsyncClient):
    """
    Tests the /api/search-games/ endpoint.
    It mocks the external API call to RAWG to ensure the test is fast and reliable.
    """

    mock_response = MagicMock()
    mock_response.status_code = 200

    mock_response.json.return_value = MOCK_RAWG_RESPONSE
    

    mock_instance = MockAsyncClient.return_value.__aenter__.return_value
    mock_instance.get.return_value = mock_response


    response = client.get("/api/search-games/?query=gta")


    assert response.status_code == 200
    

    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Grand Theft Auto V"
    assert data[0]["rawg_id"] == 3498
    assert data[0]["image_url"] is not None