import { state, setMatchMode, setRoomId, setSettings, applyShipPreset } from "../state";

export function renderLobby(root) {
  const el = document.createElement("div");
  el.className = "page";

  el.innerHTML = `
    <div class="card">
      <h1>Lobby</h1>
      <p class="muted">Create a room or join one with a code.</p>

      <div class="grid2">
        <div>
          <h2>Create room</h2>

          <label class="label">Board size</label>
          <select class="input" id="boardSize">
            <option value="8">8 x 8</option>
            <option value="10">10 x 10</option>
            <option value="12">12 x 12</option>
          </select>

          <label class="label">Ship count preset</label>
          <select class="input" id="shipPreset">
            <option value="light">Light</option>
            <option value="standard">Standard</option>
            <option value="heavy">Heavy</option>
          </select>

          <label class="label">Difficulty</label>
          <select class="input" id="difficulty">
            <option value="easy">Easy</option>
            <option value="normal">Normal</option>
            <option value="hard">Hard</option>
          </select>

          <button class="btn" id="create">Create PvP Room</button>
          <button class="btn ghost" id="cpu">Start VS CPU</button>
          <p class="tiny muted">These settings apply to the room you create.</p>
        </div>

        <div>
          <h2>Join room</h2>
          <label class="label">Room code</label>
          <input class="input" id="room" placeholder="e.g. X7K2Q" autocomplete="off" />
          <button class="btn" id="join">Join</button>
          <p class="tiny muted">Joining uses that room's settings.</p>
        </div>
      </div>

      <div class="hr"></div>

      <p class="tiny muted">Player: <span id="playerName"></span></p>
      <a class="link" href="#/">Change name</a>
    </div>
  `;

  root.appendChild(el);

  el.querySelector("#playerName").textContent = state.playerName || "(not set)";

  const roomInput = el.querySelector("#room");
  const boardSizeSelect = el.querySelector("#boardSize");
  const shipPresetSelect = el.querySelector("#shipPreset");
  const difficultySelect = el.querySelector("#difficulty");

  boardSizeSelect.value = String(state.settings.boardSize || 10);
  difficultySelect.value = state.settings.difficulty || "normal";

  const currentShipCount = state.settings.ships?.length || 5;
  if (currentShipCount <= 3) shipPresetSelect.value = "light";
  else if (currentShipCount >= 6) shipPresetSelect.value = "heavy";
  else shipPresetSelect.value = "standard";

  const makeCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 5; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  };

  function startGame(mode) {
    if (!state.playerName || state.playerName.length < 2) {
      window.location.hash = "#/";
      return;
    }

    applyShipPreset(shipPresetSelect.value);
    setSettings({
      boardSize: Number(boardSizeSelect.value),
      difficulty: difficultySelect.value,
    });

    const code = makeCode();
    setMatchMode(mode);
    setRoomId(code);
    window.location.hash = `#/game/${code}`;
  }

  el.querySelector("#create").addEventListener("click", () => {
    startGame("local");
  });

  el.querySelector("#cpu").addEventListener("click", () => {
    startGame("cpu");
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
    setMatchMode("local");
    window.location.hash = `#/game/${code}`;
  });
}
