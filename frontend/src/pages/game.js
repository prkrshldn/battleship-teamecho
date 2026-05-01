import { state, setSettings, setRoomRole } from "../state";
import { createBoard } from "../components/board";
import { socket, connectSocket } from "../socket";
import { getShipInfo } from "../util/shipGetInfo";
import { getRank } from "../util/rank";
import { getCurrentUser } from "../auth";

// Game state persistence helpers
function saveGameState(roomCode, gameData) {
  try {
    sessionStorage.setItem(`game_state_${roomCode}`, JSON.stringify(gameData));
  } catch (e) {
    console.warn("Failed to save game state:", e);
  }
}

function loadGameState(roomCode) {
  try {
    const data = sessionStorage.getItem(`game_state_${roomCode}`);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.warn("Failed to load game state:", e);
    return null;
  }
}

function clearGameState(roomCode) {
  try {
    sessionStorage.removeItem(`game_state_${roomCode}`);
  } catch (e) {
    console.warn("Failed to clear game state:", e);
  }
}

function normalizeRoomSettings(raw) {
  if (!raw || typeof raw !== "object") return null;

  const boardSizeValue = Number(raw.boardSize);
  const boardSize = [8, 10, 12].includes(boardSizeValue) ? boardSizeValue : 10;
  const difficultyValue = String(raw.difficulty || "normal").toLowerCase();
  const difficulty = ["easy", "normal", "hard"].includes(difficultyValue)
    ? difficultyValue
    : "normal";

  const ships = Array.isArray(raw.ships)
    ? raw.ships
      .map((ship) => ({
        key: String(ship?.key || ""),
        label: String(ship?.label || ship?.key || "Ship"),
        len: Number(ship?.len),
      }))
      .filter((ship) => ship.key && Number.isFinite(ship.len) && ship.len >= 2 && ship.len <= 6)
    : [];

  return {
    boardSize,
    difficulty,
    ships,
  };
}

function roomSettingsEqual(left, right) {
  const a = normalizeRoomSettings(left);
  const b = normalizeRoomSettings(right);
  if (!a || !b) return false;
  if (a.boardSize !== b.boardSize || a.difficulty !== b.difficulty) return false;
  if (a.ships.length !== b.ships.length) return false;

  return a.ships.every((ship, idx) => {
    const other = b.ships[idx];
    return (
      ship.key === other.key
      && ship.label === other.label
      && ship.len === other.len
    );
  });
}

function cloneGrid(grid) {
  if (!Array.isArray(grid)) return null;
  return grid.map((row) => (Array.isArray(row) ? row.slice() : row));
}

function buildDisplayGrid(participant) {
  if (!participant || !Array.isArray(participant.board)) return null;

  const grid = cloneGrid(participant.board) || [];
  const shotsReceived = Array.isArray(participant.shotsReceived) ? participant.shotsReceived : [];
  const ships = Array.isArray(participant.ships) ? participant.ships : [];

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (shotsReceived[r] && Number.isFinite(shotsReceived[r][c]) && shotsReceived[r][c] !== 0) {
        grid[r][c] = shotsReceived[r][c];
      }
    }
  }

  for (const ship of ships) {
    if ((ship.hits || 0) >= ship.len && Array.isArray(ship.coords)) {
      for (const coord of ship.coords) {
        if (grid[coord.r] && Number.isFinite(grid[coord.r][coord.c])) {
          grid[coord.r][coord.c] = 4;
        }
      }
    }
  }

  return grid;
}

function sortParticipantsByRole(participants = []) {
  const roleOrder = { left: 0, right: 1, middle: 2 };
  return [...participants].sort((left, right) => {
    const leftOrder = roleOrder[left?.role] ?? 99;
    const rightOrder = roleOrder[right?.role] ?? 99;
    return leftOrder - rightOrder;
  });
}

