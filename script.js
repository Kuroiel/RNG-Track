// 7.2 Fix API URL
const API_URL = "https://your-app-name.onrender.com"; // REPLACE WITH YOUR RENDER URL
const RECAPTCHA_SITE_KEY = "YOUR_RECAPTCHA_SITE_KEY_HERE"; // REPLACE THIS

let currentUser = null;
let currentToken = localStorage.getItem("access_token");
let gamesCache = null; // 8.2 Caching
let statsChart = null; // 9.2 Chart instance

// DOM Elements
const authModal = document.getElementById("auth-modal");
const resetModal = document.getElementById("reset-modal");
const authForm = document.getElementById("auth-form");
const authTitle = document.getElementById("auth-title");
const toggleAuthBtn = document.getElementById("toggle-auth-mode");
const registerFields = document.getElementById("register-fields");
const loadingOverlay = document.getElementById("loading-overlay");
const themeToggle = document.getElementById("theme-toggle");

let isRegisterMode = false;

// --- 1. Dark Mode Logic ---
function initTheme() {
  const savedTheme = localStorage.getItem("theme");
  // Default to dark if nothing saved (1.1)
  if (savedTheme === "light") {
    document.body.setAttribute("data-theme", "light");
  } else {
    document.body.setAttribute("data-theme", "dark");
  }
}

themeToggle.addEventListener("click", () => {
  const currentTheme = document.body.getAttribute("data-theme");
  const newTheme = currentTheme === "light" ? "dark" : "light";
  document.body.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme); // 1.2 Persistence
  // Update chart if it exists (colors change)
  if (statsChart) statsChart.update();
});

initTheme();

// --- 7.4 Loading State ---
function showLoading(show) {
  loadingOverlay.style.display = show ? "flex" : "none";
}

// --- Auth & Modals ---
document.getElementById("login-btn").onclick = () =>
  (authModal.style.display = "block");
document.querySelector(".close").onclick = () =>
  (authModal.style.display = "none");
document.getElementById("logout-btn").onclick = logout;

toggleAuthBtn.onclick = () => {
  isRegisterMode = !isRegisterMode;
  authTitle.textContent = isRegisterMode ? "Register" : "Login";
  document.getElementById("auth-submit").textContent = isRegisterMode
    ? "Register"
    : "Login";
  toggleAuthBtn.textContent = isRegisterMode
    ? "Have an account? Login"
    : "Need an account? Register";
  // Show/Hide Confirm Password
  registerFields.classList.toggle("hidden", !isRegisterMode);
  document.getElementById("auth-password-confirm").required = isRegisterMode;
};

// Forgot Password Flow
document.getElementById("forgot-password-link").onclick = () => {
  authModal.style.display = "none";
  resetModal.style.display = "block";
  document.getElementById("reset-request-step").classList.remove("hidden");
  document.getElementById("reset-confirm-step").classList.add("hidden");
};

document.querySelector(".close-reset").onclick = () =>
  (resetModal.style.display = "none");

// Check for Reset Token in URL
const urlParams = new URLSearchParams(window.location.search);
const resetToken = urlParams.get("reset_token");
if (resetToken) {
  resetModal.style.display = "block";
  document.getElementById("reset-request-step").classList.add("hidden");
  document.getElementById("reset-confirm-step").classList.remove("hidden");
  document.getElementById("reset-token").value = resetToken;
}

// Request Reset
document.getElementById("btn-request-reset").onclick = async () => {
  const email = document.getElementById("reset-email").value;
  if (!email) return alert("Enter email");
  showLoading(true);
  try {
    await fetch(`${API_URL}/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    alert("If account exists, email sent.");
    resetModal.style.display = "none";
  } catch (e) {
    console.error(e);
  }
  showLoading(false);
};

// Confirm Reset
document.getElementById("btn-confirm-reset").onclick = async () => {
  const token = document.getElementById("reset-token").value;
  const newPass = document.getElementById("new-password").value;
  showLoading(true);
  try {
    const res = await fetch(`${API_URL}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, new_password: newPass }),
    });
    if (res.ok) {
      alert("Password reset! Please login.");
      window.location.href = window.location.pathname; // clear url param
    } else {
      const d = await res.json();
      alert(d.detail || "Error");
    }
  } catch (e) {
    console.error(e);
  }
  showLoading(false);
};

authForm.onsubmit = async (e) => {
  e.preventDefault();
  const email = document.getElementById("auth-email").value;
  const password = document.getElementById("auth-password").value;

  // 3. Password Confirmation Check
  if (isRegisterMode) {
    const confirm = document.getElementById("auth-password-confirm").value;
    if (password !== confirm) {
      alert("Passwords do not match!");
      return;
    }
    // Regex is handled in backend, but good to have here too
    if (password.length < 8) {
      alert("Password too short");
      return;
    }
  }

  showLoading(true);

  try {
    if (isRegisterMode) {
      const res = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Registration failed");
      }
      const data = await res.json();
      loginSuccess(data.access_token);
    } else {
      // Login
      // Execute reCAPTCHA v3
      grecaptcha.ready(function () {
        grecaptcha
          .execute(RECAPTCHA_SITE_KEY, { action: "login" })
          .then(async function (token) {
            const formData = new FormData();
            formData.append("username", email);
            formData.append("password", password);
            // Pass token if backend requires it (I added token param in schema but OAuth form is strict)
            // For strict OAuth flow, you usually pass it in header or body extra.
            // Current backend setup ignores it for simplicity unless we modify main.py login heavily.

            const res = await fetch(`${API_URL}/token`, {
              method: "POST",
              body: formData,
            });

            if (!res.ok) {
              alert("Login failed");
              showLoading(false);
              return;
            }
            const data = await res.json();
            loginSuccess(data.access_token);
            showLoading(false);
          });
      });
    }
  } catch (err) {
    alert(err.message);
    showLoading(false);
  }
};

