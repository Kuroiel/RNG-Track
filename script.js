const API_URL = ""; // Relative path for production

// --- State Management ---
let currentUser = null;
let token = localStorage.getItem("token");

// --- DOM Elements ---
const authSection = document.getElementById("auth-section");
const dashboardSection = document.getElementById("dashboard-section");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const gamesList = document.getElementById("games-list");
const eventsList = document.getElementById("events-list");
const statsDiv = document.getElementById("stats");
const logMessage = document.getElementById("log-message");
const authMessage = document.getElementById("auth-message");
const toggleAuthBtn = document.getElementById("toggle-auth-mode");
const authTitle = document.getElementById("auth-title");
const logoutBtn = document.getElementById("logout-btn");

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  if (token) {
    // Ideally verify token validity here, for now assume valid
    showDashboard();
    loadGames();
  } else {
    showAuth();
  }
});

// --- Auth Functions ---
function showAuth() {
  authSection.style.display = "flex";
  dashboardSection.style.display = "none";
  logoutBtn.style.display = "none";
}

function showDashboard() {
  authSection.style.display = "none";
  dashboardSection.style.display = "block";
  logoutBtn.style.display = "inline-block";
}

let isLoginMode = true;
toggleAuthBtn.addEventListener("click", (e) => {
  e.preventDefault();
  isLoginMode = !isLoginMode;
  if (isLoginMode) {
    loginForm.style.display = "flex";
    registerForm.style.display = "none";
    authTitle.innerText = "Login";
    toggleAuthBtn.innerText = "Need an account? Register";
  } else {
    loginForm.style.display = "none";
    registerForm.style.display = "flex";
    authTitle.innerText = "Register";
    toggleAuthBtn.innerText = "Have an account? Login";
  }
  authMessage.innerText = "";
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("token");
  token = null;
  location.reload();
});

// Handle Login
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(loginForm);

  try {
    const response = await fetch(`${API_URL}/token`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("Invalid credentials");

    const data = await response.json();
    token = data.access_token;
    localStorage.setItem("token", token);
    showDashboard();
    loadGames();
  } catch (err) {
    authMessage.style.color = "red";
    authMessage.innerText = err.message;
  }
});

// Handle Register
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = registerForm.username.value;
  const password = registerForm.password.value;

  try {
    const response = await fetch(`${API_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.detail || "Registration failed");
    }

    // Auto login after register
    const loginData = new FormData();
    loginData.append("username", username);
    loginData.append("password", password);

    const loginRes = await fetch(`${API_URL}/token`, {
      method: "POST",
      body: loginData,
    });

    const data = await loginRes.json();
    token = data.access_token;
    localStorage.setItem("token", token);
    showDashboard();
    loadGames();
  } catch (err) {
    authMessage.style.color = "red";
    authMessage.innerText = err.message;
  }
});

// --- Game & Event Logic ---

async function loadGames() {
  try {
    const response = await fetch(`${API_URL}/games/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const games = await response.json();
    gamesList.innerHTML = "<h3>Select a Game</h3>";

    const grid = document.createElement("div");
    grid.className = "card-grid";

    games.forEach((game) => {
      const btn = document.createElement("button");
      btn.className = "card";
      btn.innerText = game.name;
      btn.onclick = () => loadEvents(game.id);
      grid.appendChild(btn);
    });
    gamesList.appendChild(grid);

    // Add "Create Game" button
    const createDiv = document.createElement("div");
    createDiv.className = "create-section";
    createDiv.innerHTML = `
            <input type="text" id="new-game-name" placeholder="New Game Name">
            <button onclick="createGame()">Add Game</button>
        `;
    gamesList.appendChild(createDiv);
  } catch (err) {
    console.error("Failed to load games", err);
  }
}

