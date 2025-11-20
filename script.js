
const API_BASE_URL = "https://rng-track.onrender.com";


const AppState = {
    games: [],
    selectedGameId: null,
    events: [],
    selectedEventId: null,
};


const DOMElements = {
    gameList: document.getElementById('game-list'),
    gameSearchInput: document.getElementById('game-search-input'),
    searchResults: document.getElementById('search-results'),
    eventSelectorCard: document.getElementById('event-selector-card'),
    eventSelectDropdown: document.getElementById('event-select-dropdown'),
    newEventNameInput: document.getElementById('new-event-name-input'),
    addEventButton: document.getElementById('add-event-button'),
    loggerCard: document.getElementById('logger-card'),
    currentTrackerName: document.getElementById('current-tracker-name'),
    logFailureButton: document.getElementById('log-failure-button'),
    logSuccessButton: document.getElementById('log-success-button'),
    successCount: document.getElementById('success-count'),
    failureCount: document.getElementById('failure-count'),
    totalCount: document.getElementById('total-count'),
    observedRate: document.getElementById('observed-rate'),
};


async function apiFetch(endpoint, options = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'An API error occurred');
    }
    return response.json();
}

const API = {
    getGames: () => apiFetch('/api/games/'),
    searchGames: (query) => apiFetch(`/api/search-games/?query=${encodeURIComponent(query)}`),
    createGame: (gameData) => apiFetch('/api/games/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gameData),
    }),
    getEventsForGame: (gameId) => apiFetch(`/api/games/${gameId}/events/`),
    createEvent: (gameId, eventData) => apiFetch(`/api/games/${gameId}/events/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData),
    }),
    logOutcome: (eventId, outcome) => apiFetch(`/api/events/${eventId}/log/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
    }),
};



function renderGameList() {
    DOMElements.gameList.innerHTML = ''; 
    AppState.games.forEach(game => {
        const gameDiv = document.createElement('div');
        gameDiv.className = 'game-item';
        gameDiv.dataset.gameId = game.id;
        gameDiv.innerHTML = `
            <img src="${game.image_url || 'https://via.placeholder.com/50'}" alt="${game.name}">
            <span>${game.name}</span>
        `;
        if (game.id === AppState.selectedGameId) {
            gameDiv.classList.add('selected');
        }
        DOMElements.gameList.appendChild(gameDiv);
    });
}

function renderSearchResults(results) {
    DOMElements.searchResults.innerHTML = '';
    results.forEach(game => {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'search-result-item';
        resultDiv.innerHTML = `
            <img src="${game.image_url || 'https://via.placeholder.com/50'}" alt="${game.name}">
            <span>${game.name}</span>
        `;

        resultDiv.addEventListener('click', () => handleCreateGame(game));
        DOMElements.searchResults.appendChild(resultDiv);
    });
}

function renderEventDropdown() {
    DOMElements.eventSelectDropdown.innerHTML = '<option value="">-- Select or Create a Tracker --</option>';
    AppState.events.forEach(event => {
        const option = document.createElement('option');
        option.value = event.id;
        option.textContent = event.name;
        if (event.id === AppState.selectedEventId) {
            option.selected = true;
        }
        DOMElements.eventSelectDropdown.appendChild(option);
    });
}

function updateStatsDisplay(event) {
    const successes = event.success_count;
    const failures = event.failure_count;
    const total = successes + failures;
    DOMElements.successCount.textContent = successes;
    DOMElements.failureCount.textContent = failures;
    DOMElements.totalCount.textContent = total;
    DOMElements.observedRate.textContent = total > 0 ? `${((successes / total) * 100).toFixed(2)}%` : 'N/A';
}


async function handleCreateGame(gameData) {
    try {
        await API.createGame(gameData);
        DOMElements.gameSearchInput.value = '';
        DOMElements.searchResults.innerHTML = '';
        await initializeGameList(); // Refresh the list
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function handleGameSelection(gameId) {
    AppState.selectedGameId = gameId;
    AppState.selectedEventId = null;
    renderGameList(); 
    DOMElements.loggerCard.classList.add('hidden');

    try {
        AppState.events = await API.getEventsForGame(gameId);
        renderEventDropdown();
        DOMElements.eventSelectorCard.classList.remove('hidden');
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function handleEventCreation() {
    const eventName = DOMElements.newEventNameInput.value.trim();
    if (!eventName || !AppState.selectedGameId) return;

    try {
        const newEvent = await API.createEvent(AppState.selectedGameId, { name: eventName });
        AppState.events.push(newEvent);
        AppState.selectedEventId = newEvent.id;
        DOMElements.newEventNameInput.value = '';
        renderEventDropdown();
        handleEventSelection(newEvent.id);
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

function handleEventSelection(eventId) {
    if (!eventId) {
        DOMElements.loggerCard.classList.add('hidden');
        return;
    }
    AppState.selectedEventId = parseInt(eventId);
    const selectedEvent = AppState.events.find(e => e.id === AppState.selectedEventId);
    if (selectedEvent) {
        DOMElements.currentTrackerName.textContent = selectedEvent.name;
        updateStatsDisplay(selectedEvent);
        DOMElements.loggerCard.classList.remove('hidden');
    }
}

async function handleLogOutcome(outcome) {
    if (!AppState.selectedEventId) return;
    try {
        const updatedEvent = await API.logOutcome(AppState.selectedEventId, outcome);
        const eventIndex = AppState.events.findIndex(e => e.id === updatedEvent.id);
        if (eventIndex !== -1) {
            AppState.events[eventIndex] = updatedEvent;
        }
        updateStatsDisplay(updatedEvent);
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}


async function initializeGameList() {
    try {
        AppState.games = await API.getGames();
        renderGameList();
    } catch (error) {
        alert(`Failed to load games. Is the backend running? \nError: ${error.message}`);
    }
}


document.addEventListener('DOMContentLoaded', () => {

    initializeGameList();

    DOMElements.gameSearchInput.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        if (query.length < 3) {
            DOMElements.searchResults.innerHTML = '';
            return;
        }
        const results = await API.searchGames(query);
        renderSearchResults(results);
    });

    DOMElements.gameList.addEventListener('click', (e) => {
        const gameItem = e.target.closest('.game-item');
        if (gameItem) {
            handleGameSelection(parseInt(gameItem.dataset.gameId));
        }
    });

    DOMElements.addEventButton.addEventListener('click', handleEventCreation);
    
    DOMElements.eventSelectDropdown.addEventListener('change', (e) => {
        handleEventSelection(e.target.value);
    });

    DOMElements.logFailureButton.addEventListener('click', () => handleLogOutcome('failure'));
    DOMElements.logSuccessButton.addEventListener('click', () => handleLogOutcome('success'));
});