export function renderGame(root, { roomId }) {
  const el = document.createElement("div");
  el.className = "page wide";

  const code = roomId || state.roomId || "?????";
  const matchMode = ["ranked", "cpu"].includes(state.matchMode) ? state.matchMode : "local";
  const isCpuMode = matchMode === "cpu";
  const viewerRole = ["left", "right", "middle"].includes(state.roomRole) ? state.roomRole : "left";
  const isSpectator = viewerRole === "middle";
  const viewerRoleLabel = isSpectator ? "Spectator" : viewerRole === "left" ? "Left side" : "Right side";
  const roleSummaryHtml = matchMode === "local"
    ? ` · Role: <span class="mono">${viewerRoleLabel}</span>`
    : "";

  const settings = state.settings;
  const boardSize = settings.boardSize || 10;
  const shipsToPlace = settings.ships || [];
  const difficulty = settings.difficulty || "normal";

  const shipOptionsHtml = shipsToPlace
    .map(
      (ship) =>
        `<option value="${ship.key}">${ship.label} (${ship.len})</option>`,
    )
    .join("");

  const settingsSummaryHtml =
    matchMode === "local"
      ? `<p class="tiny muted">Board: ${boardSize}x${boardSize} · Ships: ${shipsToPlace.length} · Difficulty: ${difficulty}</p>`
      : "";


  const user = getCurrentUser();
  const playerCurrentElo = user?.user_metadata?.current_elo || 1000;
  const playerRank = getRank(playerCurrentElo);

  // --- HTML Layout ---
  el.innerHTML = `
    <div class="topbar">
      <div>
        <h1>Game</h1>
        <p class="muted">Mode: <span class="mono">${isCpuMode ? "VS CPU" : matchMode}</span> · Room: <span class="mono">${code}</span>${roleSummaryHtml} · Player: <span class="mono" style="display:inline-flex; align-items:center; gap:4px; vertical-align:middle; margin-top:-4px;">${playerRank.svg} ${state.playerName || "?"}</span></p>
        ${settingsSummaryHtml}
        <a class="btn" href="#/lobby">Leave</a>
      </div>
    </div>

    <div class="layout">
      <div class="panel">
        <h2 id="setup-heading">Setup</h2>
        <div id="setup-controls">
          <p class="muted" id="setup-intro">Place your ships, then click Ready.</p>
          <div class="row">
            <label class="label">Ship</label>
            <select class="input" id="ship">
              ${shipOptionsHtml}
            </select>
          </div>

          <div class="row">
            <button class="btn" id="rotate">Rotate</button>
            <span id="orientation-display" class="mono muted" style="margin-left: 10px;">Horizontal</span>
            <button class="btn" id="random">Random</button>
            <button class="btn danger" id="reset">Reset</button>
          </div>

          <button class="btn" id="ready">Ready</button>
          <div class="hr"></div>
        </div>

        <h2>Status</h2>
        <p id="status" class="mono">Connecting…</p>
        <div id="role-controls" style="display:none; margin-top:10px;">
          <div class="row" style="align-items:center; gap:8px;">
            <label class="label" for="roomRoleSelect" style="margin:0;">Role</label>
            <select class="input" id="roomRoleSelect" style="max-width:220px;">
              <option value="left">Left side</option>
              <option value="right">Right side</option>
              <option value="middle">Middle spectator</option>
            </select>
            <button class="btn ghost" id="applyRoomRole" type="button">Apply</button>
          </div>
          <p id="roleControlsHint" class="tiny muted" style="margin-top:6px;">Role changes are available in local rooms before match start.</p>
        </div>
        <button class="btn ghost" id="rejoinGame" style="display:none; margin-top:8px;">Rejoin Game</button>
        
        <div class="hr"></div>
        <p class="tiny muted" id="debug"></p>
        
        <div id="timer-panel" style="display: none; margin-top: 20px;">
          <div class="hr"></div>
          <h2>Turn Timer</h2>
          <div style="font-size: 2.5rem; color: #ffeb3b; text-align: center; margin-top: 10px; font-variant-numeric: tabular-nums;" id="timer-display">30</div>
        </div>

        <div id="powerup-panel" style="display: none; margin-top: 20px;">
          <div class="hr"></div>
          <h2>Power-Ups</h2>
          <div style="display: flex; gap: 10px; margin-top: 10px;">
            <button class="btn ghost" id="btn-sonar">Sonar (<span id="count-sonar">0</span>)</button>
            <button class="btn ghost" id="btn-doubleshot">Double Shot (<span id="count-doubleshot">0</span>)</button>
          </div>
          <p id="powerup-status" class="muted tiny" style="margin-top: 10px;">Select a power-up to use</p>
        </div>
        <div class="fleet-status" id="fleet-panel" style="display: none; pointer-events: none; visibility: hidden;">
          <h3>Enemy Fleet</h3>
          <div style="margin-bottom: 10px; font-size: 0.9rem; color: #ccc;">
            <span style="margin-right: 15px;">Hits: <strong id="hit-count" style="color: #ff4444;">0</strong></span>
            <span>Misses: <strong id="miss-count" style="color: #fff;">0</strong></span>
          </div>
          <div id="enemy-fleet" class="ship-list">
            <!-- Populated by JS -->
          </div>
        </div>
      </div>

      <div class="boards">
        <div class="boardWrap">
          <h2 id="primary-board-title">Your board</h2>
          <div id="myBoard"></div>
        </div>

        <div class="boardWrap">
          <h2 id="secondary-board-title">Opponent</h2>
          <div id="oppBoard"></div>
        </div>
      </div>

      <div class="ad-panel" id="ad-panel">
        <!-- Rendered by JS -->
      </div>
    </div>
  `;

  root.appendChild(el);

  // --- Components ---
  const my = createBoard({ size: boardSize, mode: "place" });
  const opp = createBoard({ size: boardSize, mode: "attack" });

  el.querySelector("#myBoard").appendChild(my.el);
  el.querySelector("#oppBoard").appendChild(opp.el);

  // --- Ads Logic ---
  const ads = [
    {
      title: "G-Pro X Superlight",
      copy: "Elevate your aim with the lightest gaming mouse. Zero resistance.",
      gradient: "linear-gradient(135deg, #ff007f, #7000ff, #00f0ff)",
      icon: "🖱️"
    },
    {
      title: "Cyber Drink Energy",
      copy: "Stay frosty and focused. Sugar-free energy for long gaming sessions.",
      gradient: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)",
      icon: "⚡"
    },
    {
      title: "CodeCamp JS Bootcamp",
      copy: "Master Javascript in 30 days. Build amazing web apps from scratch.",
      gradient: "linear-gradient(135deg, #fceabb, #f8b500, #ff416c)",
      icon: "💻"
    },
    {
      title: "Nova 7 Wireless",
      copy: "Immersive 3D audio. Hear them before they see you.",
      gradient: "linear-gradient(135deg, #4b6cb7, #182848, #ff00f0)",
      icon: "🎧"
    },
    {
      title: "ErgoChair Pro",
      copy: "Posture perfect. Support your back through endless campaigns.",
      gradient: "linear-gradient(135deg, #ff416c, #ff4b2b, #fceabb)",
      icon: "💺"
    }
  ];

  function renderAd() {
    const adPanel = el.querySelector("#ad-panel");
    const ad = ads[Math.floor(Math.random() * ads.length)];
    adPanel.innerHTML = `
      <span class="ad-tag">Advertisement</span>
      <div class="ad-image animated-grad" style="background: ${ad.gradient};">
        <div class="ad-icon-wrap">
          <span class="ad-icon">${ad.icon}</span>
        </div>
      </div>
      <p class="ad-title">${ad.title}</p>
      <p class="ad-copy">${ad.copy}</p>
    `;
  }
  renderAd();

  // --- State Variables ---
  let horizontal = true;
  let isMyTurn = false;
  let gameActive = false;
  let myHits = 0;
  let myMisses = 0;
  let myShipsSunk = 0;
  let activePowerup = null; // 'sonar', 'doubleShot', null
  let sonarCount = 0;
  let doubleShotCount = 0;

  const shipSelect = el.querySelector("#ship");
  const status = el.querySelector("#status");
  const roleControls = el.querySelector("#role-controls");
  const roleSelect = el.querySelector("#roomRoleSelect");
  const applyRoleBtn = el.querySelector("#applyRoomRole");
  const roleControlsHint = el.querySelector("#roleControlsHint");
  const rejoinBtn = el.querySelector("#rejoinGame");
  const debug = el.querySelector("#debug");
  const setupHeading = el.querySelector("#setup-heading");
  const setupPanel = el.querySelector("#setup-controls");
  const fleetPanel = el.querySelector("#fleet-panel");
  const powerupPanel = el.querySelector("#powerup-panel");
  const enemyFleetList = el.querySelector("#enemy-fleet");
  const hitCountEl = el.querySelector("#hit-count");
  const missCountEl = el.querySelector("#miss-count");
  const btnSonar = el.querySelector("#btn-sonar");
  const btnDoubleShot = el.querySelector("#btn-doubleshot");
  const powerupStatus = el.querySelector("#powerup-status");
  const countSonar = el.querySelector("#count-sonar");
  const countDoubleShot = el.querySelector("#count-doubleshot");
  const timerPanel = el.querySelector("#timer-panel");
  const timerDisplay = el.querySelector("#timer-display");
  const primaryBoardTitle = el.querySelector("#primary-board-title");
  const secondaryBoardTitle = el.querySelector("#secondary-board-title");
  const placed = new Set(); // tracks placed ship keys

  let timerInterval = null;
  let timeLeft = 30;

  function startTimer() {
    clearInterval(timerInterval);
    timeLeft = 30;
    timerDisplay.textContent = timeLeft;
    timerDisplay.style.color = "#ffeb3b";
    
    timerInterval = setInterval(() => {
      timeLeft--;
      timerDisplay.textContent = timeLeft;
      
      if (timeLeft <= 10) {
        timerDisplay.style.color = "#ff4444";
      }
      
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        socket.emit("turn_timeout", { roomCode: code });
      }
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerDisplay.textContent = "--";
    timerDisplay.style.color = "#666";
  }

  function setRoleControlsState(roomData) {
    if (!roleControls || !roleSelect || !applyRoleBtn) return;

    const canShow = !isCpuMode && matchMode === "local";
    roleControls.style.display = canShow ? "block" : "none";
    if (!canShow) return;

    roleSelect.value = viewerRole;

    const stateValue = roomData?.state;
    const inPlay = stateValue === "playing";
    roleSelect.disabled = inPlay;
    applyRoleBtn.disabled = inPlay;
    roleControlsHint.textContent = inPlay
      ? "Role is locked once the match starts."
      : "Select left, right, or middle and apply to switch role in this room.";
  }

  function setSpectatorLayout() {
    if (!isSpectator) return;
    setupHeading.style.display = "none";
    setupPanel.style.display = "none";
    setupPanel.style.pointerEvents = "none";
    fleetPanel.style.display = "none";
    powerupPanel.style.display = "none";
    timerPanel.style.display = "none";
    rejoinBtn.style.display = "none";
  }

  function updateBoardTitles(snapshot) {
    if (!isSpectator) {
      primaryBoardTitle.textContent = "Your board";
      secondaryBoardTitle.textContent = "Opponent";
      return;
    }

    const participants = sortParticipantsByRole(snapshot?.players || []);
    const leftPlayer = participants.find((participant) => participant.role === "left") || participants[0];
    const rightPlayer = participants.find((participant) => participant.role === "right") || participants[1];

    primaryBoardTitle.textContent = leftPlayer ? `${leftPlayer.name || "Left side"} (Left)` : "Left side";
    secondaryBoardTitle.textContent = rightPlayer ? `${rightPlayer.name || "Right side"} (Right)` : "Right side";
  }

  function syncSpectatorBoards(snapshot) {
    if (!isSpectator || !snapshot) return;

    const participants = sortParticipantsByRole(snapshot.players || []);
    const leftPlayer = participants.find((participant) => participant.role === "left") || participants[0];
    const rightPlayer = participants.find((participant) => participant.role === "right") || participants[1];

    if (leftPlayer) {
      const grid = buildDisplayGrid(leftPlayer);
      if (grid) my.setGrid(grid);
      if (Array.isArray(leftPlayer.ships)) my.setShips(leftPlayer.ships);
    }

    if (rightPlayer) {
      const grid = buildDisplayGrid(rightPlayer);
      if (grid) opp.setGrid(grid);
      if (Array.isArray(rightPlayer.ships)) opp.setShips(rightPlayer.ships);
    }

    updateBoardTitles(snapshot);
  }

  setSpectatorLayout();
  updateBoardTitles();
  setRoleControlsState();

  function getSunkShipsFromUI() {
    const sunkShips = [];
    el.querySelectorAll("#enemy-fleet .ship-item.sunk").forEach((shipEl) => {
      sunkShips.push(shipEl.id.replace("enemy-ship-", ""));
    });
    return sunkShips;
  }

  function persistGameState() {
    saveGameState(code, {
      myGrid: my.grid,
      oppGrid: opp.grid,
      myShips: my.getShips(),
      oppShips: opp.getShips(),
      myHits,
      myMisses,
      myShipsSunk,
      sonarCount,
      doubleShotCount,
      sunkShips: getSunkShipsFromUI(),
      isMyTurn,
      gameActive,
    });
  }

  function restoreGameState(savedState) {
    if (!savedState) return;

    if (Array.isArray(savedState.myShips)) {
      my.setShips(savedState.myShips);
    }
    if (Array.isArray(savedState.oppShips)) {
      opp.setShips(savedState.oppShips);
    }

    if (Array.isArray(savedState.myGrid)) {
      my.setGrid(savedState.myGrid);
    }
    if (Array.isArray(savedState.oppGrid)) {
      opp.setGrid(savedState.oppGrid);
    }

    myHits = Number(savedState.myHits) || 0;
    myMisses = Number(savedState.myMisses) || 0;
    myShipsSunk = Number(savedState.myShipsSunk) || 0;
    sonarCount = Number(savedState.sonarCount) || 0;
    doubleShotCount = Number(savedState.doubleShotCount) || 0;

    hitCountEl.textContent = myHits;
    missCountEl.textContent = myMisses;
    countSonar.textContent = sonarCount;
    countDoubleShot.textContent = doubleShotCount;

    if (Array.isArray(savedState.sunkShips)) {
      savedState.sunkShips.forEach((shipId) => {
        const shipEl = el.querySelector(`#enemy-ship-${shipId}`);
        if (shipEl) shipEl.classList.add("sunk");
      });
    }
  }

  // --- Helper Functions ---
  function updateStatus(msg) {
    status.textContent = msg;
  }

  function markPlaced(key) {
    placed.add(key);

    // Disable option in dropdown to give visual feedback
    const option = Array.from(shipSelect.options).find((o) => o.value === key);
    if (option) option.disabled = true;

    // Auto-select next available ship
    const nextOption = Array.from(shipSelect.options).find((o) => !o.disabled);
    if (nextOption) shipSelect.value = nextOption.value;

    if (placed.size === shipsToPlace.length) {
      updateStatus("All ships placed. Click Ready.");
    } else {
      updateStatus(`Placed ${placed.size}/${shipsToPlace.length} ships.`);
    }
  }

  function resetPlacementUI() {
    placed.clear();
    Array.from(shipSelect.options).forEach((o) => (o.disabled = false));
  }

  function setAllPlacedUI() {
    shipsToPlace.forEach((s) => placed.add(s.key));
    Array.from(shipSelect.options).forEach((o) => (o.disabled = true));
    updateStatus("All ships placed. Click Ready.");
  }

  function randomPlaceAllShips() {
    // keep trying until all ships placed
    my.clear();
    resetPlacementUI();

    const maxAttempts = 5000;
    let attempts = 0;

    for (const ship of shipsToPlace) {
      let placedOk = false;
      while (!placedOk && attempts < maxAttempts) {
        attempts++;
        const horizontalTry = Math.random() < 0.5;
        const r = Math.floor(Math.random() * boardSize);
        const c = Math.floor(Math.random() * boardSize);
        placedOk = my.placeShip({
          r,
          c,
          len: ship.len,
          horizontal: horizontalTry,
          name: ship.key,
        });
      }
      if (!placedOk) {
        // If we got unlucky and boxed ourselves in, start over.
        return randomPlaceAllShips();
      }
    }

    setAllPlacedUI();
  }

  // --- Socket Logic ---
  let hasJoined = false;
  let joinRetryTimer = null;
  let suppressUnloadRejoin = false;
  const rejoinStorageKey = `battleship:pending-rejoin:${code}`;
  let requiresManualRejoin = !isCpuMode && sessionStorage.getItem(rejoinStorageKey) === "1";

  const attemptJoin = () => {
    if (isCpuMode || hasJoined || requiresManualRejoin) return;
    socket.emit("join", code, state.playerName, {
      mode: matchMode,
      role: viewerRole,
      settings: {
        boardSize: state.settings?.boardSize,
        difficulty: state.settings?.difficulty,
        ships: state.settings?.ships,
      },
    });
    console.log(`${state.playerName} joining ${matchMode} room: ${code}`);
  };

  const onConnect = () => {
    if (requiresManualRejoin) {
      hasJoined = false;
      updateStatus("You were disconnected by refresh. Click Rejoin Game.");
      if (!isSpectator) rejoinBtn.style.display = "inline-block";
      return;
    }
    attemptJoin();
  };

  const onConnectError = (err) => {
    const message = err?.message || "Unable to connect to game server.";
    if (message.toLowerCase().includes("unauthorized")) {
      updateStatus("Session expired. Please log in again.");
      window.location.hash = "#/";
      return;
    }

    updateStatus(isSpectator ? "Connection issue while spectating." : "Connection issue. Click Rejoin Game to retry.");
    if (!isSpectator) rejoinBtn.style.display = "inline-block";
  };

  const onDisconnect = () => {
    if (isCpuMode) return;
    hasJoined = false;
    updateStatus(isSpectator ? "Disconnected from room." : "Disconnected from game. Click Rejoin Game.");
    if (!isSpectator) rejoinBtn.style.display = "inline-block";
  };

  const onReconnected = (data) => {
    updateStatus("Reconnected to the game!");
    hasJoined = true;
    requiresManualRejoin = false;
    sessionStorage.removeItem(rejoinStorageKey);
    if (joinRetryTimer) {
      clearTimeout(joinRetryTimer);
      joinRetryTimer = null;
    }
    rejoinBtn.style.display = "none";
    // If the game already started, we stay in the current state
    if (data.isReady) {
      setAllPlacedUI();
    }
  };

  const onJoinSuccess = (data) => {
    const serverRole = ["left", "right", "middle"].includes(data?.role) ? data.role : null;
    if (serverRole) {
      setRoomRole(serverRole);
      if (matchMode === "local" && serverRole !== viewerRole) {
        suppressUnloadRejoin = true;
        hasJoined = false;
        requiresManualRejoin = false;
        sessionStorage.removeItem(rejoinStorageKey);
        updateStatus("Syncing assigned role...");
        window.location.reload();
        return;
      }
    }

    const roomSettings = normalizeRoomSettings(data?.settings);
    if (!isCpuMode && roomSettings && !roomSettingsEqual(state.settings, roomSettings)) {
      setSettings(roomSettings);
      suppressUnloadRejoin = true;
      hasJoined = false;
      requiresManualRejoin = false;
      sessionStorage.removeItem(rejoinStorageKey);
      updateStatus("Syncing room settings...");
      window.location.reload();
      return;
    }

    hasJoined = true;
    requiresManualRejoin = false;
    sessionStorage.removeItem(rejoinStorageKey);
    if (joinRetryTimer) {
      clearTimeout(joinRetryTimer);
      joinRetryTimer = null;
    }
    rejoinBtn.style.display = "none";

    if (isSpectator && data?.snapshot) {
      syncSpectatorBoards(data.snapshot);
      updateStatus(data?.state === "playing" ? "Spectating live match." : "Spectating local room.");
    }

    setRoleControlsState(data);
  };

  socket.on("connect", onConnect);
  socket.on("connect_error", onConnectError);
  socket.on("disconnect", onDisconnect);
  socket.on("reconnected", onReconnected);
  socket.on("join_success", onJoinSuccess);

  const onJoinError = (data) => {
    const message = data?.message || "Failed to join this room.";
    hasJoined = false;
    updateStatus(message);
    if (!isSpectator) rejoinBtn.style.display = "inline-block";
  };

  socket.on("join_error", onJoinError);

  const onPlayerStats = (stats) => {
    if (stats.powerups) {
      sonarCount = stats.powerups.sonar || 0;
      doubleShotCount = stats.powerups.doubleShot || 0;
      countSonar.textContent = sonarCount;
      countDoubleShot.textContent = doubleShotCount;
    }
  };
  socket.on("player_stats", onPlayerStats);

  socket.on("sonar_result", (data) => {
    updateStatus(data.found.length > 0 ? `Sonar found ${data.found.length} ship parts! Still your turn.` : `Sonar found nothing. Still your turn!`);
    sonarCount = data.remaining;
    countSonar.textContent = sonarCount;
    data.found.forEach(cell => {
      opp.markSonar(cell.r, cell.c);
    });
    startTimer();

    persistGameState();
  });

  socket.on("double_shot_activated", (data) => {
    updateStatus("Double shot activated! Your next miss won't end your turn.");
    doubleShotCount = data.remaining;
    countDoubleShot.textContent = doubleShotCount;
    document.body.classList.add("double-shot-active");

    persistGameState();
  });

  socket.on("bonus_turn", (data) => {
    document.body.classList.remove("double-shot-active");
    updateStatus(data.message);
    isMyTurn = true;
    startTimer();

    persistGameState();
  });

  socket.on("room_update", (data) => {
    const iAmInRoom = Array.isArray(data?.participants)
      ? data.participants.some((p) => p.id === socket.id)
      : Array.isArray(data?.players)
        ? data.players.some((p) => p.id === socket.id)
        : false;
    if (iAmInRoom) {
      hasJoined = true;
      rejoinBtn.style.display = "none";
      if (joinRetryTimer) {
        clearTimeout(joinRetryTimer);
        joinRetryTimer = null;
      }
    }

    if (isSpectator && data?.snapshot) {
      syncSpectatorBoards(data.snapshot);
    }

    const players = Array.isArray(data?.players) ? data.players : [];
    const spectators = Array.isArray(data?.spectators) ? data.spectators : [];
    const count = Array.isArray(data?.participants) ? data.participants.length : players.length + spectators.length;
    const readyCount = players.filter((p) => p.ready).length;
    debug.textContent = `Players in room: ${players.length}. Spectators: ${spectators.length}. Ready: ${readyCount}`;

    if (!gameActive) {
      if (isSpectator) {
        updateStatus(data?.state === "playing" ? "Spectating live match." : "Spectating local room.");
      } else {
        updateStatus(
          count < 2
            ? "Waiting for opponent to join..."
            : "Opponent connected. Place ships!",
        );
      }
    }

    setRoleControlsState(data);
  });

  if (isCpuMode) {
    updateStatus("Place your ships, then click Ready.");
    debug.textContent = "CPU opponent selected.";
  } else {
    if (requiresManualRejoin) {
      hasJoined = false;
      updateStatus("You were disconnected by refresh. Click Rejoin Game.");
      rejoinBtn.style.display = "inline-block";
      if (!socket.connected) {
        connectSocket().catch((err) => {
          onConnectError(err);
        });
      }
    } else if (socket.connected) {
      onConnect();
    } else {
      connectSocket().catch((err) => {
        onConnectError(err);
      });
    }
  }

  // Render initial enemy fleet (hidden)
  function renderEnemyFleet() {
    enemyFleetList.innerHTML = "";
    shipsToPlace.forEach((ship) => {
      const div = document.createElement("div");
      div.className = "ship-item";
      div.id = `enemy-ship-${ship.key}`;
      div.innerHTML = `<span>${ship.label || ship.key}</span> <span>${ship.len}</span>`;
      enemyFleetList.appendChild(div);
    });
  }
  renderEnemyFleet();

  socket.on("game_start", (data) => {
    if (isSpectator && data?.snapshot) {
      syncSpectatorBoards(data.snapshot);
    }

    hasJoined = true;
    rejoinBtn.style.display = "none";
    if (joinRetryTimer) {
      clearTimeout(joinRetryTimer);
      joinRetryTimer = null;
    }

    gameActive = true;
    setupHeading.style.display = "none";
    setupPanel.style.display = "none";
    setupPanel.style.pointerEvents = "none";

    if (isSpectator) {
      fleetPanel.style.display = "none";
      powerupPanel.style.display = "none";
      timerPanel.style.display = "none";
      updateStatus("Spectating live match.");
      isMyTurn = false;
      stopTimer();
    } else {
      fleetPanel.style.visibility = "visible";
      fleetPanel.style.display = "block";
      powerupPanel.style.display = "block";

      isMyTurn = data.turn === socket.id;
      updateStatus(
        isMyTurn
          ? "Game Started! YOUR TURN. Fire!"
          : "Game Started! Opponent's turn.",
      );

      timerPanel.style.display = "block";
      if (isMyTurn) startTimer();
      else stopTimer();
    }

    if (data?.rejoin) {
      restoreGameState(loadGameState(code));
    }

    persistGameState();

    setRoleControlsState({ state: "playing" });

    // Switch boards to game mode visual if needed
  });

  socket.on("turn_change", (data) => {
    if (isSpectator) {
      updateStatus("Spectating live match.");
      return;
    }

    document.body.classList.remove("double-shot-active");
    isMyTurn = data.turn === socket.id;
    updateStatus(isMyTurn ? "YOUR TURN. Fire!" : "Opponent's turn...");
    
    if (isMyTurn) startTimer();
    else stopTimer();

    persistGameState();
  });

  socket.on("shot_result", (data) => {
    if (isSpectator && data?.snapshot) {
      syncSpectatorBoards(data.snapshot);
      persistGameState();
      return;
    }

    // data = { shooter, r, c, hit }
    const iShot = data.shooter === socket.id;
    
    // Shake board on hit
    if (data.hit && !data.sunk) {
      const targetBoard = iShot ? opp.el : my.el;
      targetBoard.classList.remove("shake-board");
      void targetBoard.offsetWidth; // trigger reflow
      targetBoard.classList.add("shake-board");
      setTimeout(() => targetBoard.classList.remove("shake-board"), 400);
    }

    if (iShot) {
      // I shot at opponent
      opp.markShot(data.r, data.c, data.hit ? "hit" : "miss");

      // Update counters
      if (data.hit) {
        myHits++;
        hitCountEl.textContent = myHits;
        updateStatus("Direct HIT!");
        startTimer(); // Reset timer to 30 for the continuation shot
      } else {
        myMisses++;
        missCountEl.textContent = myMisses;
        updateStatus("Missed!");
        stopTimer();
      }

      console.log(`Shot at (${data.r}, ${data.c}) was a ${data.hit}`);
    } else {
      // Opponent shot at me
      my.markShot(data.r, data.c, data.hit ? "hit" : "miss");
    }

    if (data.sunk) {
      const iSunkIt = data.shooter === socket.id;

      const targetBoard = iSunkIt ? opp.el : my.el;
      targetBoard.classList.remove("shake-board-heavy");
      void targetBoard.offsetWidth; // trigger reflow
      targetBoard.classList.add("shake-board-heavy");
      setTimeout(() => targetBoard.classList.remove("shake-board-heavy"), 600);

      if (iSunkIt) {
        // I sunk opponent's ship
        myShipsSunk++;
        updateStatus(`YOU SUNK THEIR ${data.sunk.toUpperCase()}!`);
        const shipEl = el.querySelector(`#enemy-ship-${data.sunk}`);
        if (shipEl) {
          shipEl.classList.add("sunk");
        }
        if (data.sunkCoords) {
          opp.getShips().push({ name: data.sunk, coords: data.sunkCoords });
          opp.markSunk(data.sunk);
        }
      } else {
        // My ship was sunk
        updateStatus(`YOUR ${data.sunk.toUpperCase()} WAS SUNK!`);
        // Mark on my board
        my.markSunk(data.sunk);
      }
    }

    persistGameState();
  });

  socket.on("game_over", (data) => {
    gameActive = false;
    isMyTurn = false;
    requiresManualRejoin = false;
    sessionStorage.removeItem(rejoinStorageKey);
    stopTimer();

  // Clear saved game state
  clearGameState(code);

    if (isSpectator && data?.snapshot) {
      syncSpectatorBoards(data.snapshot);
    }

    const isForfeit = data.forfeit;

    const summaryEntries = sortParticipantsByRole(Object.values(data.summary || {}));
    const mySummary = data.summary?.[socket.id] || null;
    const oppId = mySummary ? Object.keys(data.summary).find((id) => id !== socket.id) : null;
    const oppSummary = oppId ? data.summary[oppId] : null;
    const spectatorView = isSpectator || !mySummary;

    if (spectatorView) {
      updateStatus(`MATCH OVER ${isForfeit ? "(Forfeit)" : ""}`.trim());
    } else {
      const iWon = data.winnerId === socket.id;
      updateStatus(iWon ? `GAME OVER — YOU WIN 🏆 ${isForfeit ? "(Opponent Forfeited)" : ""}` : `GAME OVER — YOU LOSE ${isForfeit ? "(You Forfeited)" : ""}`);
    }

    let myEloHtml = "";
    let oppEloHtml = "";
    let powerupMsg = "";
    if (!spectatorView && data.eloChanges) {
      const iWon = data.winnerId === socket.id;
      const myEloChange = iWon ? `+${data.eloChanges.winnerGain}` : `${data.eloChanges.loserLoss}`;
      const myNewElo = iWon ? data.eloChanges.winnerNewElo : data.eloChanges.loserNewElo;
      const myOldElo = iWon ? data.eloChanges.winnerOldElo : data.eloChanges.loserOldElo;
      const myOldRank = getRank(myOldElo);
      const myNewRank = getRank(myNewElo);

      const oppEloChange = !iWon ? `+${data.eloChanges.winnerGain}` : `${data.eloChanges.loserLoss}`;
      const oppNewElo = !iWon ? data.eloChanges.winnerNewElo : data.eloChanges.loserNewElo;
      const oppNewRank = getRank(oppNewElo);

      myEloHtml = `<div style="display: flex; align-items: center; gap: 8px;">
        ${myNewRank.svg}
        <p class="mono" style="color: ${iWon ? '#4ade80' : '#f87171'}; margin: 0;">ELO: ${myNewElo} (${myEloChange})</p>
      </div>`;
      oppEloHtml = `<div style="display: flex; align-items: center; gap: 8px;">
        ${oppNewRank.svg}
        <p class="mono" style="color: ${!iWon ? '#4ade80' : '#f87171'}; margin: 0;">ELO: ${oppNewElo} (${oppEloChange})</p>
      </div>`;

      if (myNewRank.level > myOldRank.level) {
        powerupMsg = `<div class="rank-up-anim">
          <h3 style="color: #4ade80; margin: 0;">RANK UP!</h3>
          ${myNewRank.svg}
          <p style="font-weight: bold; margin: 0; color: ${myNewRank.color}">${myNewRank.name}</p>
        </div>` + powerupMsg;
      } else if (myNewRank.level < myOldRank.level) {
        powerupMsg = `<div class="rank-down-anim">
          <h3 style="color: #f87171; margin: 0;">RANK DOWN</h3>
          ${myNewRank.svg}
          <p style="font-weight: bold; margin: 0; color: ${myNewRank.color}">${myNewRank.name}</p>
        </div>` + powerupMsg;
      }

      if (iWon && data.eloChanges.winnerPowerupAwarded) {
        powerupMsg = `<p style="color: #fbbf24; font-weight: bold; margin-bottom: 2px;">🎁 Win Reward: 1x ${data.eloChanges.winnerPowerupAwarded === 'sonar' ? 'Sonar' : 'Double Shot'}!</p>`;

        const b = data.eloChanges.bonuses || {};
        if (b.flawless) powerupMsg += `<p style="color: #38bdf8; font-weight: bold; margin-bottom: 2px;">🎯 Flawless Victory: +1 Sonar, +1 Double Shot!</p>`;
        if (b.streak) powerupMsg += `<p style="color: #f472b6; font-weight: bold; margin-bottom: 2px;">🔥 3-Win Streak: +2 Sonars, +2 Double Shots!</p>`;
        if (b.eloTier) powerupMsg += `<p style="color: #a78bfa; font-weight: bold; margin-bottom: 2px;">⭐ New ELO Tier: +1 Sonar, +1 Double Shot!</p>`;
      }
    }

    const spectatorSummaryHtml = spectatorView
      ? `
        <div class="summary-grid">
          ${summaryEntries
            .slice(0, 2)
            .map((entry) => `
              <div>
                <h3>${entry.role === "left" ? "Left side" : entry.role === "right" ? "Right side" : entry.name || "Player"}</h3>
                <p class="muted">${entry.name || "Player"}</p>
                <p class="mono">Hits: ${entry.hits} · Misses: ${entry.misses}</p>
                <p class="mono">Ships sunk: ${entry.shipsSunk}</p>
                <p class="tiny muted">Sunk: ${(entry.sunkShips || []).join(", ") || "—"}</p>
              </div>
            `)
            .join("")}
        </div>
      `
      : "";

    // Render a simple end-of-game summary panel
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-card">
        <h2>${spectatorView ? "Match Complete" : (data.winnerId === socket.id ? "Victory" : "Defeat")} ${isForfeit ? "<span style='font-size: 0.6em; color: #f87171;'>(Forfeit)</span>" : ""}</h2>
        <p class="muted">End-of-game summary</p>
        <div class="hr"></div>
        ${spectatorView ? spectatorSummaryHtml : `
          <div class="summary-grid">
            <div>
              <h3>You</h3>
              ${powerupMsg}
              ${myEloHtml}
              <p class="mono">Hits: ${mySummary.hits} · Misses: ${mySummary.misses}</p>
              <p class="mono">Ships sunk: ${mySummary.shipsSunk}</p>
              <p class="tiny muted">Sunk: ${(mySummary.sunkShips || []).join(", ") || "—"}</p>
            </div>
            <div>
              <h3>${oppSummary?.name || "Opponent"}</h3>
              ${oppEloHtml}
              <p class="mono">Hits: ${oppSummary?.hits ?? 0} · Misses: ${oppSummary?.misses ?? 0}</p>
              <p class="mono">Ships sunk: ${oppSummary?.shipsSunk ?? 0}</p>
              <p class="tiny muted">Sunk: ${(oppSummary?.sunkShips || []).join(", ") || "—"}</p>
            </div>
          </div>
        `}
        <div class="hr"></div>
        <div style="display: flex; gap: 10px; justify-content: center;">
          <a class="btn" href="#/lobby">Back to lobby</a>
          <a class="btn ghost" href="#/leaderboard">View Leaderboard</a>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // stop listening to turn events so it doesn't flicker status after game end
    socket.off("turn_change");
    socket.off("opponent_disconnected");
  });

  socket.on("opponent_disconnected", (data) => {
    updateStatus(`Opponent disconnected! They have ${data.timeout}s to reconnect or they forfeit...`);
  });

  socket.on("role_change_error", (data) => {
    updateStatus(data?.message || "Unable to change role.");
  });

  socket.on("role_changed", (data) => {
    if (!data?.role) return;
    setRoomRole(data.role);
    suppressUnloadRejoin = true;
    sessionStorage.removeItem(rejoinStorageKey);
    window.location.reload();
  });

  if (applyRoleBtn && roleSelect) {
    applyRoleBtn.addEventListener("click", () => {
      const nextRole = String(roleSelect.value || "left").toLowerCase();
      if (!["left", "right", "middle"].includes(nextRole)) return;
      if (nextRole === viewerRole) {
        updateStatus("You are already on that role.");
        return;
      }
      socket.emit("set_role", { roomCode: code, role: nextRole });
    });
  }

  rejoinBtn.addEventListener("click", () => {
    if (isCpuMode) return;
    hasJoined = false;
    requiresManualRejoin = false;
    if (socket.connected) {
      attemptJoin();
      return;
    }

    connectSocket()
      .then(() => {
        attemptJoin();
      })
      .catch((err) => {
        onConnectError(err);
      });
  });

  // --- Event Listeners ---

  const onBeforeUnload = () => {
    if (isCpuMode) return;
    if (isSpectator) return;
    if (suppressUnloadRejoin) return;
    if (gameActive || hasJoined) {
      persistGameState();
      sessionStorage.setItem(rejoinStorageKey, "1");
    }
  };

  window.addEventListener("beforeunload", onBeforeUnload);

  const leaveBtn = el.querySelector(".topbar a.btn");
  leaveBtn.addEventListener("click", (e) => {
    if (!isCpuMode) {
      sessionStorage.removeItem(rejoinStorageKey);
    }

    if (gameActive && !isCpuMode) {
      if (!confirm("Leaving now will forfeit the game. Are you sure?")) {
        e.preventDefault();
        return;
      }
      socket.emit("forfeit", { roomCode: code });
    }
  });

  // Rotate
  el.querySelector("#rotate").addEventListener("click", () => {
    horizontal = !horizontal;
    el.querySelector("#orientation-display").textContent = horizontal
      ? "Horizontal"
      : "Vertical";
    // visual feedback optional
  });

  // Reset
  el.querySelector("#reset").addEventListener("click", () => {
    my.clear();
    resetPlacementUI();
    updateStatus("Reset. Place your ships.");
  });

  // Random
  el.querySelector("#random").addEventListener("click", () => {
    if (gameActive) return;
    randomPlaceAllShips();
  });

  // Place Ship (Click on My Board)
  my.onCellClick((r, c) => {
    if (gameActive) return; // Can't place during game

    const info = getShipInfo(shipSelect, shipsToPlace);
    if (!info) return;

    if (placed.has(info.key)) {
      updateStatus("You already placed this ship!");
      return;
    }

    const ok = my.placeShip({
      r,
      c,
      len: info.len,
      horizontal,
      name: info.key,
    });
    if (ok) markPlaced(info.key);
    else updateStatus("Invalid placement.");
  });

  // Power-Ups
  btnSonar.addEventListener("click", () => {
    if (!gameActive || !isMyTurn) return;
    if (sonarCount <= 0) {
      updateStatus("No sonar available!");
      return;
    }
    activePowerup = activePowerup === "sonar" ? null : "sonar";
    powerupStatus.textContent = activePowerup === "sonar" ? "Sonar equipped: click on opponent board to scan 3x3 area" : "Select a power-up to use";
    btnSonar.classList.toggle("active", activePowerup === "sonar");
    btnDoubleShot.classList.remove("active");
  });

  btnDoubleShot.addEventListener("click", () => {
    if (!gameActive || !isMyTurn) return;
    if (doubleShotCount <= 0) {
      updateStatus("No double shot available!");
      return;
    }
    // Request activation from server
    socket.emit("activate_double_shot", { roomCode: code });
    activePowerup = null;
    powerupStatus.textContent = "Select a power-up to use";
    btnSonar.classList.remove("active");
  });

  // Ready Button
  el.querySelector("#ready").addEventListener("click", () => {
    if (placed.size !== shipsToPlace.length) {
      updateStatus("Place all ships first!");
      return;
    }

    updateStatus("Waiting for other player...");
    el.querySelector("#ready").disabled = true;
    el.querySelector("#reset").disabled = true;

    if (isCpuMode) {
      startCpuGame();
    } else {
      // Send valid board to server
      socket.emit("place_ships", {
        roomCode: code,
        grid: my.grid,
        ships: my.getShips(),
      });
    }
  });

  // Fire Shot (Click on Opponent Board)
  opp.onCellClick((r, c) => {
    if (!gameActive) return;
    if (!isMyTurn) {
      updateStatus("Not your turn!");
      return;
    }

    if (activePowerup === "sonar") {
      if (isCpuMode) {
        updateStatus("Sonar disabled against CPU!");
        activePowerup = null;
        powerupStatus.textContent = "Select a power-up to use";
        btnSonar.classList.remove("active");
        return;
      }
      socket.emit("use_sonar", { roomCode: code, r, c });
      activePowerup = null;
      powerupStatus.textContent = "Select a power-up to use";
      btnSonar.classList.remove("active");
      return;
    }

    const currentState = opp.grid[r][c];
    if (currentState === 2 || currentState === 3 || currentState === 4) {
      updateStatus("Already shot there! Fire somewhere else! ");
      return;
    }

    if (isCpuMode) {
      fireAtCpu(r, c);
    } else {
      socket.emit("fire", { roomCode: code, r, c });
    }
  });

  // --- CPU Logic ---
  let cpu = null;
  function createCpuFleet() {
    const grid = Array.from({ length: boardSize }, () => Array(boardSize).fill(0));
    const ships = [];

    function canPlace({ r, c, len, horizontal }) {
      if (horizontal) {
        if (c + len > boardSize) return false;
        for (let i = 0; i < len; i++) {
          if (grid[r][c + i] !== 0) return false;
        }
        return true;
      }
      if (r + len > boardSize) return false;
      for (let i = 0; i < len; i++) {
        if (grid[r + i][c] !== 0) return false;
      }
      return true;
    }

    function placeShip({ r, c, len, horizontal, name }) {
      if (!canPlace({ r, c, len, horizontal })) return false;

      const ship = { name, len, hits: 0, coords: [] };
      for (let i = 0; i < len; i++) {
        const coord = horizontal ? { r, c: c + i } : { r: r + i, c };
        grid[coord.r][coord.c] = 1;
        ship.coords.push(coord);
      }
      ships.push(ship);
      return true;
    }

    for (const ship of shipsToPlace) {
      let placedOk = false;
      let attempts = 0;
      while (!placedOk && attempts < 5000) {
        attempts++;
        placedOk = placeShip({
          r: Math.floor(Math.random() * boardSize),
          c: Math.floor(Math.random() * boardSize),
          len: ship.len,
          horizontal: Math.random() < 0.5,
          name: ship.key,
        });
      }
      if (!placedOk) return createCpuFleet(); // Try again if stuck
    }

    return {
      grid,
      ships,
      shotsReceived: Array.from({ length: boardSize }, () => Array(boardSize).fill(0)),
      stats: { hits: 0, misses: 0, shipsSunk: 0, sunkShips: [] },
      targetQueue: [],
      thinking: false,
    };
  }

  function getUnshotPlayerCells() {
    const cells = [];
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        if (my.grid[r][c] === 0 || my.grid[r][c] === 1) cells.push({ r, c });
      }
    }
    return cells;
  }

  function chooseCpuShot() {
    cpu.targetQueue = cpu.targetQueue.filter(cell => my.grid[cell.r][cell.c] === 0 || my.grid[cell.r][cell.c] === 1);
    if (cpu.targetQueue.length) return cpu.targetQueue[Math.floor(Math.random() * cpu.targetQueue.length)];

    const cells = getUnshotPlayerCells();
    if (difficulty === "easy") return cells[Math.floor(Math.random() * cells.length)];

    const checkerCells = cells.filter(({ r, c }) => (r + c) % 2 === 0);
    return checkerCells.length ? checkerCells[Math.floor(Math.random() * checkerCells.length)] : cells[Math.floor(Math.random() * cells.length)];
  }

  function showCpuGameOver(playerWon) {
    gameActive = false;
    isMyTurn = false;
    updateStatus(playerWon ? "GAME OVER - YOU WIN" : "GAME OVER - YOU LOSE");
    stopTimer();

    const sunkCpuShips = Array.from(enemyFleetList.querySelectorAll(".ship-item.sunk")).map((node) =>
      node.id.replace("enemy-ship-", ""),
    );

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-card">
        <h2>${playerWon ? "Victory" : "Defeat"}</h2>
        <p class="muted">End-of-game summary</p>
        <div class="hr"></div>
        <div class="summary-grid">
          <div>
            <h3>You</h3>
            <p class="mono">Hits: ${myHits} - Misses: ${myMisses}</p>
            <p class="mono">Ships sunk: ${myShipsSunk}</p>
            <p class="tiny muted">Sunk: ${sunkCpuShips.join(", ") || "-"}</p>
          </div>
          <div>
            <h3>CPU</h3>
            <p class="mono">Hits: ${cpu.stats.hits} - Misses: ${cpu.stats.misses}</p>
            <p class="mono">Ships sunk: ${cpu.stats.shipsSunk}</p>
            <p class="tiny muted">Sunk: ${cpu.stats.sunkShips.join(", ") || "-"}</p>
          </div>
        </div>
        <div class="hr"></div>
        <a class="btn" href="#/lobby">Back to lobby</a>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function getAdjacentCells({ r, c }) {
    return [
      { r: r - 1, c },
      { r: r + 1, c },
      { r, c: c - 1 },
      { r, c: c + 1 },
    ].filter((cell) => cell.r >= 0 && cell.c >= 0 && cell.r < boardSize && cell.c < boardSize);
  }

  function cpuFire() {
    if (!gameActive || isMyTurn || cpu.thinking) return;

    cpu.thinking = true;
    window.setTimeout(() => {
      cpu.thinking = false;
      if (!gameActive || isMyTurn) return;

      const target = chooseCpuShot();
      if (!target) return;

      const hit = my.grid[target.r][target.c] === 1;
      let sunkShipName = null;

      if (hit) {
        cpu.stats.hits++;
        const ship = my.getShips().find((s) =>
          s.coords.some((coord) => coord.r === target.r && coord.c === target.c),
        );
        if (ship) {
          ship.hits = (ship.hits || 0) + 1;
          if (ship.hits >= ship.len) {
            sunkShipName = ship.name;
            cpu.stats.shipsSunk++;
            if (!cpu.stats.sunkShips.includes(ship.name)) cpu.stats.sunkShips.push(ship.name);
            cpu.targetQueue = [];
          }
        }
        my.markShot(target.r, target.c, "hit");
        my.el.classList.remove("shake-board");
        void my.el.offsetWidth; 
        my.el.classList.add(sunkShipName ? "shake-board-heavy" : "shake-board");
        if (!sunkShipName) cpu.targetQueue.push(...getAdjacentCells(target));
      } else {
        cpu.stats.misses++;
        my.markShot(target.r, target.c, "miss");
      }

      if (sunkShipName) my.markSunk(sunkShipName);

      if (my.getShips().every((ship) => (ship.hits || 0) >= ship.len)) {
        showCpuGameOver(false);
        return;
      }

      if (hit) {
        updateStatus(sunkShipName ? `CPU sunk your ${sunkShipName.toUpperCase()} and fires again...` : "CPU hit and fires again...");
        cpuFire();
      } else {
        isMyTurn = true;
        updateStatus("CPU missed. YOUR TURN. Fire!");
        startTimer();
      }
    }, 650);
  }

  function startCpuGame() {
    cpu = createCpuFleet();
    gameActive = true;
    isMyTurn = true;
    setupHeading.style.display = "none";
    setupPanel.style.display = "none";
    setupPanel.style.pointerEvents = "none";
    fleetPanel.style.visibility = "visible";
    fleetPanel.style.display = "block";
    debug.textContent = "CPU placed ships and is ready.";
    updateStatus("Game Started! YOUR TURN. Fire!");
    startTimer();

      // Restore game state if player refreshed during gameplay
      const savedState = loadGameState(code);
      if (savedState) {
        // Restore my board and opponent board shots
        if (savedState.myGrid) {
          my.grid = savedState.myGrid;
          my.render();
        }
        if (savedState.oppGrid) {
          opp.grid = savedState.oppGrid;
          opp.render();
        }
        // Restore stats
        myHits = savedState.myHits || 0;
        myMisses = savedState.myMisses || 0;
        myShipsSunk = savedState.myShipsSunk || 0;
        hitCountEl.textContent = myHits;
        missCountEl.textContent = myMisses;
        // Restore powerups
        sonarCount = savedState.sonarCount || 0;
        doubleShotCount = savedState.doubleShotCount || 0;
        countSonar.textContent = sonarCount;
        countDoubleShot.textContent = doubleShotCount;
        // Mark sunk ships
        if (savedState.sunkShips) {
          savedState.sunkShips.forEach(shipKey => {
            const shipEl = el.querySelector(`#enemy-ship-${shipKey}`);
            if (shipEl) {
              shipEl.classList.add("sunk");
            }
          });
        }
        clearGameState(code);
      }
  }

  function fireAtCpu(r, c) {
    if (cpu.shotsReceived[r][c] !== 0) {
      updateStatus("Already shot there! Fire somewhere else!");
      return;
    }

    const hit = cpu.grid[r][c] === 1;
    cpu.shotsReceived[r][c] = hit ? 3 : 2;
    opp.markShot(r, c, hit ? "hit" : "miss");
    
    // Animate target opponent board
    if (hit) {
      opp.el.classList.remove("shake-board");
      void opp.el.offsetWidth;
      opp.el.classList.add("shake-board");
      setTimeout(() => opp.el.classList.remove("shake-board"), 400);
    }

    let sunkShipName = null;
    if (hit) {
      myHits++;
      hitCountEl.textContent = myHits;
      const ship = cpu.ships.find((s) => s.coords.some((coord) => coord.r === r && coord.c === c));
      if (ship) {
        ship.hits++;
        if (ship.hits >= ship.len) {
          sunkShipName = ship.name;
          myShipsSunk++;
          const shipEl = el.querySelector(`#enemy-ship-${ship.name}`);
          if (shipEl) shipEl.classList.add("sunk");
          opp.markSunk(ship.name);
        }
      }
    } else {
      myMisses++;
      missCountEl.textContent = myMisses;
    }

    if (cpu.ships.every((ship) => ship.hits >= ship.len)) {
      showCpuGameOver(true);
      return;
    }

    if (hit) {
      updateStatus(sunkShipName ? `YOU SUNK THE CPU'S ${sunkShipName.toUpperCase()}! Fire again.` : "Direct HIT! Fire again.");
      startTimer();
    } else {
      updateStatus("Missed! CPU's turn...");
      isMyTurn = false;
      stopTimer();
      cpuFire();
    }
  }

  // Cleanup on leave
  window.addEventListener(
    "hashchange",
    () => {
      const modal = document.querySelector(".modal");
      if (modal) modal.remove();

      socket.off("room_update");
      socket.off("game_start");
      socket.off("turn_change");
      socket.off("shot_result");
      socket.off("game_over");
      socket.off("player_stats", onPlayerStats);
      socket.off("join_error", onJoinError);
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      socket.off("disconnect", onDisconnect);
      socket.off("reconnected", onReconnected);
      socket.off("join_success", onJoinSuccess);
      socket.off("sonar_result");
      socket.off("double_shot_activated");
      socket.off("bonus_turn");
      socket.off("role_change_error");
      socket.off("role_changed");
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (joinRetryTimer) {
        clearTimeout(joinRetryTimer);
        joinRetryTimer = null;
      }
      clearInterval(timerInterval);
    },
    { once: true },
  );
}
