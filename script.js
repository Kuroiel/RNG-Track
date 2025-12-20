const API_URL = ""; // Relative path for production

// --- State Management ---
let token = localStorage.getItem("token");
let currentUser = null; // Can extract from token if needed

// --- DOM Elements ---
const modal = document.getElementById("auth-modal");
const closeModal = document.querySelector(".close-modal");
const loginBtnNav = document.getElementById("login-btn-nav");
const logoutBtn = document.getElementById("logout-btn");
const userDisplay = document.getElementById("user-display");

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const authMessage = document.getElementById("auth-message");
const toggleAuthBtn = document.getElementById("toggle-auth-mode");
const authTitle = document.getElementById("auth-title");

const gamesList = document.getElementById("games-list");
const eventsList = document.getElementById("events-list");
const statsDiv = document.getElementById("stats");
const logMessage = document.getElementById("log-message");

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  updateHeaderUI();
  loadGames(); // Load content immediately regardless of auth

  // Modal Event Listeners
  loginBtnNav.onclick = () => {
    modal.style.display = "flex";
    authMessage.innerText = "";
  };

  closeModal.onclick = () => (modal.style.display = "none");

  window.onclick = (event) => {
    if (event.target == modal) {
      modal.style.display = "none";
    }
  };
});

// --- Auth UI Logic ---
function updateHeaderUI() {
  if (token) {
    loginBtnNav.style.display = "none";
    logoutBtn.style.display = "inline-block";
    // Optional: Decode token to show username
    try {
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        window
          .atob(base64)
          .split("")
          .map(function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
      const user = JSON.parse(jsonPayload);
      userDisplay.innerText = user.sub;
      userDisplay.style.display = "inline";
    } catch (e) {}
  } else {
    loginBtnNav.style.display = "inline-block";
    logoutBtn.style.display = "none";
    userDisplay.style.display = "none";
  }
}

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("token");
  token = null;
  updateHeaderUI();
  // Reload current view to hide write buttons
  loadGames();
  statsDiv.innerHTML = "";
  eventsList.innerHTML = "<p style='color:#888'>Select a game above.</p>";
});

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

// --- Auth API Calls ---

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

    updateHeaderUI();
    modal.style.display = "none";
    loadGames(); // Refresh to show "Create" buttons
    authMessage.innerText = "";
  } catch (err) {
    authMessage.style.color = "red";
    authMessage.innerText = err.message;
  }
});

registerForm.addEventListener("submit", (e) => {
  e.preventDefault();

  grecaptcha.ready(function () {
    grecaptcha
      .execute("6LfUMjEsAAAAAE_aTbPscOQeaOWpXETR-qLlmrCc", { action: "submit" })
      .then(function (token) {
        handleRegister(token);
      });
  });
});

