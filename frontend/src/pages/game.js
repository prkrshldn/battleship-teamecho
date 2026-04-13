import { state } from "../state";
import { createBoard } from "../components/board";
import { socket } from "../socket";
import { getShipInfo } from "../util/shipGetInfo";

export function renderGame(root, { roomId }) {
  const el = document.createElement("div");
  el.className = "page wide";

  const code = roomId || state.roomId || "?????";
  const isCpuMode = state.matchMode === "cpu";
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
          Mode: <span class="mono">${isCpuMode ? "VS CPU" : "PvP"}</span> ·
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
  let myShipsSunk = 0;

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

      if (!placedOk) return createCpuFleet();
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

  let cpu = null;

  function getAdjacentCells({ r, c }) {
    return [
      { r: r - 1, c },
      { r: r + 1, c },
      { r, c: c - 1 },
      { r, c: c + 1 },
    ].filter((cell) => cell.r >= 0 && cell.c >= 0 && cell.r < boardSize && cell.c < boardSize);
  }

  function isUnshotPlayerCell({ r, c }) {
    return my.grid[r][c] === 0 || my.grid[r][c] === 1;
  }

  function randomCell(cells) {
    return cells[Math.floor(Math.random() * cells.length)];
  }

  function getUnshotPlayerCells() {
    const cells = [];
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        if (isUnshotPlayerCell({ r, c })) cells.push({ r, c });
      }
    }
    return cells;
  }

  function chooseCpuShot() {
    cpu.targetQueue = cpu.targetQueue.filter(isUnshotPlayerCell);
    if (cpu.targetQueue.length) return randomCell(cpu.targetQueue);

    const cells = getUnshotPlayerCells();
    if (difficulty === "easy") return randomCell(cells);

    const checkerCells = cells.filter(({ r, c }) => (r + c) % 2 === 0);
    if (difficulty === "normal") return randomCell(checkerCells.length ? checkerCells : cells);

    const scoreGrid = Array.from({ length: boardSize }, () => Array(boardSize).fill(0));
    const remainingLengths = my.getShips().filter((ship) => (ship.hits || 0) < ship.len).map((ship) => ship.len);

    for (const len of remainingLengths) {
      for (let r = 0; r < boardSize; r++) {
        for (let c = 0; c < boardSize; c++) {
          for (const horizontalTry of [true, false]) {
            const coords = [];
            let valid = true;

            for (let i = 0; i < len; i++) {
              const nr = horizontalTry ? r : r + i;
              const nc = horizontalTry ? c + i : c;
              if (nr >= boardSize || nc >= boardSize || my.grid[nr][nc] === 2 || my.grid[nr][nc] === 4) {
                valid = false;
                break;
              }
              coords.push({ r: nr, c: nc });
            }

            if (!valid) continue;

            const knownHits = coords.filter(({ r: nr, c: nc }) => my.grid[nr][nc] === 3).length;
            const weight = knownHits ? 8 + knownHits * 4 : 1;
            coords.forEach(({ r: nr, c: nc }) => {
              if (isUnshotPlayerCell({ r: nr, c: nc })) scoreGrid[nr][nc] += weight;
            });
          }
        }
      }
    }

    let bestScore = -1;
    let bestCells = [];
    cells.forEach(({ r, c }) => {
      if (scoreGrid[r][c] > bestScore) {
        bestScore = scoreGrid[r][c];
        bestCells = [{ r, c }];
      } else if (scoreGrid[r][c] === bestScore) {
        bestCells.push({ r, c });
      }
    });

    return randomCell(bestCells.length ? bestCells : cells);
  }

  function showCpuGameOver(playerWon) {
    gameActive = false;
    isMyTurn = false;
    updateStatus(playerWon ? "GAME OVER - YOU WIN" : "GAME OVER - YOU LOSE");

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
      }
    }, 650);
  }

  function startCpuGame() {
    cpu = createCpuFleet();
    gameActive = true;
    isMyTurn = true;
    setupPanel.style.display = "none";
    setupPanel.style.pointerEvents = "none";
    fleetPanel.style.visibility = "visible";
    debug.textContent = "CPU placed ships and is ready.";
    updateStatus("Game Started! YOUR TURN. Fire!");
  }

  function fireAtCpu(r, c) {
    if (cpu.shotsReceived[r][c] !== 0) {
      updateStatus("Already shot there! Fire somewhere else!");
      return;
    }

    const hit = cpu.grid[r][c] === 1;
    cpu.shotsReceived[r][c] = hit ? 3 : 2;
    opp.markShot(r, c, hit ? "hit" : "miss");

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
    } else {
      updateStatus("Missed! CPU's turn...");
      isMyTurn = false;
      cpuFire();
    }
  }

  if (!isCpuMode) {
    socket.emit("join", {
      roomCode: code,
      playerName: state.playerName,
      settings: state.settings,
    });
  }

  if (!isCpuMode) socket.on("room_update", (data) => {
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
  if (isCpuMode) {
    updateStatus("Place your ships, then click Ready.");
    debug.textContent = "CPU opponent selected.";
  }

  if (!isCpuMode) socket.on("game_start", (data) => {
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

  if (!isCpuMode) socket.on("turn_change", (data) => {
    isMyTurn = data.turn === socket.id;
    updateStatus(isMyTurn ? "YOUR TURN. Fire!" : "Opponent's turn...");
  });

  if (!isCpuMode) socket.on("shot_result", (data) => {
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

  if (!isCpuMode) socket.on("game_over", (data) => {
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

    el.querySelector("#ready").disabled = true;
    el.querySelector("#reset").disabled = true;

    if (isCpuMode) {
      startCpuGame();
      return;
    }

    updateStatus("Waiting for other player...");

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

    if (isCpuMode) {
      fireAtCpu(r, c);
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
