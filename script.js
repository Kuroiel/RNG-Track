const API_URL = "https://rng-track.onrender.com";

// --- State Management ---
let CURRENT_USER_ID = localStorage.getItem("rng_tracker_uuid");
if (!CURRENT_USER_ID) {
  // Generate a simple UUID if not present
  CURRENT_USER_ID = crypto.randomUUID();
  localStorage.setItem("rng_tracker_uuid", CURRENT_USER_ID);
}

let ACTIVE_GAME_ID = null;
let VIEW_MODE = "global"; // 'global' or 'user'
let CACHED_EVENTS = []; // Store data to toggle views instantly

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  // Load local games initially (optional, or just wait for search)
  fetchLocalGames();
});

// --- API Calls ---

async function searchGames() {
  const query = document.getElementById("game-search").value;
  if (!query) return;

  try {
    const res = await fetch(`${API_URL}/games/search?query=${query}`);
    if (!res.ok) throw new Error("API Request Failed");
    const games = await res.json();
    renderGameList(games, true);
  } catch (err) {
    console.error(err);
    alert("Failed to search games. Check your connection or API URL.");
  }
}

async function fetchLocalGames() {
  try {
    const res = await fetch(`${API_URL}/games`);
    if (!res.ok) throw new Error("API Request Failed");
    const games = await res.json();
    renderGameList(games, false);
  } catch (err) {
    console.error("Could not fetch local games:", err);
  }
}

async function selectGame(rawgId, name, imageUrl) {
  // 1. Ensure game exists in our DB
  try {
    const res = await fetch(`${API_URL}/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, rawg_id: rawgId, image_url: imageUrl }),
    });

    if (!res.ok) throw new Error("Failed to select game");

    const gameData = await res.json();

    // 2. Set Active State
    ACTIVE_GAME_ID = gameData.id;
    document.getElementById("search-section").style.display = "none";
    document.getElementById("games-container").style.display = "none";
    document.getElementById("active-game-section").style.display = "block";
    document.getElementById("active-game-title").innerText = gameData.name;

    // 3. Load Events
    loadEvents();
  } catch (err) {
    console.error(err);
    alert("Error selecting game.");
  }
}

async function loadEvents() {
  if (!ACTIVE_GAME_ID) return;

  try {
    // Pass user_id to get split stats
    const res = await fetch(
      `${API_URL}/events/${ACTIVE_GAME_ID}?user_id=${CURRENT_USER_ID}`
    );
    if (!res.ok) throw new Error("Failed to load events");
    CACHED_EVENTS = await res.json();
    renderEvents();
  } catch (err) {
    console.error(err);
    alert("Failed to load events.");
  }
}

async function logOutcome(outcomeId) {
  try {
    const res = await fetch(`${API_URL}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcome_id: outcomeId,
        user_id: CURRENT_USER_ID,
      }),
    });

    if (res.ok) {
      // Reload data to see updated stats
      loadEvents();
    } else {
      alert("Failed to log outcome.");
    }
  } catch (err) {
    console.error(err);
  }
}

