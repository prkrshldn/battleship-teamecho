import { getCurrentUser, logout, updateUsername } from "../auth";
import { socket, connectSocket } from "../socket";
import {
  state,
  setMatchMode,
  setPlayerName,
  setRoomId,
  setRoomRole,
  setSettings,
  applyShipPreset,
} from "../state";
import { getRank } from "../util/rank";

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
          <p>Logged in as: <span id="playerName" style="display:inline-flex; align-items:center; gap:6px; vertical-align:middle;"></span></p>
        </div>
          <p class="muted" style="margin: 0; text-align: right;">Online now: <strong id="onlineUsersCount">0</strong></p>
      </div>
      <div class="hr"></div>
      <p class="muted" id="lobbyMessage">Welcome to Battleship!</p>
      <div class="grid2" id="modeOrRoomGrid">
        <div>
          <h2>Play mode</h2>
          <button class="lobby-btn" id="playerVs">Player Vs. Player</button>
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
  const onlineUsersCountEl = el.querySelector("#onlineUsersCount");
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
  let playerCurrentElo = getCurrentUser()?.user_metadata?.current_elo || 1000;
  
  const updatePlayerName = (name) => {
    const rank = getRank(playerCurrentElo);
    if (playerNameEl) {
      playerNameEl.innerHTML = `${rank.svg} ${name}`;
    }
  };

  const updateOnlineUsersCount = (payload) => {
    const count = Number(payload?.count);
    if (!Number.isFinite(count)) return;

    if (onlineUsersCountEl) {
      onlineUsersCountEl.textContent = String(Math.max(0, Math.floor(count)));
    }
  };

  updatePlayerName(state.playerName || accountUsername || "Unknown");

  const makeCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 5; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  };

  const modeOrRoomGrid = el.querySelector("#modeOrRoomGrid");

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
  socket.on("online_users_update", updateOnlineUsersCount);

  if (socket.connected) {
    socket.emit("online_users_request");
  } else {
    connectSocket().then(() => socket.emit("online_users_request")).catch(() => {});
  }

  cleanupLobbySocketHandlers = () => {
    stopRankedTimer();
    socket.off("ranked_queue_joined", onRankedQueueJoinedWithElo);
    socket.off("ranked_queue_left", onRankedQueueLeft);
    socket.off("ranked_match_found", onRankedMatchFound);
    socket.off("connect_error", onConnectError);
    socket.off("online_users_update", updateOnlineUsersCount);
  };

  const wireRoomActions = () => {
    const createBtn = el.querySelector("#create");
    const joinBtn = el.querySelector("#join");
    const roomInput = el.querySelector("#room");
    const boardSizeSelect = el.querySelector("#boardSize");
    const shipPresetSelect = el.querySelector("#shipPreset");
    const difficultySelect = el.querySelector("#difficulty");
    const createRoleSelect = el.querySelector("#createRole");
    const joinRoleSelect = el.querySelector("#joinRole");

    if (boardSizeSelect) {
      boardSizeSelect.value = String(state.settings?.boardSize || 10);
    }
    if (difficultySelect) {
      difficultySelect.value = state.settings?.difficulty || "normal";
    }
    if (shipPresetSelect) {
      const currentShipCount = state.settings?.ships?.length || 5;
      if (currentShipCount <= 3) shipPresetSelect.value = "light";
      else if (currentShipCount >= 6) shipPresetSelect.value = "heavy";
      else shipPresetSelect.value = "standard";
    }

    if (createBtn) {
      createBtn.addEventListener("click", () => {
        if (!state.playerName || state.playerName.length < 2) {
          window.location.hash = "#/";
          return;
        }

        setMatchMode("local");

        if (boardSizeSelect && shipPresetSelect && difficultySelect) {
          applyShipPreset(shipPresetSelect.value);
          setSettings({
            boardSize: Number(boardSizeSelect.value),
            difficulty: difficultySelect.value,
          });
        }

        setRoomRole(createRoleSelect?.value || "left");

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

        setRoomRole(joinRoleSelect?.value || "left");
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
        <label class="label">Board size</label>
        <select class="input" id="boardSize">
          <option value="8">8 x 8</option>
          <option value="10">10 x 10</option>
          <option value="12">12 x 12</option>
        </select>
        <br>
        <label class="label">Ship count preset</label>
        <select class="input" id="shipPreset">
          <option value="light">Light</option>
          <option value="standard">Standard</option>
          <option value="heavy">Heavy</option>
        </select>
        <br>
        <label class="label">Difficulty</label>
        <select class="input" id="difficulty">
          <option value="easy">Easy</option>
          <option value="normal">Normal</option>
          <option value="hard">Hard</option>
        </select>
        <br>
        <button class="btn" id="create">Create</button>
        <p class="tiny muted">These settings apply to the local room you create.</p>
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
        <label class="label">Board size</label>
        <select class="input" id="boardSize">
          <option value="8">8 x 8</option>
          <option value="10">10 x 10</option>
          <option value="12">12 x 12</option>
        </select>
        <br>
        <label class="label">Ship count preset</label>
        <select class="input" id="shipPreset">
          <option value="light">Light</option>
          <option value="standard">Standard</option>
          <option value="heavy">Heavy</option>
        </select>
        <br>
        <label class="label">Difficulty</label>
        <select class="input" id="difficulty">
          <option value="easy">Easy</option>
          <option value="normal">Normal</option>
          <option value="hard">Hard</option>
        </select>
        <br>
        <button class="btn" id="createCpu">Start game vs CPU</button>
        <p class="tiny muted">Generates a code and takes you to the game.</p>
        <button class="btn ghost" id="backToLobby" style="margin-top:10px;">Go Back</button>
      </div>
    `;

    wireRoomActions();
    wireBackToLobby();

    const createCpuBtn = el.querySelector("#createCpu");
    const boardSizeSelect = el.querySelector("#boardSize");
    const shipPresetSelect = el.querySelector("#shipPreset");
    const difficultySelect = el.querySelector("#difficulty");

    if (createCpuBtn) {
      createCpuBtn.addEventListener("click", () => {
        if (!state.playerName || state.playerName.length < 2) {
          window.location.hash = "#/";
          return;
        }

        setMatchMode("cpu");
        setRoomRole("left");

        if (boardSizeSelect && shipPresetSelect && difficultySelect) {
          applyShipPreset(shipPresetSelect.value);
          setSettings({
            boardSize: Number(boardSizeSelect.value),
            difficulty: difficultySelect.value,
          });
        }

        const code = makeCode();
        setRoomId(code);
        window.location.hash = `#/game/${code}`;
      });
    }
  };

  const showPlayerVsOptions = () => {
    lobbyView = "playerVs";
    lobbyMessageEl.textContent = "Player vs Player: create or join a room with a code. Stats do not change.";
    modeOrRoomGrid.innerHTML = `
        <div>
          <h2>Play mode</h2>
          <button class="lobby-btn" id="modeLocal">Local Match (Room Code)</button>
          <button class="lobby-btn" id="modeRanked" style="margin-top:10px;">Ranked Matchmaking</button>
          <div style="display: flex; gap: 10px; margin-top: 10px;">
            <button id="viewLeaderboard" class="btn ghost" style="flex: 1;">View Ranked Leaderboard</button>
            <button id="viewRanks" class="btn ghost" style="flex: 1;">View Competitive Ranks</button>
          </div>
        </div>
      `;
          
      el.querySelector("#modeLocal").addEventListener("click", showRoomOptions);
      el.querySelector("#modeRanked").addEventListener("click", showRankedOptions);
      el.querySelector("#viewLeaderboard").addEventListener("click", showLeaderboard);
      el.querySelector("#viewRanks").addEventListener("click", showRanks);

    wireRoomActions();
    wireBackToLobby();
  }

  const showLeaderboard = () => {
    lobbyView = "lb";
    window.location.hash = "#/leaderboard";
    
    wireRoomActions();
    wireBackToLobby();
  };

  const showRanks = () => {
    lobbyView = "ranks";
    window.location.hash = "#/ranks";
    
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
        setRoomRole("left");
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
  el.querySelector("#playerVs").addEventListener("click", showPlayerVsOptions);
  el.querySelector("#modeCpu").addEventListener("click", showCPUOptions);
  
  if (initialView === "lb") {
    showLeaderboard();
  }

  if (initialView === "playerVs") {
    showPlayerVsOptions();
  }

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
      updatePlayerName(trimmedName);
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

    const wins = getCurrentUser()?.user_metadata?.wins || 0;
    const losses = getCurrentUser()?.user_metadata?.losses || 0;
    const best_elo = getCurrentUser()?.user_metadata?.best_elo || playerCurrentElo;

    cardEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div class="settings" id="closeSettings" title="Close settings">
          <i class="fa-solid fa-x"></i>
        </div>
        <p>Logged in as: <span id="playerNameSettings" style="display:inline-flex; align-items:center; gap:6px; vertical-align:middle;">${getRank(playerCurrentElo).svg} ${state.playerName || accountUsername || "Unknown"}</span></p>
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