async function handleRegister(captchaToken) {
  const username = registerForm.username.value;
  const password = registerForm.password.value;

  try {
    const response = await fetch(`${API_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        captcha_token: captchaToken,
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.detail || "Registration failed");
    }

    // Auto login
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

    updateHeaderUI();
    modal.style.display = "none";
    loadGames();
  } catch (err) {
    authMessage.style.color = "red";
    authMessage.innerText = err.message;
  }
}

// --- Data Logic ---

function getHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function loadGames() {
  try {
    const response = await fetch(`${API_URL}/games/`, {
      headers: getHeaders(),
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

    // Show "Create Game" only if logged in
    if (token) {
      const createDiv = document.createElement("div");
      createDiv.className = "create-section";
      createDiv.innerHTML = `
        <input type="text" id="new-game-name" placeholder="New Game Name">
        <button onclick="createGame()">Add Game</button>
        `;
      gamesList.appendChild(createDiv);
    }
  } catch (err) {
    console.error("Failed to load games", err);
    if (err.status === 401) {
      localStorage.removeItem("token");
      token = null;
      updateHeaderUI();
    }
  }
}

async function createGame() {
  const nameInput = document.getElementById("new-game-name");
  if (!nameInput.value) return;

  await fetch(`${API_URL}/games/`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ name: nameInput.value }),
  });
  nameInput.value = "";
  loadGames();
}

async function loadEvents(gameId) {
  eventsList.innerHTML = "<p>Loading events...</p>";
  statsDiv.innerHTML = "";

  const response = await fetch(`${API_URL}/events/${gameId}`, {
    headers: getHeaders(),
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

  if (token) {
    const createDiv = document.createElement("div");
    createDiv.className = "create-section";
    createDiv.innerHTML = `
        <h4>Create New Event</h4>
        <input type="text" id="new-event-name" placeholder="Event Name">
        <div id="outcomes-inputs">
            <div class="outcome-row">
                <input type="text" placeholder="Outcome" class="out-name">
                <input type="number" placeholder="Prob %" class="out-prob">
            </div>
        </div>
        <button onclick="addOutcomeRow()" class="secondary-btn">+ Outcome</button>
        <button onclick="createEvent(${gameId})">Save Event</button>
      `;
    eventsList.appendChild(createDiv);
  }
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
    headers: getHeaders(),
    body: JSON.stringify({ name, game_id: gameId, outcomes }),
  });
  loadEvents(gameId);
}

let currentEventId = null;

async function loadEventDetails(event) {
  currentEventId = event.id;
  let html = `<h3>${event.name}</h3>`;

  if (token) {
    // Log Controls for Logged In Users
    html += `<p>Log Result:</p><div class="card-grid">`;
    event.outcomes.forEach((outcome) => {
      html += `<button class="card action-card" onclick="logOutcome('${outcome.name}')">${outcome.name}</button>`;
    });
    html += `</div>`;
    html += `
        <div class="bulk-log">
            <h4>Bulk Log</h4>
            <select id="bulk-outcome">
                ${event.outcomes
                  .map((o) => `<option value="${o.name}">${o.name}</option>`)
                  .join("")}
            </select>
            <input type="number" id="bulk-count" value="10" min="1" max="1000">
            <button onclick="bulkLog()">Submit Bulk</button>
        </div>`;
  } else {
    // Guest View
    html += `<p class="guest-notice"><em><a href="#" onclick="document.getElementById('login-btn-nav').click(); return false;">Login</a> to track your own drops.</em></p>`;
  }

  statsDiv.innerHTML = html;
  loadStats(event.id);
}

async function logOutcome(outcomeName) {
  try {
    const res = await fetch(`${API_URL}/logs/?event_id=${currentEventId}`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ outcome_name: outcomeName }),
    });
    if (!res.ok) throw await res.json();
    showFeedback(`Logged: ${outcomeName}`);
    loadStats(currentEventId);
  } catch (e) {
    alert(e.detail || "Error logging");
  }
}

async function bulkLog() {
  const outcomeName = document.getElementById("bulk-outcome").value;
  const count = parseInt(document.getElementById("bulk-count").value);

  if (count > 1000 || count < 1) return alert("Value must be 1-1000");

  try {
    const res = await fetch(`${API_URL}/logs/bulk`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        event_id: currentEventId,
        outcome_name: outcomeName,
        count,
      }),
    });
    if (!res.ok) throw await res.json();
    showFeedback(`Logged ${count}x ${outcomeName}`);
    loadStats(currentEventId);
  } catch (e) {
    alert(e.detail || "Bulk log failed");
  }
}

function showFeedback(msg) {
  logMessage.innerText = msg;
  logMessage.style.opacity = 1;
  setTimeout(() => (logMessage.style.opacity = 0), 2000);
}

async function loadStats(eventId) {
  const url = `${API_URL}/stats/${eventId}` + (token ? `?token=${token}` : "");
  const response = await fetch(url);
  const data = await response.json();

  const container = document.createElement("div");
  container.className = "stats-container";

  // Global Stats
  let html = `
    <h4>Global Statistics (Total: ${data.total_attempts})</h4>
    <table class="stats-table">
      <tr><th>Outcome</th><th>Count</th><th>Actual %</th><th>Expected %</th><th>Deviation</th></tr>
  `;

  for (const [outcome, count] of Object.entries(data.outcomes)) {
    const actual = data.actual_rates[outcome].toFixed(2);
    const expected = data.expected_rates[outcome];
    const dev = data.deviation[outcome].toFixed(2);
    const color =
      Math.abs(dev) > 5 ? "red" : Math.abs(dev) < 1 ? "green" : "black";

    html += `<tr>
        <td>${outcome}</td><td>${count}</td><td>${actual}%</td><td>${expected}%</td>
        <td style="color:${color}">${dev > 0 ? "+" : ""}${dev}%</td>
      </tr>`;
  }
  html += `</table>`;

  // User Stats
  if (token && data.user_total_attempts > 0) {
    html += `
      <h4 style="margin-top:20px; color:#007bff">My Statistics (Total: ${data.user_total_attempts})</h4>
      <table class="stats-table user-stats">
        <tr><th>Outcome</th><th>My Count</th><th>My Rate %</th></tr>
    `;
    for (const [outcome, count] of Object.entries(data.user_outcomes)) {
      html += `<tr>
          <td>${outcome}</td><td>${count}</td><td>${data.user_actual_rates[
        outcome
      ].toFixed(2)}%</td>
        </tr>`;
    }
    html += `</table>`;
  }

  const existing = statsDiv.querySelector(".stats-container");
  if (existing) existing.remove();
  container.innerHTML = html;
  statsDiv.appendChild(container);
}
