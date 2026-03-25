import { getCurrentUser, logout, updateUsername } from "../auth";
import { state, setPlayerName, setRoomId } from "../state";

export function renderLobby(root) {
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
      <p class="muted">Create a room or join one with a code.</p>
      <div class="grid2">
        <div>
          <h2>Create room</h2>
          <button class="btn" id="create">Create</button>
          <p class="tiny muted">Generates a code and takes you to the game.</p>
        </div>

        <div>
          <h2>Join room</h2>
          <label class="label">Room code</label>
          <input class="input" id="room" placeholder="e.g. X7K2Q" autocomplete="off" />
          <button class="btn" id="join">Join</button>
        </div>
      </div>
      <div class="hr"></div>
    </div>
  `;

  root.appendChild(el);

  const cardEl = el.querySelector(".card");
  const settingsBtn = el.querySelector("#settings");
  const playerNameEl = el.querySelector("#playerName");
  const logoutBtn = el.querySelector("#logout");
  const lobbyMessage = document.createElement("p");
  lobbyMessage.className = "tiny muted";
  lobbyMessage.style.marginTop = "10px";

  const accountUsername = getCurrentUser()?.user_metadata?.username;
  if (accountUsername && accountUsername !== state.playerName) {
    setPlayerName(accountUsername);
  }
  playerNameEl.textContent = state.playerName || accountUsername || "Unknown";

  const roomInput = el.querySelector("#room");

  // quick code generator
  const makeCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 5; i++)
      out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  };

  el.querySelector("#create").addEventListener("click", () => {
    if (!state.playerName || state.playerName.length < 2) {
      window.location.hash = "#/";
      return;
    }
    const code = makeCode();
    setRoomId(code);
    window.location.hash = `#/game/${code}`;
  });

  el.querySelector("#join").addEventListener("click", () => {
    if (!state.playerName || state.playerName.length < 2) {
      window.location.hash = "#/";
      return;
    }
    const code = roomInput.value.trim().toUpperCase();
    if (code.length < 3) {
      roomInput.focus();
      return;
    }
    setRoomId(code);
    window.location.hash = `#/game/${code}`;
  });

  const handleUsernameChange = async (buttonToDisable = changeUsernameBtn) => {
    const suggestedName = state.playerName || accountUsername || "";
    const newName = prompt("Enter your new username:", suggestedName);
    if (newName === null) {
      return;
    }

    const trimmedName = newName.trim();
    lobbyMessage.textContent = "";

    if (trimmedName.length < 2 || trimmedName.length > 20) {
      lobbyMessage.textContent = "Username must be 2-20 characters.";
      return;
    }

    try {
      buttonToDisable.disabled = true;
      buttonToDisable.textContent = "Updating...";

      await updateUsername(trimmedName);
      setPlayerName(trimmedName);
      if (playerNameEl) playerNameEl.textContent = trimmedName;
      lobbyMessage.textContent = "Username updated.";
    } catch (error) {
      lobbyMessage.textContent = error.message || "Failed to update username.";
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

    cardEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div class="settings" id="closeSettings" title="Close settings">
          <i class="fa-solid fa-x"></i>
        </div>
        <p>Logged in as: <span id="playerName">${getCurrentUser()?.user_metadata?.username || "Unknown"}</span></p>
      </div>
      <div style="padding-top:30px;display:flex;flex-direction:column;gap:12px;height:100%;">
        <h2 style="margin:0;color:#fff;">Settings</h2>
        <p class="tiny" style="margin:0;color:#cfcfcf;">Manage your account from here.</p>
        <button id="logout" class="btn">Logout</button>
        <button id="changeUsername" class="btn">Change username</button>
      </div>
    `;

    const closeSettingsBtn = cardEl.querySelector("#closeSettings");
    const settingsChangeUsernameBtn = cardEl.querySelector("#changeUsername");
    const settingsLogoutBtn = cardEl.querySelector("#logout");
    settingsChangeUsernameBtn.insertAdjacentElement("afterend", lobbyMessage);

    settingsLogoutBtn.addEventListener("click", async () => {
      await logout();
      window.location.hash = "#/";
    });

    closeSettingsBtn.addEventListener("click", () => {
      root.innerHTML = "";
      renderLobby(root);
    });

    settingsChangeUsernameBtn.addEventListener("click", () => {
      handleUsernameChange(settingsChangeUsernameBtn);
    });
  });
}
