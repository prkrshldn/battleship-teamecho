import { getCurrentUser, logout, updateUsername } from "../auth";
import { getRank } from "../util/rank";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:9999";

export function renderLeaderboard(root) {
  const el = document.createElement("div");
  el.className = "page";

  el.innerHTML = `
    <h1>Battleship</h1>
    <div class="card">
      <div class="grid2">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div class="settings" id="settings" title="Account settings">
            <i class="fa-solid fa-gear"></i>
          </div>
          <p>Logged in as: <span id="playerName">${getCurrentUser()?.user_metadata?.username || "Unknown"}</span></p>
        </div>
      </div>
      <div class="hr"></div>
      <h2>Leaderboard</h2>
      <p class="muted" id="leaderboardMessage">Loading leaderboard...</p>
      <div id="leaderboardContainer" style="overflow-x: auto;">
        <!-- Populated by JS -->
      </div>
      <div class="hr"></div>
      <a class="btn" href="#/lobby">Back to Lobby</a>
    </div>
  `;

  root.appendChild(el);

  const cardEl = el.querySelector(".card");
  const settingsBtn = el.querySelector("#settings");
  const playerNameEl = el.querySelector("#playerName");
  const leaderboardMessage = el.querySelector("#leaderboardMessage");
  const leaderboardContainer = el.querySelector("#leaderboardContainer");

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/leaderboard`);
      if (!response.ok) throw new Error("Failed to fetch leaderboard");

      const data = await response.json();
      displayLeaderboard(data);
    } catch (error) {
      leaderboardMessage.textContent = "Failed to load leaderboard.";
      console.error("Leaderboard fetch error:", error);
    }
  };

  const displayLeaderboard = (players) => {
    if (!players || players.length === 0) {
      leaderboardMessage.textContent = "No players on leaderboard yet.";
      return;
    }

    const top3 = (players, index) => {
      if (index === 0) return "👑 1st";
      if (index === 1) return "🥈 2nd";
      if (index === 2) return "🥉 3rd";
      return `#${index + 1}`;
    };

    leaderboardMessage.style.display = "none";

    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.innerHTML = `
      <thead>
        <tr style="border-bottom: 2px solid #444; background: #1a1a1a;">
          <th style="text-align: left; padding: 10px; color: #ccc;">Rank</th>
          <th style="text-align: left; padding: 10px; color: #ccc;">Player</th>
          <th style="text-align: center; padding: 10px; color: #ccc;">ELO</th>
          <th style="text-align: center; padding: 10px; color: #ccc;">Wins</th>
          <th style="text-align: center; padding: 10px; color: #ccc;">Losses</th>
          <th style="text-align: center; padding: 10px; color: #ccc;">Highest ELO</th>
        </tr>
      </thead>
      <tbody>
        ${players.map((player, index) => {
          const rank = getRank(player.elo);
          return `
          <tr style="border-bottom: 1px solid #333; background: #0f0f0f;">
            <td style="padding: 10px; color: #fff; font-weight: bold;">${top3(players, index)}</td>
            <td style="padding: 10px; color: #fff; display: flex; align-items: center; gap: 8px;" title="${rank.name}">
              ${rank.svg}
              ${player.name || "Unknown"}
            </td>
            <td style="text-align: center; padding: 10px; color: ${rank.color}; font-weight: bold;">${player.elo || 1000}</td>
            <td style="text-align: center; padding: 10px; color: #66bb6a;">${player.wins || 0}</td>
            <td style="text-align: center; padding: 10px; color: #ef5350;">${player.losses || 0}</td>
            <td style="text-align: center; padding: 10px; color: #ffd54f;">${player.highestEloReached || player.elo || 1000}</td>
          </tr>
        `;
        }).join("")}
      </tbody>
    `;

    leaderboardContainer.innerHTML = "";
    leaderboardContainer.appendChild(table);
  };

  const accountUsername = getCurrentUser()?.user_metadata?.username;
  playerNameEl.textContent = accountUsername || "Unknown";

  const handleUsernameChange = async (buttonToDisable) => {
    const suggestedName = accountUsername || "";
    const newName = prompt("Enter your new username:", suggestedName);
    if (newName === null) {
      return;
    }

    const trimmedName = newName.trim();
    const lobbyMessage = document.createElement("p");
    lobbyMessage.className = "tiny muted";
    lobbyMessage.style.marginTop = "10px";
    lobbyMessage.textContent = "";

    if (trimmedName.length < 2 || trimmedName.length > 20) {
      lobbyMessage.textContent = "Username must be 2-20 characters.";
      const settingsChangeUsernameBtn = cardEl.querySelector("#changeUsername");
      settingsChangeUsernameBtn.insertAdjacentElement("afterend", lobbyMessage);
      return;
    }

    try {
      buttonToDisable.disabled = true;
      buttonToDisable.textContent = "Updating...";

      await updateUsername(trimmedName);
      const settingsChangeUsernameBtn = cardEl.querySelector("#changeUsername");
      settingsChangeUsernameBtn.insertAdjacentElement("afterend", lobbyMessage);
      lobbyMessage.textContent = "Username updated.";
    } catch (error) {
      lobbyMessage.textContent = error.message || "Failed to update username.";
      const settingsChangeUsernameBtn = cardEl.querySelector("#changeUsername");
      settingsChangeUsernameBtn.insertAdjacentElement("afterend", lobbyMessage);
    } finally {
      buttonToDisable.disabled = false;
      buttonToDisable.textContent = "Change username";
    }
  };

  settingsBtn.addEventListener("click", () => {
    const cardRect = cardEl.getBoundingClientRect();

    cardEl.style.position = "relative";
    cardEl.style.background = "#000";
    cardEl.style.color = "#fff";
    cardEl.style.width = `${cardRect.width}px`;
    cardEl.style.height = `${cardRect.height}px`;
    cardEl.style.boxSizing = "border-box";
    cardEl.style.overflow = "hidden";

    let playerCurrentElo = getCurrentUser()?.user_metadata?.current_elo || 1000;
    const wins = getCurrentUser()?.user_metadata?.wins || 0;
    const losses = getCurrentUser()?.user_metadata?.losses || 0;
    const best_elo = getCurrentUser()?.user_metadata?.best_elo || playerCurrentElo;

    cardEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div class="settings" id="closeSettings" title="Close settings">
          <i class="fa-solid fa-x"></i>
        </div>
        <p>Logged in as: <span id="playerNameSettings" style="display:inline-flex; align-items:center; gap:6px; vertical-align:middle;">${getRank(playerCurrentElo).svg} ${accountUsername || "Unknown"}</span></p>
      </div>
      <div style="padding-top:30px;display:flex;flex-direction:column;gap:12px;height:100%;overflow-y:auto;">
        <h2 style="margin:0;color:#fff;">Profile</h2>
        
        <div style="background: #1a1a1a; border: 1px solid #444; border-radius: 6px; padding: 16px; display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div style="text-align: center;">
            <p class="tiny" style="margin: 0 0 4px 0; color:#999;">Wins</p>
            <p style="margin: 0; font-size: 24px; color: #4ade80; font-weight: bold;">${wins}</p>
          </div>
          <div style="text-align: center;">
            <p class="tiny" style="margin: 0 0 4px 0; color:#999;">Losses</p>
            <p style="margin: 0; font-size: 24px; color: #f87171; font-weight: bold;">${losses}</p>
          </div>
          <div style="text-align: center;">
            <p class="tiny" style="margin: 0 0 4px 0; color:#999;">Current ELO</p>
            <p style="margin: 0; font-size: 24px; color: #60a5fa; font-weight: bold;">${getRank(playerCurrentElo).svg} ${playerCurrentElo}</p>
          </div>
          <div style="text-align: center;">
            <p class="tiny" style="margin: 0 0 4px 0; color:#999;">Best ELO</p>
            <p style="margin: 0; font-size: 24px; color: #fbbf24; font-weight: bold;">${getRank(best_elo).svg} ${best_elo}</p>
          </div>
        </div>

        <div style="border-top: 1px solid #444; padding-top: 16px;">
          <h2 style="margin:0 0 12px 0;color:#fff;">Settings</h2>
          <p class="tiny" style="margin:0 0 12px 0;color:#cfcfcf;">Manage your account from here.</p>
          <div style="display: flex; gap: 10px; margin-bottom: 12px;">
            <button id="changeUsername" class="btn">Change username</button>
            <button id="logout" class="btn">Logout</button>
          </div>
        </div>
      </div>
    `;

    const closeSettingsBtn = cardEl.querySelector("#closeSettings");
    const settingsLogoutBtn = cardEl.querySelector("#logout");
    const settingsChangeUsernameBtn = cardEl.querySelector("#changeUsername");

    settingsLogoutBtn.addEventListener("click", async () => {
      await logout();
      window.location.hash = "#/";
    });

    settingsChangeUsernameBtn.addEventListener("click", () => {
      handleUsernameChange(settingsChangeUsernameBtn);
    });

    closeSettingsBtn.addEventListener("click", () => {
      root.innerHTML = "";
      renderLeaderboard(root);
    });
  });

  // Fetch leaderboard on render
  fetchLeaderboard();

  // Cleanup on navigation
  window.addEventListener(
    "hashchange",
    () => {
      // cleanup if needed
    },
    { once: true },
  );
}
