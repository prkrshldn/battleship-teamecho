import { getCurrentUser, logout, updateUsername } from "../auth";
import { socket, connectSocket } from "../socket";
import { state, setMatchMode, setPlayerName, setRoomId } from "../state";

let cleanupLobbySocketHandlers = null;

export function renderLobby(root, options = {}) {
  if (cleanupLobbySocketHandlers) {
    cleanupLobbySocketHandlers();
    cleanupLobbySocketHandlers = null;
  }

  const validViews = new Set(["mode", "room", "cpu", "ranked"]);
  const initialView = validViews.has(options.initialView) ? options.initialView : "mode";
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
      <p class="muted" id="lobbyMessage">Welcome to Battleship!</p>
      <div class="grid2" id="modeOrRoomGrid">
        <div>
          <h2>Play mode</h2>
          <button class="lobby-btn" id="modeLocal">Local Match (Room Code)</button>
          <button class="lobby-btn" id="modeRanked" style="margin-top:10px;">Ranked Matchmaking</button>
        </div>
        <div>
          <button class="lobby-btn" id="modeCpu">Player Vs. CPU</button>
        </div>
      </div>
      <div class="hr"></div>
    </div>
  `;

  root.appendChild(el);

  const cardEl = el.querySelector(".card");
  const settingsBtn = el.querySelector("#settings");
  const playerNameEl = el.querySelector("#playerName");
  const lobbyMessage = document.createElement("p");
  lobbyMessage.className = "tiny muted";
  lobbyMessage.style.marginTop = "10px";
  const lobbyMessageEl = el.querySelector("#lobbyMessage");
  let lobbyView = initialView;
  let rankedQueueActive = false;
  let rankedJoinedAt = null;
  let rankedTimer = null;

  const accountUsername = getCurrentUser()?.user_metadata?.username;
  if (accountUsername && accountUsername !== state.playerName) {
    setPlayerName(accountUsername);
  }
  playerNameEl.textContent = state.playerName || accountUsername || "Unknown";

  const makeCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 5; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  };

  const modeOrRoomGrid = el.querySelector("#modeOrRoomGrid");
  let playerCurrentElo = getCurrentUser()?.user_metadata?.current_elo || 1000;

  const syncPageWidthFromModeGrid = () => {
    const gridWidth = modeOrRoomGrid.getBoundingClientRect().width;
    const cardStyle = window.getComputedStyle(cardEl);
    const padX = (parseFloat(cardStyle.paddingLeft) || 0) + (parseFloat(cardStyle.paddingRight) || 0);
    const targetWidth = Math.ceil(gridWidth + padX);

    if (targetWidth > 0) {
      document.documentElement.style.setProperty("--page-content-width", `${targetWidth}px`);
    }
  };

  requestAnimationFrame(syncPageWidthFromModeGrid);

  const stopRankedTimer = () => {
    if (rankedTimer) {
      window.clearInterval(rankedTimer);
      rankedTimer = null;
    }
  };

  const updateRankedQueueTimer = () => {
    if (!rankedQueueActive || !rankedJoinedAt) return;
    const elapsed = Math.max(0, Math.floor((Date.now() - rankedJoinedAt) / 1000));
    const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const ss = String(elapsed % 60).padStart(2, "0");
    lobbyMessageEl.textContent = `Searching ranked queue... ${mm}:${ss}`;
  };

  const onRankedQueueJoined = () => {
    rankedQueueActive = true;
    rankedJoinedAt = Date.now();
    updateRankedQueueTimer();
    stopRankedTimer();
    rankedTimer = window.setInterval(updateRankedQueueTimer, 1000);

    const startBtn = el.querySelector("#startRanked");
    const cancelBtn = el.querySelector("#cancelRanked");
    if (startBtn) startBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = false;
  };

  const onRankedQueueJoinedWithElo = (payload) => {
    playerCurrentElo = payload.elo || playerCurrentElo;
    const eloDisplay = el.querySelector("#rankedEloDisplay");
    if (eloDisplay) {
      eloDisplay.textContent = playerCurrentElo;
    }
    onRankedQueueJoined();
  };

  const onRankedQueueLeft = () => {
    rankedQueueActive = false;
    rankedJoinedAt = null;
    stopRankedTimer();

    const startBtn = el.querySelector("#startRanked");
    const cancelBtn = el.querySelector("#cancelRanked");
    if (startBtn) startBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = true;

    if (lobbyView === "ranked") {
      lobbyMessageEl.textContent = "Ranked queue canceled.";
    }
  };

  const onRankedMatchFound = (payload) => {
    rankedQueueActive = false;
    rankedJoinedAt = null;
    stopRankedTimer();

    setMatchMode("ranked");
    setRoomId(payload.roomCode);
    window.location.hash = `#/game/${payload.roomCode}`;
  };

  const onConnectError = (err) => {
    if (lobbyView === "ranked") {
      lobbyMessageEl.textContent = err?.message || "Unable to connect to matchmaking.";
    }
  };

  socket.on("ranked_queue_joined", onRankedQueueJoinedWithElo);
  socket.on("ranked_queue_left", onRankedQueueLeft);
  socket.on("ranked_match_found", onRankedMatchFound);
  socket.on("connect_error", onConnectError);

  cleanupLobbySocketHandlers = () => {
    stopRankedTimer();
    socket.off("ranked_queue_joined", onRankedQueueJoinedWithElo);
    socket.off("ranked_queue_left", onRankedQueueLeft);
    socket.off("ranked_match_found", onRankedMatchFound);
    socket.off("connect_error", onConnectError);
  };

  const wireRoomActions = () => {
    const createBtn = el.querySelector("#create");
    const joinBtn = el.querySelector("#join");
    const roomInput = el.querySelector("#room");

    if (createBtn) {
      createBtn.addEventListener("click", () => {
        if (!state.playerName || state.playerName.length < 2) {
          window.location.hash = "#/";
          return;
        }

        setMatchMode("local");
        const code = makeCode();
        setRoomId(code);
        window.location.hash = `#/game/${code}`;
      });
    }

    if (joinBtn && roomInput) {
      joinBtn.addEventListener("click", () => {
        if (!state.playerName || state.playerName.length < 2) {
          window.location.hash = "#/";
          return;
        }

        setMatchMode("local");
        const code = roomInput.value.trim().toUpperCase();
        if (code.length < 3) {
          roomInput.focus();
          return;
        }
        setRoomId(code);
        window.location.hash = `#/game/${code}`;
      });
    }
  };

  const wireBackToLobby = () => {
    const backBtn = el.querySelector("#backToLobby");
    if (!backBtn) return;

    backBtn.addEventListener("click", () => {
      if (rankedQueueActive) {
        socket.emit("ranked_queue_leave");
      }
      root.innerHTML = "";
      renderLobby(root, { initialView: "mode" });
    });
  };

  const showRoomOptions = () => {
    lobbyView = "room";
    lobbyMessageEl.textContent = "Local match: create a room or join one with a code. Stats do not change.";
    modeOrRoomGrid.innerHTML = `
      <div>
        <h2>Create local room</h2>
        <button class="btn" id="create">Create</button>
        <p class="tiny muted">Generates a code and takes you to the game.</p>
      </div>

      <div>
        <h2>Join local room</h2>
        <label class="label">Room code</label>
        <input class="input" id="room" placeholder="e.g. X7K2Q" autocomplete="off" />
        <button class="btn" id="join">Join</button>
        <button class="btn ghost" id="backToLobby" style="margin-top:10px;">Go Back</button>
      </div>
    `;

    wireRoomActions();
    wireBackToLobby();
  };

  const showCPUOptions = () => {
    lobbyView = "cpu";
    lobbyMessageEl.textContent = "Where CPU battleship is played. Sink all the ships to win!";
    modeOrRoomGrid.innerHTML = `
      <div style="grid-column: 1 / -1;">
        <h2>Player vs CPU</h2>
        <button class="btn" id="create">Start game vs CPU</button>
        <p class="tiny muted">Generates a code and takes you to the game.</p>
        <button class="btn ghost" id="backToLobby" style="margin-top:10px;">Go Back</button>
      </div>
    `;

    wireRoomActions();
    wireBackToLobby();
  };

  const showRankedOptions = () => {
    lobbyView = "ranked";
    lobbyMessageEl.textContent = "Ranked queue: matched with similar ELO. Wins, losses, and ELO are affected.";
    modeOrRoomGrid.innerHTML = `
      <div style="grid-column: 1 / -1;">
        <h2>Ranked Matchmaking</h2>
        <p class="tiny muted">You will be matched with someone near your rating.</p>
        <div style="background: #1a1a1a; border: 1px solid #444; border-radius: 6px; padding: 12px; margin: 12px 0; text-align: center;">
          <p class="tiny muted" style="margin: 0 0 6px 0;">Your Current ELO</p>
          <p style="margin: 0; font-size: 28px; color: #fff; font-weight: bold;"><span id="rankedEloDisplay">${playerCurrentElo}</span></p>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top: 8px;">
          <button class="btn" id="startRanked">Start Search</button>
          <button class="btn ghost" id="cancelRanked" disabled>Cancel Search</button>
          <button class="btn ghost" id="backToLobby">Go Back</button>
        </div>
      </div>
    `;

    const startRanked = el.querySelector("#startRanked");
    const cancelRanked = el.querySelector("#cancelRanked");

    startRanked.addEventListener("click", async () => {
      try {
        setMatchMode("ranked");
        await connectSocket();
        socket.emit("ranked_queue_join");
      } catch (error) {
        lobbyMessageEl.textContent = error?.message || "Unable to connect to ranked queue.";
      }
    });

    cancelRanked.addEventListener("click", () => {
      socket.emit("ranked_queue_leave");
    });

    wireBackToLobby();
  };

  el.querySelector("#modeCpu").addEventListener("click", showCPUOptions);
  el.querySelector("#modeLocal").addEventListener("click", showRoomOptions);
  el.querySelector("#modeRanked").addEventListener("click", showRankedOptions);

  if (initialView === "room") {
    showRoomOptions();
  }
  if (initialView === "cpu") {
    showCPUOptions();
  }
  if (initialView === "ranked") {
    showRankedOptions();
  }

  const handleUsernameChange = async (buttonToDisable) => {
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
        <button id="viewLeaderboard" class="btn ghost">View Leaderboard</button>
      </div>
    `;

    const closeSettingsBtn = cardEl.querySelector("#closeSettings");
    const settingsChangeUsernameBtn = cardEl.querySelector("#changeUsername");
    const settingsLogoutBtn = cardEl.querySelector("#logout");
    const viewLeaderboardBtn = cardEl.querySelector("#viewLeaderboard");
    settingsChangeUsernameBtn.insertAdjacentElement("afterend", lobbyMessage);

    settingsLogoutBtn.addEventListener("click", async () => {
      if (rankedQueueActive) {
        socket.emit("ranked_queue_leave");
      }
      await logout();
      window.location.hash = "#/";
    });

    viewLeaderboardBtn.addEventListener("click", () => {
      window.location.hash = "#/leaderboard";
    });

    closeSettingsBtn.addEventListener("click", () => {
      root.innerHTML = "";
      renderLobby(root, { initialView: lobbyView });
    });

    settingsChangeUsernameBtn.addEventListener("click", () => {
      handleUsernameChange(settingsChangeUsernameBtn);
    });
  });

  window.addEventListener(
    "hashchange",
    () => {
      cleanupLobbySocketHandlers?.();
      cleanupLobbySocketHandlers = null;
    },
    { once: true },
  );
}
