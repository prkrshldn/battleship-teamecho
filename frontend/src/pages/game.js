import { state } from "../state";
import { createBoard } from "../components/board";

export function renderGame(root, { roomId }) {
  const el = document.createElement("div");
  el.className = "page wide";

  const code = roomId || state.roomId || "?????";

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
          <button class="btn danger" id="reset">Reset</button>
        </div>

        <button class="btn" id="ready">Ready</button>

        <div class="hr"></div>

        <h2>Status</h2>
        <p id="status" class="mono">Waiting for opponent…</p>

        <p class="tiny muted">
          Hook Socket.IO here: create/join room, sync placement, start turn loop, broadcast shots.
        </p>
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

  // --- Boards
  const my = createBoard({ size: 10, mode: "place" });
  const opp = createBoard({ size: 10, mode: "attack" });

  el.querySelector("#myBoard").appendChild(my.el);
  el.querySelector("#oppBoard").appendChild(opp.el);

  // --- Placement logic (local-only for now)
  let horizontal = true;

  const shipSelect = el.querySelector("#ship");
  const status = el.querySelector("#status");

  const shipsToPlace = [
    { key: "carrier", len: 5 },
    { key: "battleship", len: 4 },
    { key: "cruiser", len: 3 },
    { key: "submarine", len: 3 },
    { key: "destroyer", len: 2 },
  ];

  // Track what’s left
  const placed = new Set();

  function selectedShipLen() {
    const v = shipSelect.value;
    if (v === "3b") return 3;
    return Number(v);
  }

  function markPlaced(len) {
    // place first ship with that len not already placed
    const idx = shipsToPlace.findIndex((s) => s.len === len && !placed.has(s.key));
    if (idx >= 0) placed.add(shipsToPlace[idx].key);
    status.textContent = placed.size === shipsToPlace.length
      ? "All ships placed. Click Ready."
      : `Placed ${placed.size}/${shipsToPlace.length} ships.`;
  }

  el.querySelector("#rotate").addEventListener("click", () => {
    horizontal = !horizontal;
    status.textContent = `Orientation: ${horizontal ? "Horizontal" : "Vertical"}`;
  });

  el.querySelector("#reset").addEventListener("click", () => {
    my.clear();
    placed.clear();
    status.textContent = "Reset. Place your ships.";
  });

  my.onCellClick((r, c) => {
    const len = selectedShipLen();
    const ok = my.placeShip({ r, c, len, horizontal });
    if (ok) markPlaced(len);
    else status.textContent = "Invalid placement (overlap/out of bounds).";
  });

  // --- Attack logic stub
  opp.onCellClick((r, c) => {
    // Later: emit socket event "shot" with (roomId, r, c)
    status.textContent = `You fired at (${r}, ${c}). (wire this to server)`;
    opp.markShot(r, c, "pending");
  });

  // --- Ready stub
  el.querySelector("#ready").addEventListener("click", () => {
    if (placed.size !== shipsToPlace.length) {
      status.textContent = "Place all ships before Ready.";
      return;
    }
    // Later: send placement to backend
    status.textContent = "Ready sent. Waiting for opponent…";
  });
}
