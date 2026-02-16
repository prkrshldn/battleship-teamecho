import { state } from "../state";
import { createBoard } from "../components/board";
import { socket } from "../socket";
import { getShipInfo } from "../util/shipGetInfo";

export function renderGame(root, { roomId }) {
  const el = document.createElement("div");
  el.className = "page wide";

  const code = roomId || state.roomId || "?????";
  state.roomId = code;


  // --- HTML Layout ---
  el.innerHTML = `
    <div class="topbar">
      <div>
        <h1>Game</h1>
        <p class="muted">Room: <span class="mono">${code}</span> · Player: <span class="mono">${state.playerName || "?"}</span></p>
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
        <div id="enemy-fleet" class="ship-list">
          <!-- Populated by JS -->
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

  const shipSelect = el.querySelector("#ship");
  const status = el.querySelector("#status");
  const debug = el.querySelector("#debug");
  const setupPanel = el.querySelector("#setup-controls");
  const fleetPanel = el.querySelector("#fleet-panel");
  const enemyFleetList = el.querySelector("#enemy-fleet");
  const hitCountEl = el.querySelector("#hit-count");
  const missCountEl = el.querySelector("#miss-count");

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
    const option = Array.from(shipSelect.options).find(o => {
      if (key === 'carrier' && o.value === '5') return true;
      if (key === 'battleship' && o.value === '4') return true;
      if (key === 'cruiser' && o.value === '3') return true;
      if (key === 'submarine' && o.value === '3b') return true;
      if (key === 'destroyer' && o.value === '2') return true;
      return false;
    });
    if (option) option.disabled = true;

    // Auto-select next available ship
    const nextOption = Array.from(shipSelect.options).find(o => !o.disabled);
    if (nextOption) shipSelect.value = nextOption.value;

    if (placed.size === shipsToPlace.length) {
      updateStatus("All ships placed. Click Ready.");
    } else {
      updateStatus(`Placed ${placed.size}/${shipsToPlace.length} ships.`);
    }
  }

  // --- Socket Logic ---

  // 1. Join Room
  socket.emit('join', code, state.playerName);
  console.log(`${state.playerName} joining room: ${code}`);

  socket.on('room_update', (data) => {
    // data.players = [{name, ready}, ...]
    const count = data.players.length;
    const readyCount = data.players.filter(p => p.ready).length;
    debug.textContent = `Players in room: ${count}. Ready: ${readyCount}`;

    if (!gameActive) {
      updateStatus(count < 2 ? "Waiting for opponent to join..." : "Opponent connected. Place ships!");
    }
  });

  // Render initial enemy fleet (hidden)
  function renderEnemyFleet() {
    enemyFleetList.innerHTML = '';
    shipsToPlace.forEach(ship => {
      const div = document.createElement('div');
      div.className = 'ship-item';
      div.id = `enemy-ship-${ship.key}`;
      div.innerHTML = `<span>${ship.key}</span> <span>${ship.len}</span>`;
      enemyFleetList.appendChild(div);
    });
  }
  renderEnemyFleet();

  socket.on('game_start', (data) => {
    gameActive = true;
    setupPanel.style.display = 'none'; // Hide setup controls
    setupPanel.style.pointerEvents = 'none';
    fleetPanel.style.visibility = 'visible'; // Show fleet status

    isMyTurn = data.turn === socket.id;
    updateStatus(isMyTurn ? "Game Started! YOUR TURN. Fire!" : "Game Started! Opponent's turn.");

    // Switch boards to game mode visual if needed
  });

  socket.on('turn_change', (data) => {
    isMyTurn = data.turn === socket.id;
    updateStatus(isMyTurn ? "YOUR TURN. Fire!" : "Opponent's turn...");
  });

  socket.on('shot_result', (data) => {
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
        updateStatus(`YOU SUNK THEIR ${data.sunk.toUpperCase()}!`);
        const shipEl = el.querySelector(`#enemy-ship-${data.sunk}`);
        if (shipEl) {
          shipEl.classList.add('sunk');
        }
      } else {
        // My ship was sunk
        updateStatus(`YOUR ${data.sunk.toUpperCase()} WAS SUNK!`);
        // Mark on my board
        my.markSunk(data.sunk);
      }
    }
  });


  // --- Event Listeners ---

  // Rotate
  el.querySelector("#rotate").addEventListener("click", () => {
    horizontal = !horizontal;
    el.querySelector("#orientation-display").textContent = horizontal ? "Horizontal" : "Vertical";
    // visual feedback optional
  });

  // Reset
  el.querySelector("#reset").addEventListener("click", () => {
    my.clear();
    placed.clear();
    // Re-enable all options
    Array.from(shipSelect.options).forEach(o => o.disabled = false);
    updateStatus("Reset. Place your ships.");
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

    const ok = my.placeShip({ r, c, len: info.len, horizontal, name: info.key });
    if (ok) markPlaced(info.key);
    else updateStatus("Invalid placement.");
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
    socket.emit('place_ships', {
      roomCode: code,
      grid: my.grid,
      ships: my.getShips()
    });
  });

  // Fire Shot (Click on Opponent Board)
  opp.onCellClick((r, c) => {
    if (!gameActive) return;
    if (!isMyTurn) {
      updateStatus("Not your turn!");
      return;
    }

    // Check if check is already hit/miss
    // 0=empty, 1=ship (hidden), 2=miss, 3=hit
    const currentState = opp.grid[r][c];
    if (currentState === 2 || currentState === 3) {
      updateStatus("Already shot there! Fire somewhere else! ");
      return;
    }

    socket.emit('fire', { roomCode: code, r, c });
  });

  // Cleanup on leave
  window.addEventListener('hashchange', () => {
    socket.off('room_update');
    socket.off('game_start');
    socket.off('turn_change');
    socket.off('shot_result');
  }, { once: true });
}