async function submitNewEvent() {
  const name = document.getElementById("new-event-name").value;
  const desc = document.getElementById("new-event-desc").value;

  // Gather outcomes
  const outcomeRows = document.querySelectorAll(".outcome-input-row");
  const outcomes = [];

  outcomeRows.forEach((row) => {
    const oName = row.querySelector(".o-name").value;
    const oProb = row.querySelector(".o-prob").value;
    if (oName && oProb) {
      outcomes.push({
        name: oName,
        expected_probability: parseFloat(oProb),
      });
    }
  });

  if (!name || outcomes.length < 2) {
    alert("Please provide a name and at least 2 outcomes.");
    return;
  }

  try {
    const payload = {
      name: name,
      description: desc,
      game_id: ACTIVE_GAME_ID,
      created_by: CURRENT_USER_ID,
      outcomes: outcomes,
    };

    const res = await fetch(`${API_URL}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toggleCreateForm();
      loadEvents(); // Reload list
      // Clear form
      document.getElementById("new-event-name").value = "";
      document.getElementById("new-event-desc").value = "";
      document.getElementById("outcome-inputs-container").innerHTML = "";
      addOutcomeRow(); // Add initial rows back
      addOutcomeRow();
    } else {
      alert("Error creating event.");
    }
  } catch (err) {
    console.error(err);
  }
}

// --- UI Logic ---

function renderGameList(games, isSearchResult) {
  const container = document.getElementById("games-container");
  container.innerHTML = ""; // Clear current

  if (games.length === 0 && isSearchResult) {
    container.innerHTML = "<p>No games found.</p>";
    return;
  }

  games.forEach((game) => {
    const card = document.createElement("div");
    card.className = "game-card";
    card.onclick = () => selectGame(game.rawg_id, game.name, game.image_url);

    const img = game.image_url
      ? `<img src="${game.image_url}" alt="${game.name}">`
      : "";
    card.innerHTML = `
            ${img}
            <h3>${game.name}</h3>
        `;
    container.appendChild(card);
  });
}

function backToSearch() {
  ACTIVE_GAME_ID = null;
  document.getElementById("active-game-section").style.display = "none";
  document.getElementById("search-section").style.display = "flex";
  document.getElementById("games-container").style.display = "grid";
  fetchLocalGames(); // Refresh local list
}

function toggleViewMode() {
  const btn = document.getElementById("view-toggle-btn");
  const label = document.getElementById("view-label");

  if (VIEW_MODE === "global") {
    VIEW_MODE = "user";
    label.innerText = "My Personal Stats";
    btn.innerText = "Switch to Global Stats";
  } else {
    VIEW_MODE = "global";
    label.innerText = "Global Stats";
    btn.innerText = "Switch to My Stats";
  }
  renderEvents();
}

function renderEvents() {
  const container = document.getElementById("events-container");
  container.innerHTML = "";

  if (CACHED_EVENTS.length === 0) {
    container.innerHTML =
      "<p>No tracking events created for this game yet. Create one!</p>";
    return;
  }

  CACHED_EVENTS.forEach((event) => {
    const card = document.createElement("div");
    card.className = "event-card";

    // Calculate Total Logs for the specific view mode (to calculate percentages)
    let totalLogs = 0;
    event.outcomes.forEach((o) => {
      totalLogs += VIEW_MODE === "global" ? o.global_count : o.user_count;
    });

    // Generate Outcome HTML
    let outcomesHtml = "";
    event.outcomes.forEach((outcome) => {
      const count =
        VIEW_MODE === "global" ? outcome.global_count : outcome.user_count;
      const percentage =
        totalLogs > 0 ? ((count / totalLogs) * 100).toFixed(1) : "0.0";
      const expected = (outcome.expected_probability * 100).toFixed(1);

      outcomesHtml += `
                <div class="outcome-box">
                    <strong>${outcome.name}</strong>
                    <div class="stats-row">
                        <span>Observed: ${percentage}%</span>
                        <span>Expected: ${expected}%</span>
                    </div>
                    <div class="stats-row">
                        <span>Count: ${count}</span>
                        <span>Total: ${totalLogs}</span>
                    </div>
                    <button class="log-btn" onclick="logOutcome(${outcome.id})">Log This</button>
                </div>
            `;
    });

    card.innerHTML = `
            <div class="event-header">
                <div>
                    <h3>${event.name}</h3>
                    <small>${event.description || ""}</small>
                </div>
                <div style="text-align:right; font-size: 0.8em; color: #888;">
                    Created by: ${event.created_by.slice(0, 8)}...
                </div>
            </div>
            <div class="outcomes-grid">
                ${outcomesHtml}
            </div>
        `;
    container.appendChild(card);
  });
}

// --- Create Form Logic ---

function toggleCreateForm() {
  const form = document.getElementById("create-event-form");
  if (form.style.display === "none" || !form.style.display) {
    form.style.display = "block";
    // Init with 2 rows if empty
    const container = document.getElementById("outcome-inputs-container");
    if (container.children.length === 0) {
      addOutcomeRow();
      addOutcomeRow();
    }
  } else {
    form.style.display = "none";
  }
}

function addOutcomeRow() {
  const container = document.getElementById("outcome-inputs-container");
  const div = document.createElement("div");
  div.className = "outcome-input-row";
  div.innerHTML = `
        <input type="text" class="o-name" placeholder="Outcome Name (e.g. Rare Drop)">
        <input type="number" class="o-prob" step="0.01" placeholder="Probability (0.0 - 1.0)">
        <button class="remove-row-btn" onclick="this.parentElement.remove()">X</button>
    `;
  container.appendChild(div);
}