async function createGame() {
  const nameInput = document.getElementById("new-game-name");
  if (!nameInput.value) return;

  await fetch(`${API_URL}/games/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: nameInput.value }),
  });
  nameInput.value = "";
  loadGames();
}

async function loadEvents(gameId) {
  eventsList.innerHTML = "<p>Loading events...</p>";
  statsDiv.innerHTML = "";

  const response = await fetch(`${API_URL}/events/${gameId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const events = await response.json();

  eventsList.innerHTML = "<h3>Select an Event</h3>";
  const grid = document.createElement("div");
  grid.className = "card-grid";

  events.forEach((event) => {
    const btn = document.createElement("button");
    btn.className = "card";
    btn.innerText = event.name;
    btn.onclick = () => loadEventDetails(event);
    grid.appendChild(btn);
  });
  eventsList.appendChild(grid);

  // Add Create Event Section
  const createDiv = document.createElement("div");
  createDiv.className = "create-section";
  createDiv.innerHTML = `
        <h4>Create New Event</h4>
        <input type="text" id="new-event-name" placeholder="Event Name">
        <div id="outcomes-inputs">
            <div class="outcome-row">
                <input type="text" placeholder="Outcome (e.g. Win)" class="out-name">
                <input type="number" placeholder="Prob % (e.g. 50)" class="out-prob">
            </div>
        </div>
        <button onclick="addOutcomeRow()" class="secondary-btn">+ Outcome</button>
        <button onclick="createEvent(${gameId})">Save Event</button>
    `;
  eventsList.appendChild(createDiv);
}

function addOutcomeRow() {
  const div = document.createElement("div");
  div.className = "outcome-row";
  div.innerHTML = `
        <input type="text" placeholder="Outcome" class="out-name">
        <input type="number" placeholder="Prob %" class="out-prob">
    `;
  document.getElementById("outcomes-inputs").appendChild(div);
}

async function createEvent(gameId) {
  const name = document.getElementById("new-event-name").value;
  const outcomeRows = document.querySelectorAll(".outcome-row");

  const outcomes = [];
  outcomeRows.forEach((row) => {
    const outName = row.querySelector(".out-name").value;
    const outProb = row.querySelector(".out-prob").value;
    if (outName && outProb) {
      outcomes.push({ name: outName, probability: parseFloat(outProb) });
    }
  });

  if (!name || outcomes.length === 0) {
    alert("Please fill in event name and at least one outcome.");
    return;
  }

  await fetch(`${API_URL}/events/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: name, game_id: gameId, outcomes: outcomes }),
  });
  loadEvents(gameId);
}

let currentEventId = null;

async function loadEventDetails(event) {
  currentEventId = event.id;

  // Build Log Interface
  let html = `<h3>${event.name} - Log Result</h3>`;
  html += `<div class="card-grid">`;

  event.outcomes.forEach((outcome) => {
    html += `<button class="card action-card" onclick="logOutcome('${outcome.name}', '${event.name}')">${outcome.name}</button>`;
  });
  html += `</div>`;

  // Bulk Log
  html += `
        <div class="bulk-log">
            <h4>Bulk Log</h4>
            <select id="bulk-outcome">
                ${event.outcomes
                  .map((o) => `<option value="${o.name}">${o.name}</option>`)
                  .join("")}
            </select>
            <input type="number" id="bulk-count" value="10" min="1">
            <button onclick="bulkLog()">Submit Bulk</button>
        </div>
    `;

  statsDiv.innerHTML = html;
  loadStats(event.id);
}

async function logOutcome(outcomeName, eventName) {
  await fetch(`${API_URL}/logs/?event_id=${currentEventId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ outcome_name: outcomeName }),
  });

  showFeedback(`Logged: ${outcomeName}`);
  loadStats(currentEventId);
}

async function bulkLog() {
  const outcomeName = document.getElementById("bulk-outcome").value;
  const count = parseInt(document.getElementById("bulk-count").value);

  if (count > 100) {
    alert("Max 100 at a time");
    return;
  }

  // Parallel requests (could be optimized on backend to accept arrays, but this works for now)
  const promises = [];
  for (let i = 0; i < count; i++) {
    promises.push(
      fetch(`${API_URL}/logs/?event_id=${currentEventId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ outcome_name: outcomeName }),
      })
    );
  }

  await Promise.all(promises);
  showFeedback(`Logged ${count}x ${outcomeName}`);
  loadStats(currentEventId);
}

function showFeedback(msg) {
  logMessage.innerText = msg;
  logMessage.style.opacity = 1;
  setTimeout(() => {
    logMessage.style.opacity = 0;
  }, 2000);
}

async function loadStats(eventId) {
  // Pass token explicitly to get user stats
  const response = await fetch(`${API_URL}/stats/${eventId}?token=${token}`);
  const data = await response.json();

  const container = document.createElement("div");
  container.className = "stats-container";

  // Global Stats Table
  let html = `
        <h4>Global Statistics (Total: ${data.total_attempts})</h4>
        <table class="stats-table">
            <tr>
                <th>Outcome</th>
                <th>Count</th>
                <th>Actual %</th>
                <th>Expected %</th>
                <th>Deviation</th>
            </tr>
    `;

  for (const [outcome, count] of Object.entries(data.outcomes)) {
    const actual = data.actual_rates[outcome].toFixed(2);
    const expected = data.expected_rates[outcome];
    const dev = data.deviation[outcome].toFixed(2);
    const color =
      Math.abs(dev) > 5 ? "red" : Math.abs(dev) < 1 ? "green" : "black";

    html += `
            <tr>
                <td>${outcome}</td>
                <td>${count}</td>
                <td>${actual}%</td>
                <td>${expected}%</td>
                <td style="color:${color}">${dev > 0 ? "+" : ""}${dev}%</td>
            </tr>
        `;
  }
  html += `</table>`;

  // User Stats Table
  if (data.user_total_attempts > 0) {
    html += `
            <h4 style="margin-top:20px; color:#007bff">My Statistics (Total: ${data.user_total_attempts})</h4>
            <table class="stats-table user-stats">
                <tr>
                    <th>Outcome</th>
                    <th>My Count</th>
                    <th>My Rate %</th>
                </tr>
        `;

    for (const [outcome, count] of Object.entries(data.user_outcomes)) {
      const actual = data.user_actual_rates[outcome].toFixed(2);
      html += `
                <tr>
                    <td>${outcome}</td>
                    <td>${count}</td>
                    <td>${actual}%</td>
                </tr>
            `;
    }
    html += `</table>`;
  } else {
    html += `<p style="margin-top:20px; color:#666">You haven't logged any data for this event yet.</p>`;
  }

  // Append to stats div (keeping the log buttons above)
  const existingTable = statsDiv.querySelector(".stats-container");
  if (existingTable) existingTable.remove();

  container.innerHTML = html;
  statsDiv.appendChild(container);
}