function loginSuccess(token) {
  localStorage.setItem("access_token", token);
  currentToken = token;
  authModal.style.display = "none";
  updateUI();
  showLoading(false);
}

function logout() {
  localStorage.removeItem("access_token");
  currentToken = null;
  updateUI();
}

function updateUI() {
  if (currentToken) {
    document.getElementById("login-btn").classList.add("hidden");
    document.getElementById("logout-btn").classList.remove("hidden");
    document.getElementById("log-section").classList.remove("hidden");
    document.getElementById("login-prompt").classList.add("hidden");
  } else {
    document.getElementById("login-btn").classList.remove("hidden");
    document.getElementById("logout-btn").classList.add("hidden");
    document.getElementById("log-section").classList.add("hidden");
    document.getElementById("login-prompt").classList.remove("hidden");
  }
}

// --- App Logic ---

async function loadGames() {
  // 8.2 Optimization: Cache
  if (gamesCache) {
    renderGames(gamesCache);
    return;
  }

  showLoading(true);
  try {
    const res = await fetch(`${API_URL}/games/`);
    if (!res.ok) throw new Error("Failed to load");
    const games = await res.json();
    gamesCache = games;
    renderGames(games);
  } catch (e) {
    console.error(e);
  }
  showLoading(false);
}

function renderGames(games) {
  const grid = document.getElementById("games-grid");
  grid.innerHTML = "";
  games.forEach((game) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<h3>${game.name}</h3>`;
    card.onclick = () => loadEvents(game.id, game.name);
    grid.appendChild(card);
  });
}

// Search Filter
document.getElementById("game-search").addEventListener("input", (e) => {
  if (!gamesCache) return;
  const term = e.target.value.toLowerCase();
  const filtered = gamesCache.filter((g) =>
    g.name.toLowerCase().includes(term)
  );
  renderGames(filtered);
});

async function loadEvents(gameId, gameName) {
  showLoading(true);
  try {
    const res = await fetch(`${API_URL}/events/${gameId}`);
    const events = await res.json();

    document.getElementById("search-section").classList.add("hidden");
    document.getElementById("events-section").classList.remove("hidden");
    document.getElementById("selected-game-title").textContent =
      gameName + " Events";

    const grid = document.getElementById("events-grid");
    grid.innerHTML = "";
    events.forEach((event) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `<h3>${event.name}</h3>`;
      card.onclick = () => loadStats(event.id);
      grid.appendChild(card);
    });
  } catch (e) {
    console.error(e);
  }
  showLoading(false);
}

document.getElementById("back-to-games").onclick = () => {
  document.getElementById("events-section").classList.add("hidden");
  document.getElementById("search-section").classList.remove("hidden");
};

let currentEventId = null;

async function loadStats(eventId) {
  currentEventId = eventId;
  showLoading(true);
  try {
    const res = await fetch(`${API_URL}/stats/${eventId}`);
    const stats = await res.json();

    document.getElementById("events-section").classList.add("hidden");
    document.getElementById("stats-section").classList.remove("hidden");

    document.getElementById("event-title").textContent = stats.event_name;
    document.getElementById("stat-attempts").textContent = stats.total_attempts;
    document.getElementById("stat-success").textContent = stats.success_count;
    document.getElementById("stat-actual").textContent =
      stats.actual_rate + "%";
    document.getElementById("stat-expected").textContent =
      stats.expected_rate + "%";

    const devElem = document.getElementById("stat-deviation");
    devElem.textContent =
      (stats.deviation > 0 ? "+" : "") + stats.deviation + "%";
    devElem.style.color = stats.deviation >= 0 ? "#03dac6" : "#cf6679";

    // 9.2 Render Chart
    renderChart(stats);
  } catch (e) {
    console.error(e);
  }
  showLoading(false);
}

document.getElementById("back-to-events").onclick = () => {
  document.getElementById("stats-section").classList.add("hidden");
  document.getElementById("events-section").classList.remove("hidden");
};

// 9.2 Chart.js Logic
function renderChart(stats) {
  const ctx = document.getElementById("statsChart").getContext("2d");

  // Destroy old chart if exists
  if (statsChart) statsChart.destroy();

  const isDark = document.body.getAttribute("data-theme") !== "light";
  const gridColor = isDark ? "#444" : "#ddd";
  const textColor = isDark ? "#e0e0e0" : "#333";

  statsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Actual Rate", "Expected Rate"],
      datasets: [
        {
          label: "Probability (%)",
          data: [stats.actual_rate, stats.expected_rate],
          backgroundColor: [
            "rgba(3, 218, 198, 0.6)", // Teal
            "rgba(187, 134, 252, 0.6)", // Purple
          ],
          borderColor: ["rgba(3, 218, 198, 1)", "rgba(187, 134, 252, 1)"],
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: textColor },
        },
        x: {
          grid: { display: false },
          ticks: { color: textColor },
        },
      },
      plugins: {
        legend: { labels: { color: textColor } },
      },
    },
  });
}

// Submit Logs
async function submitLog(result) {
  if (!currentToken) return alert("Please login");
  showLoading(true);
  try {
    const res = await fetch(`${API_URL}/logs/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`,
      },
      body: JSON.stringify({
        event_id: currentEventId,
        result: result,
      }),
    });
    if (res.ok) {
      loadStats(currentEventId); // Refresh stats
    }
  } catch (e) {
    console.error(e);
  }
  showLoading(false);
}

document.getElementById("log-success-btn").onclick = () => submitLog(true);
document.getElementById("log-fail-btn").onclick = () => submitLog(false);

// Initial Load
updateUI();
loadGames();
