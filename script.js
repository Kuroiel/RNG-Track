// Change API_URL to empty string so it uses the current domain automatically.
// This works because we are now serving this script from the Backend.
const API_URL = "";

let userId = localStorage.getItem("rng_user_id");

if (!userId) {
  userId = crypto.randomUUID();
  localStorage.setItem("rng_user_id", userId);
}

// Req #6: Default to My Stats
let currentView = "my";
document.getElementById("viewToggle").checked = true;

document.getElementById("viewToggle").addEventListener("change", (e) => {
  currentView = e.target.checked ? "my" : "global";
  fetchGames();
});

async function fetchGames() {
  let url = `${API_URL}/games/`;
  if (currentView === "my") {
    url = `${API_URL}/games/my/?user_id=${userId}`;
  }

  const response = await fetch(url);
  const games = await response.json();

  if (currentView === "my") {
    const allResponse = await fetch(`${API_URL}/games/`);
    const allGames = await allResponse.json();
    populateGameSelect(allGames);
  } else {
    populateGameSelect(games);
  }

  const container = document.getElementById("trackerContainer");
  container.innerHTML = "";

  games
    .slice()
    .reverse()
    .forEach((game) => {
      const gameDiv = document.createElement("div");
      gameDiv.className = "card";
      gameDiv.innerHTML = `
            <div class="game-header">
                <h3>${game.name}</h3>
            </div>
            <div id="events-${game.id}"></div>
        `;
      container.appendChild(gameDiv);
      game.events.forEach((event) => renderEvent(game.id, event));
    });
}

function populateGameSelect(games) {
  const select = document.getElementById("gameSelect");
  select.innerHTML = '<option value="">Select Existing Game</option>';
  games.forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.innerText = g.name;
    select.appendChild(opt);
  });
}

async function renderEvent(gameId, event) {
  const container = document.getElementById(`events-${gameId}`);
  const eventDiv = document.createElement("div");
  eventDiv.className = "outcome-group";

  const statsUrl = new URL(
    window.location.origin + `${API_URL}/stats/${event.id}`
  );
  if (currentView === "my") {
    statsUrl.searchParams.append("user_id", userId);
  }

  const statsRes = await fetch(statsUrl);
  const stats = await statsRes.json();

  let outcomesHtml = "";
  event.outcomes.forEach((oc) => {
    const count = stats.outcomes[oc.id] || 0;
    const pct =
      stats.total_logs > 0 ? ((count / stats.total_logs) * 100).toFixed(1) : 0;

    outcomesHtml += `
            <div style="margin-bottom: 5px; display: flex; align-items: center; justify-content: space-between;">
                <span>${oc.name}: <strong>${count}</strong> (${pct}%)</span>
                <div>
                    <input type="number" id="count-${oc.id}" class="bulk-input" value="1" min="1">
                    <button class="btn" onclick="logOutcome(${event.id}, ${oc.id})">Log</button>
                </div>
            </div>
        `;
  });

  let analysisHtml = "";
  if (stats.total_logs > 0) {
    const diff = stats.analysis.deviation;
    const diffClass = diff >= 0 ? "good-luck" : "bad-luck";
    const sign = diff > 0 ? "+" : "";

    analysisHtml = `
            <div class="analysis-box">
                <strong>Analysis:</strong><br>
                Expected Successes: ${stats.analysis.expected_hits}<br>
                Actual Successes: ${stats.analysis.success_count}<br>
                Deviation: <span class="${diffClass}">${sign}${diff}</span>
            </div>
        `;
  }

  eventDiv.innerHTML = `
        <h4>${event.name} (Rate: ${(event.probability * 100).toFixed(2)}%)</h4>
        ${outcomesHtml}
        <div class="stats-row">
            <span>Total: ${stats.total_logs}</span>
        </div>
        ${analysisHtml}
    `;
  container.appendChild(eventDiv);
}

async function logOutcome(eventId, outcomeId) {
  const countInput = document.getElementById(`count-${outcomeId}`);
  const count = parseInt(countInput.value) || 1;

  await fetch(`${API_URL}/logs/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_id: eventId,
      outcome_id: outcomeId,
      user_id: userId,
      count: count,
      is_imported: false,
    }),
  });

  countInput.value = 1;
  fetchGames();
}

async function createEvent() {
  const gameSelect = document.getElementById("gameSelect");
  const newGameName = document.getElementById("newGameName").value;
  let gameId = gameSelect.value;

  if (!gameId && !newGameName) return alert("Select or name a game");

  if (!gameId && newGameName) {
    const gRes = await fetch(`${API_URL}/games/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newGameName }),
    });
    const newGame = await gRes.json();
    gameId = newGame.id;
  }

  const name = document.getElementById("eventName").value;
  const prob = parseFloat(document.getElementById("eventProb").value);

  const outcomes = [];
  document.querySelectorAll("#outcomesList > div").forEach((div) => {
    const oName = div.querySelector(".outcome-name").value;
    const oSucc = div.querySelector(".outcome-success").checked;
    if (oName) outcomes.push({ name: oName, is_success: oSucc });
  });

  if (!name || isNaN(prob) || outcomes.length === 0)
    return alert("Fill all fields");

  await fetch(`${API_URL}/games/${gameId}/events/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name,
      probability: prob,
      outcomes: outcomes,
    }),
  });

  location.reload();
}

function addOutcomeField() {
  const div = document.createElement("div");
  div.innerHTML = `
        <input type="text" placeholder="Outcome Name" class="outcome-name">
        <label><input type="checkbox" class="outcome-success"> Is Success?</label>
    `;
  document.getElementById("outcomesList").appendChild(div);
}

async function exportData() {
  const response = await fetch(`${API_URL}/logs/export/?user_id=${userId}`);
  const logs = await response.json();

  const data = {
    user_id: userId,
    logs: logs,
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rng-track-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

async function importData(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!confirm(`Import data for User ID: ${data.user_id}?`)) return;

      if (data.user_id) {
        localStorage.setItem("rng_user_id", data.user_id);
        userId = data.user_id;
      }

      if (data.logs && data.logs.length > 0) {
        if (confirm("Upload logs as 'Imported' entries?")) {
          for (const log of data.logs) {
            await fetch(`${API_URL}/logs/`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                event_id: log.event_id,
                outcome_id: log.outcome_id,
                user_id: userId,
                count: 1,
                is_imported: true,
              }),
            });
          }
          alert("Imported.");
        }
      }
      location.reload();
    } catch (err) {
      console.error(err);
      alert("Error parsing JSON");
    }
  };
  reader.readAsText(file);
}

fetchGames();
