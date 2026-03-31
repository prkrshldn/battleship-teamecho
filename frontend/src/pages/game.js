import { state } from "../state";
import { createBoard } from "../components/board";
import { socket } from "../socket";
import { getShipInfo } from "../util/shipGetInfo";

export function renderGame(root, { roomId }) {
  const el = document.createElement("div");
  el.className = "page wide";

  const code = roomId || state.roomId || "?????";
  state.roomId = code;

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

  el.innerHTML = `
    <div class="topbar">
      <div>
        <h1>Game</h1>
        <p class="muted">
          Room: <span class="mono">${code}</span> ·
          Player: <span class="mono">${state.playerName || "?"}</span>
        </p>
        <p class="tiny muted">
          Board: ${boardSize}x${boardSize} · Ships: ${shipsToPlace.length} · Difficulty: ${difficulty}
        </p>
      </div>
      <div class="topbar-actions">
        <a class="btn ghost" href="#/lobby">Leave</a>
      </div>
    </div>

    <div class="layout">
      <div class="panel">
        <h2>Setup</h2>
        <div id="setup-controls">
          <p class="muted">Place your ships, then click Ready.</p>

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

        <div class="hr"></div>
        <p class="tiny muted" id="debug"></p>
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

      <div class="panel fleet-status" id="fleet-panel" style="visibility: hidden;">
        <h3>Enemy Fleet</h3>
        <div style="margin-bottom: 10px; font-size: 0.9rem; color: #ccc;">
          <span style="margin-right: 15px;">Hits: <strong id="hit-count" style="color: #ff4444;">0</strong></span>
          <span>Misses: <strong id="miss-count" style="color: #fff;">0</strong></span>
        </div>
        <div id="enemy-fleet" class="ship-list"></div>
      </div>
    </div>
  `;

  root.appendChild(el);

  const my = createBoard({ size: boardSize, mode: "place" });
  const opp = createBoard({ size: boardSize, mode: "attack" });

  el.querySelector("#myBoard").appendChild(my.el);
  el.querySelector("#oppBoard").appendChild(opp.el);

  let horizontal = true;
  let isMyTurn = false;
  let gameActive = false;
  let myHits = 0;
  let myMisses = 0;

  const shipSelect = el.querySelector("#ship");
  const status = el.querySelector("#status");
  const debug = el.querySelector("#debug");
  const setupPanel = el.querySelector("#setup-controls");
  const fleetPanel = el.querySelector("#fleet-panel");
  const enemyFleetList = el.querySelector("#enemy-fleet");
  const hitCountEl = el.querySelector("#hit-count");
  const missCountEl = el.querySelector("#miss-count");

  const placed = new Set();

  function updateStatus(msg) {
    status.textContent = msg;
  }

  function markPlaced(key) {
    placed.add(key);

    const option = Array.from(shipSelect.options).find((o) => o.value === key);
    if (option) option.disabled = true;

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
    Array.from(shipSelect.options).forEach((o) => {
      o.disabled = false;
    });
  }

  function setAllPlacedUI() {
    shipsToPlace.forEach((s) => placed.add(s.key));
    Array.from(shipSelect.options).forEach((o) => {
      o.disabled = true;
    });
    updateStatus("All ships placed. Click Ready.");
  }

  function randomPlaceAllShips() {
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
        return randomPlaceAllShips();
      }
    }

    setAllPlacedUI();
  }

  socket.emit("join", {
    roomCode: code,
    playerName: state.playerName,
    settings: state.settings,
  });

  socket.on("room_update", (data) => {
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

  function renderEnemyFleet() {
    enemyFleetList.innerHTML = "";
    shipsToPlace.forEach((ship) => {
      const div = document.createElement("div");
      div.className = "ship-item";
      div.id = `enemy-ship-${ship.key}`;
      div.innerHTML = `<span>${ship.label}</span> <span>${ship.len}</span>`;
      enemyFleetList.appendChild(div);
    });
  }

  renderEnemyFleet();

  socket.on("game_start", (data) => {
    gameActive = true;
    setupPanel.style.display = "none";
    setupPanel.style.pointerEvents = "none";
    fleetPanel.style.visibility = "visible";

    isMyTurn = data.turn === socket.id;
    updateStatus(
      isMyTurn
        ? "Game Started! YOUR TURN. Fire!"
        : "Game Started! Opponent's turn.",
    );
  });

  socket.on("turn_change", (data) => {
    isMyTurn = data.turn === socket.id;
    updateStatus(isMyTurn ? "YOUR TURN. Fire!" : "Opponent's turn...");
  });

  socket.on("shot_result", (data) => {
    const iShot = data.shooter === socket.id;

    if (iShot) {
      opp.markShot(data.r, data.c, data.hit ? "hit" : "miss");

      if (data.hit) {
        myHits++;
        hitCountEl.textContent = myHits;
        updateStatus("Direct HIT!");
      } else {
        myMisses++;
        missCountEl.textContent = myMisses;
        updateStatus("Missed!");
      }
    } else {
      my.markShot(data.r, data.c, data.hit ? "hit" : "miss");
    }

    if (data.sunk) {
      const iSunkIt = data.shooter === socket.id;
      if (iSunkIt) {
        updateStatus(`YOU SUNK THEIR ${data.sunk.toUpperCase()}!`);
        const shipEl = el.querySelector(`#enemy-ship-${data.sunk}`);
        if (shipEl) shipEl.classList.add("sunk");
      } else {
        updateStatus(`YOUR ${data.sunk.toUpperCase()} WAS SUNK!`);
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
            <p class="mono">Hits: ${mySummary.hits} · Misses: ${mySummary.misses}</p>
            <p class="mono">Ships sunk: ${mySummary.shipsSunk}</p>
            <p class="tiny muted">Sunk: ${(mySummary.sunkShips || []).join(", ") || "—"}</p>
          </div>
          <div>
            <h3>${oppSummary?.name || "Opponent"}</h3>
            <p class="mono">Hits: ${oppSummary?.hits ?? 0} · Misses: ${oppSummary?.misses ?? 0}</p>
            <p class="mono">Ships sunk: ${oppSummary?.shipsSunk ?? 0}</p>
            <p class="tiny muted">Sunk: ${(oppSummary?.sunkShips || []).join(", ") || "—"}</p>
          </div>
        </div>
        <div class="hr"></div>
        <a class="btn" href="#/lobby">Back to lobby</a>
      </div>
    `;
    document.body.appendChild(modal);

    socket.off("turn_change");
  });

  el.querySelector("#rotate").addEventListener("click", () => {
    horizontal = !horizontal;
    el.querySelector("#orientation-display").textContent = horizontal
      ? "Horizontal"
      : "Vertical";
  });

  el.querySelector("#reset").addEventListener("click", () => {
    my.clear();
    resetPlacementUI();
    updateStatus("Reset. Place your ships.");
  });

  el.querySelector("#random").addEventListener("click", () => {
    if (gameActive) return;
    randomPlaceAllShips();
  });

  my.onCellClick((r, c) => {
    if (gameActive) return;

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

  el.querySelector("#ready").addEventListener("click", () => {
    if (placed.size !== shipsToPlace.length) {
      updateStatus("Place all ships first!");
      return;
    }

    updateStatus("Waiting for other player...");
    el.querySelector("#ready").disabled = true;
    el.querySelector("#reset").disabled = true;

    socket.emit("place_ships", {
      roomCode: code,
      grid: my.grid,
      ships: my.getShips(),
    });
  });

  opp.onCellClick((r, c) => {
    if (!gameActive) return;
    if (!isMyTurn) {
      updateStatus("Not your turn!");
      return;
    }

    const currentState = opp.grid[r][c];
    if (currentState === 2 || currentState === 3) {
      updateStatus("Already shot there! Fire somewhere else!");
      return;
    }

    socket.emit("fire", { roomCode: code, r, c });
  });

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
    },
    { once: true },
  );
}
