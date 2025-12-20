const API_URL = "";

// --- State ---
let token = localStorage.getItem("token");

// --- DOM Elements ---
const modalOverlay = document.getElementById("auth-modal");
const closeModalBtn = document.querySelector(".close-modal-btn");
const loginBtnNav = document.getElementById("login-btn-nav");
const logoutBtn = document.getElementById("logout-btn");
const userDisplay = document.getElementById("user-display");

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const authMessage = document.getElementById("auth-message");
const toggleAuthBtn = document.getElementById("toggle-auth-mode");
const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const toggleText = document.getElementById("toggle-text");

const gameSearchInput = document.getElementById("game-search");
const searchBtn = document.getElementById("search-btn");
const gamesListContainer = document.getElementById("games-list-container");
const gamesList = document.getElementById("games-list");
const eventsList = document.getElementById("events-list");
const statsDiv = document.getElementById("stats");
const logMessage = document.getElementById("log-message");

// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
  updateHeaderUI();

  // Modal Interactions
  loginBtnNav.onclick = () => {
    modalOverlay.style.display = "flex";
    authMessage.innerText = "";
  };

  closeModalBtn.onclick = () => (modalOverlay.style.display = "none");
  window.onclick = (e) => {
    if (e.target == modalOverlay) modalOverlay.style.display = "none";
  };

  // Search Interactions
  searchBtn.onclick = () => performSearch();
  gameSearchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") performSearch();
  });
});

// --- Search Logic ---
async function performSearch() {
  const query = gameSearchInput.value.trim();
  if (!query) return;

  await loadGames(query);
}

async function loadGames(searchQuery = "") {
  try {
    const url = searchQuery
      ? `${API_URL}/games/?search=${encodeURIComponent(searchQuery)}`
      : `${API_URL}/games/`; // Fallback (though UI forces search now)

    const response = await fetch(url, { headers: getHeaders() });
    const games = await response.json();

    gamesListContainer.style.display = "block";
    gamesList.innerHTML = "<h3>Search Results</h3>";

    if (games.length === 0) {
      gamesList.innerHTML += "<p>No games found.</p>";
      // If user wants to create one:
      if (token) {
        showCreateGameOption(searchQuery);
      }
      return;
    }

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

    // Add Create Option if logged in
    if (token) {
      showCreateGameOption();
    }
  } catch (err) {
    console.error(err);
    if (err.status === 401) handleLogout();
  }
}

function showCreateGameOption(prefillName = "") {
  const createDiv = document.createElement("div");
  createDiv.className = "create-section";
  createDiv.style.marginTop = "20px";
  createDiv.innerHTML = `
    <p>Don't see the game?</p>
    <div style="display:flex; gap:10px;">
        <input type="text" id="new-game-name" value="${prefillName}" placeholder="New Game Name" style="padding:0.5rem;">
        <button onclick="createGame()" class="nav-btn primary-btn">Add Game</button>
    </div>
    `;
  gamesList.appendChild(createDiv);
}

// --- Auth UI Switching ---
let isLoginMode = true;
toggleAuthBtn.addEventListener("click", (e) => {
  e.preventDefault();
  isLoginMode = !isLoginMode;
  if (isLoginMode) {
    loginForm.style.display = "block";
    registerForm.style.display = "none";
    authTitle.innerText = "Welcome Back";
    authSubtitle.innerText = "Enter your details to sign in";
    toggleText.innerText = "Don't have an account?";
    toggleAuthBtn.innerText = "Sign up";
  } else {
    loginForm.style.display = "none";
    registerForm.style.display = "block";
    authTitle.innerText = "Create Account";
    authSubtitle.innerText = "Start tracking your RNG today";
    toggleText.innerText = "Already have an account?";
    toggleAuthBtn.innerText = "Sign in";
  }
  authMessage.innerText = "";
});

// --- Auth API ---
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(loginForm);
  try {
    const res = await fetch(`${API_URL}/token`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Invalid username or password");
    const data = await res.json();
    completeLogin(data.access_token);
  } catch (err) {
    authMessage.innerText = err.message;
  }
});

registerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  // REPLACE KEY HERE
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
    const res = await fetch(`${API_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, captcha_token: captchaToken }),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.detail || "Registration failed");
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
    completeLogin(data.access_token);
  } catch (err) {
    authMessage.innerText = err.message;
  }
}

function completeLogin(accessToken) {
  token = accessToken;
  localStorage.setItem("token", token);
  modalOverlay.style.display = "none";
  updateHeaderUI();
  // Reload current search if exists
  if (gameSearchInput.value) performSearch();
}

function handleLogout() {
  localStorage.removeItem("token");
  token = null;
  updateHeaderUI();
  window.location.reload();
}

logoutBtn.addEventListener("click", handleLogout);

function updateHeaderUI() {
  if (token) {
    loginBtnNav.style.display = "none";
    logoutBtn.style.display = "inline-block";
    // Decode user
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      userDisplay.innerText = payload.sub;
      userDisplay.style.display = "inline";
    } catch (e) {}
  } else {
    loginBtnNav.style.display = "inline-block";
    logoutBtn.style.display = "none";
    userDisplay.style.display = "none";
  }
}

// --- Common Logic ---
function getHeaders() {
  const h = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

// ... Create/Load Events Logic (Similar to before, just ensured Headers are used) ...

async function createGame() {
  const nameInput = document.getElementById("new-game-name");
  if (!nameInput.value) return;
  await fetch(`${API_URL}/games/`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ name: nameInput.value }),
  });
  performSearch();
}

async function loadEvents(gameId) {
  eventsList.style.display = "block";
  eventsList.innerHTML = "<p>Loading events...</p>";
  statsDiv.innerHTML = "";

  // Scroll to events
  eventsList.scrollIntoView({ behavior: "smooth" });

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
    createDiv.style.marginTop = "20px";
    createDiv.innerHTML = `
        <h4>Create New Event</h4>
        <input type="text" id="new-event-name" placeholder="Event Name" style="padding:0.5rem; margin-bottom:10px; width:100%; box-sizing:border-box;">
        <div id="outcomes-inputs">
            <div class="outcome-row" style="display:flex; gap:10px; margin-bottom:5px;">
                <input type="text" placeholder="Outcome" class="out-name" style="flex:1; padding:0.5rem;">
                <input type="number" placeholder="Prob %" class="out-prob" style="width:80px; padding:0.5rem;">
            </div>
        </div>
        <div style="margin-top:10px;">
            <button onclick="addOutcomeRow()" class="nav-btn">+ Outcome</button>
            <button onclick="createEvent(${gameId})" class="nav-btn primary-btn">Save Event</button>
        </div>
      `;
    eventsList.appendChild(createDiv);
  }
}

function addOutcomeRow() {
  const div = document.createElement("div");
  div.className = "outcome-row";
  div.style.display = "flex";
  div.style.gap = "10px";
  div.style.marginBottom = "5px";
  div.innerHTML = `
    <input type="text" placeholder="Outcome" class="out-name" style="flex:1; padding:0.5rem;">
    <input type="number" placeholder="Prob %" class="out-prob" style="width:80px; padding:0.5rem;">
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

// ... Logs and Stats logic remains virtually same, just ensure styles match ...
let currentEventId = null;

async function loadEventDetails(event) {
  currentEventId = event.id;
  let html = `<h3>${event.name}</h3>`;

  // Scroll to stats
  statsDiv.scrollIntoView({ behavior: "smooth" });

  if (token) {
    html += `<p>Log Result:</p><div class="card-grid">`;
    event.outcomes.forEach((outcome) => {
      html += `<button class="card" style="background:var(--primary); color:white; border:none;" onclick="logOutcome('${outcome.name}')">${outcome.name}</button>`;
    });
    html += `</div>`;
    html += `
        <div class="bulk-log">
            <strong>Bulk:</strong>
            <select id="bulk-outcome" style="padding:0.5rem;">
                ${event.outcomes
                  .map((o) => `<option value="${o.name}">${o.name}</option>`)
                  .join("")}
            </select>
            <input type="number" id="bulk-count" value="10" min="1" max="1000" style="padding:0.5rem; width:80px;">
            <button onclick="bulkLog()" class="nav-btn primary-btn">Log</button>
        </div>`;
  } else {
    html += `<p class="guest-notice"><em>Login to track your own data.</em></p>`;
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
    console.error(e);
  }
}

async function bulkLog() {
  const outcomeName = document.getElementById("bulk-outcome").value;
  const count = parseInt(document.getElementById("bulk-count").value);
  if (count > 1000 || count < 1) return alert("1-1000 only");

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
    alert("Error");
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
      Math.abs(dev) > 5
        ? "var(--danger)"
        : Math.abs(dev) < 1
        ? "var(--success)"
        : "black";

    html += `<tr>
        <td>${outcome}</td><td>${count}</td><td>${actual}%</td><td>${expected}%</td>
        <td style="color:${color}">${dev > 0 ? "+" : ""}${dev}%</td>
      </tr>`;
  }
  html += `</table>`;

  if (token && data.user_total_attempts > 0) {
    html += `
      <h4 style="margin-top:20px; color:var(--primary)">My Statistics (Total: ${data.user_total_attempts})</h4>
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
