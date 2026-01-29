import { state, setRoomId } from "../state";

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

      <p class="tiny muted">Player: <span id="playerName"></span></p>
      <a class="link" href="#/">Change name</a>
    </div>
  `;

  root.appendChild(el);

  el.querySelector("#playerName").textContent = state.playerName || "(not set)";

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
}
