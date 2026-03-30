import { state } from "../state";
import { createBoard } from "../components/board";
import { socket, connectSocket } from "../socket";
import { getShipInfo } from "../util/shipGetInfo";

export function renderGame(root, { roomId }) {
  const el = document.createElement("div");
  el.className = "page wide";

  const code = roomId || state.roomId || "?????";
  const matchMode = state.matchMode === "ranked" ? "ranked" : "local";
  state.roomId = code;

  // --- HTML Layout ---
  el.innerHTML = `
    <div class="topbar">
      <div>
        <h1>Game</h1>
        <p class="muted">Mode: <span class="mono">${matchMode}</span> · Room: <span class="mono">${code}</span> · Player: <span class="mono">${state.playerName || "?"}</span></p>
        <a class="btn" href="#/lobby">Leave</a>
      </div>
    </div>

    <div class="layout">
      <div class="panel">
        <h2 id="setup-heading">Setup</h2>
        <div id="setup-controls">
          <p class="muted">Place your ships, then click Ready.</p>
          <div class="row">
            <label class="label">Ship</label>
            <select class="input" id="ship">
              <option value="5">Carrier (5)</option>
              <option value="4">Battleship (4)</option>
              <option value="3">Cruiser (3)</option>
              <option value="3b">Submarine (3)</option>
              <option value="2">Destroyer (2)</option>
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
        
        <div class="hr"></div>
        <p class="tiny muted" id="debug"></p>
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
          <h2>Your board</h2>
          <div id="myBoard"></div>
        </div>

        <div class="boardWrap">
          <h2>Opponent</h2>
          <div id="oppBoard"></div>
        </div>
      </div>
    </div>
  `;

  root.appendChild(el);

  // --- Components ---
  const my = createBoard({ size: 10, mode: "place" });
  const opp = createBoard({ size: 10, mode: "attack" });

  el.querySelector("#myBoard").appendChild(my.el);
  el.querySelector("#oppBoard").appendChild(opp.el);

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

  const shipsToPlace = [
    { key: "carrier", len: 5 },
    { key: "battleship", len: 4 },
    { key: "cruiser", len: 3 },
    { key: "submarine", len: 3 },
    { key: "destroyer", len: 2 },
  ];
  const placed = new Set(); // tracks placed ship keys

  // --- Helper Functions ---
  function updateStatus(msg) {
    status.textContent = msg;
  }

  function markPlaced(key) {
    placed.add(key);

    // Disable option in dropdown to give visual feedback
    const option = Array.from(shipSelect.options).find((o) => {
      if (key === "carrier" && o.value === "5") return true;
      if (key === "battleship" && o.value === "4") return true;
      if (key === "cruiser" && o.value === "3") return true;
      if (key === "submarine" && o.value === "3b") return true;
      if (key === "destroyer" && o.value === "2") return true;
      return false;
    });
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
        const r = Math.floor(Math.random() * 10);
        const c = Math.floor(Math.random() * 10);
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
  const onConnect = () => {
    socket.emit("join", code, state.playerName, { mode: matchMode });
    console.log(`${state.playerName} joining ${matchMode} room: ${code}`);
  };

  const onConnectError = () => {
    updateStatus("Session expired. Please log in again.");
    window.location.hash = "#/";
  };

  socket.on("connect", onConnect);
  socket.on("connect_error", onConnectError);

  const onJoinError = (data) => {
    updateStatus(data?.message || "Failed to join this room.");
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
  });

  socket.on("double_shot_activated", (data) => {
    updateStatus("Double shot activated! Your next miss won't end your turn.");
    doubleShotCount = data.remaining;
    countDoubleShot.textContent = doubleShotCount;
  });

  socket.on("bonus_turn", (data) => {
    updateStatus(data.message);
    isMyTurn = true;
  });

  socket.on("room_update", (data) => {
    // data.players = [{name, ready}, ...]
    const count = data.players.length;
    const readyCount = data.players.filter((p) => p.ready).length;
    debug.textContent = `Players in room: ${count}. Ready: ${readyCount}`;

    if (!gameActive) {
      updateStatus(
        count < 2
          ? "Waiting for opponent to join..."
          : "Opponent connected. Place ships!",
      );
    }
  });

  if (socket.connected) {
    onConnect();
  } else {
    connectSocket().catch(() => {
      onConnectError();
    });
  }

  // Render initial enemy fleet (hidden)
  function renderEnemyFleet() {
    enemyFleetList.innerHTML = "";
    shipsToPlace.forEach((ship) => {
      const div = document.createElement("div");
      div.className = "ship-item";
      div.id = `enemy-ship-${ship.key}`;
      div.innerHTML = `<span>${ship.key}</span> <span>${ship.len}</span>`;
      enemyFleetList.appendChild(div);
    });
  }
  renderEnemyFleet();

  socket.on("game_start", (data) => {
    gameActive = true;
    setupHeading.style.display = "none";
    setupPanel.style.display = "none"; // Hide setup controls
    setupPanel.style.pointerEvents = "none";
    fleetPanel.style.visibility = "visible"; // Show fleet status
    fleetPanel.style.display = "block";
    powerupPanel.style.display = "block"; // Show powerups

    isMyTurn = data.turn === socket.id;
    updateStatus(
      isMyTurn
        ? "Game Started! YOUR TURN. Fire!"
        : "Game Started! Opponent's turn.",
    );

    // Switch boards to game mode visual if needed
  });

  socket.on("turn_change", (data) => {
    isMyTurn = data.turn === socket.id;
    updateStatus(isMyTurn ? "YOUR TURN. Fire!" : "Opponent's turn...");
  });

  socket.on("shot_result", (data) => {
    // data = { shooter, r, c, hit }
    const iShot = data.shooter === socket.id;
    if (iShot) {
      // I shot at opponent
      opp.markShot(data.r, data.c, data.hit ? "hit" : "miss");

      // Update counters
      if (data.hit) {
        myHits++;
        hitCountEl.textContent = myHits;
        updateStatus("Direct HIT!");
      } else {
        myMisses++;
        missCountEl.textContent = myMisses;
        updateStatus("Missed!");
      }

      console.log(`Shot at (${data.r}, ${data.c}) was a ${data.hit}`);
    } else {
      // Opponent shot at me
      my.markShot(data.r, data.c, data.hit ? "hit" : "miss");
    }

    if (data.sunk) {
      const iSunkIt = data.shooter === socket.id;
      if (iSunkIt) {
        // I sunk opponent's ship
        myShipsSunk++;
        updateStatus(`YOU SUNK THEIR ${data.sunk.toUpperCase()}!`);
        const shipEl = el.querySelector(`#enemy-ship-${data.sunk}`);
        if (shipEl) {
          shipEl.classList.add("sunk");
        }
      } else {
        // My ship was sunk
        updateStatus(`YOUR ${data.sunk.toUpperCase()} WAS SUNK!`);
        // Mark on my board
        my.markSunk(data.sunk);
      }
    }
  });

  socket.on("game_over", (data) => {
    gameActive = false;
    isMyTurn = false;

    const iWon = data.winnerId === socket.id;
    updateStatus(iWon ? "GAME OVER — YOU WIN 🏆" : "GAME OVER — YOU LOSE");

    const mySummary = data.summary[socket.id];
    const oppId = Object.keys(data.summary).find((id) => id !== socket.id);
    const oppSummary = data.summary[oppId];

    let myEloHtml = "";
    let oppEloHtml = "";
    let powerupMsg = "";
    if (data.eloChanges) {
      const myEloChange = iWon ? `+${data.eloChanges.winnerGain}` : `${data.eloChanges.loserLoss}`;
      const myNewElo = iWon ? data.eloChanges.winnerNewElo : data.eloChanges.loserNewElo;
      
      const oppEloChange = !iWon ? `+${data.eloChanges.winnerGain}` : `${data.eloChanges.loserLoss}`;
      const oppNewElo = !iWon ? data.eloChanges.winnerNewElo : data.eloChanges.loserNewElo;

      myEloHtml = `<p class="mono" style="color: ${iWon ? '#4ade80' : '#f87171'}">ELO: ${myNewElo} (${myEloChange})</p>`;
      oppEloHtml = `<p class="mono" style="color: ${!iWon ? '#4ade80' : '#f87171'}">ELO: ${oppNewElo} (${oppEloChange})</p>`;

      if (iWon && data.eloChanges.winnerPowerupAwarded) {
        powerupMsg = `<p style="color: #fbbf24; font-weight: bold; margin-bottom: 2px;">🎁 Win Reward: 1x ${data.eloChanges.winnerPowerupAwarded === 'sonar' ? 'Sonar' : 'Double Shot'}!</p>`;
        
        const b = data.eloChanges.bonuses || {};
        if (b.flawless) powerupMsg += `<p style="color: #38bdf8; font-weight: bold; margin-bottom: 2px;">🎯 Flawless Victory: +1 Sonar, +1 Double Shot!</p>`;
        if (b.streak) powerupMsg += `<p style="color: #f472b6; font-weight: bold; margin-bottom: 2px;">🔥 3-Win Streak: +2 Sonars, +2 Double Shots!</p>`;
        if (b.eloTier) powerupMsg += `<p style="color: #a78bfa; font-weight: bold; margin-bottom: 2px;">⭐ New ELO Tier: +1 Sonar, +1 Double Shot!</p>`;
      }
    }

    // Render a simple end-of-game summary panel
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-card">
        <h2>${iWon ? "Victory" : "Defeat"}</h2>
        <p class="muted">End-of-game summary</p>
        <div class="hr"></div>
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
  });

  // --- Event Listeners ---

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

    const info = getShipInfo(shipSelect);
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
    // Instantly activate
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

    // Send valid board to server
    socket.emit("place_ships", {
      roomCode: code,
      grid: my.grid,
      ships: my.getShips(),
    });
  });

  // Fire Shot (Click on Opponent Board)
  opp.onCellClick((r, c) => {
    if (!gameActive) return;
    if (!isMyTurn) {
      updateStatus("Not your turn!");
      return;
    }

    if (activePowerup === "sonar") {
      socket.emit("use_sonar", { roomCode: code, r, c });
      activePowerup = null;
      powerupStatus.textContent = "Select a power-up to use";
      btnSonar.classList.remove("active");
      return;
    }

    // Check if check is already hit/miss
    // 0=empty, 1=ship (hidden), 2=miss, 3=hit
    const currentState = opp.grid[r][c];
    if (currentState === 2 || currentState === 3) {
      updateStatus("Already shot there! Fire somewhere else! ");
      return;
    }

    socket.emit("fire", { roomCode: code, r, c });
  });

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
    },
    { once: true },
  );
}
