import { setPlayerName } from "../state";

export function renderHome(root) {
  const el = document.createElement("div");
  el.className = "page";

  el.innerHTML = `
    <div class="card">
      <h1>Battleship</h1>
      <p class="muted">Play head-to-head in a private room.</p>

      <label class="label">Your name</label>
      <input id="name" class="input" placeholder="e.g. David" autocomplete="off" />

      <div class="row">
        <a class="btn" href="#/lobby" id="go">Continue</a>
      </div>

      <p class="tiny muted">Tip: You’ll create or join a room next.</p>
    </div>
  `;

  root.appendChild(el);

  const nameInput = el.querySelector("#name");
  const go = el.querySelector("#go");

  // Basic “disable until name”
  const sync = () => {
    const v = nameInput.value.trim();
    go.classList.toggle("disabled", v.length < 2);
  };

  nameInput.addEventListener("input", () => {
    setPlayerName(nameInput.value.trim());
    sync();
  });

  // If someone hits “Continue” without a name, stop them
  go.addEventListener("click", (e) => {
    const v = nameInput.value.trim();
    if (v.length < 2) {
      e.preventDefault();
      nameInput.focus();
    } else {
      setPlayerName(v);
    }
  });

  sync();
}
