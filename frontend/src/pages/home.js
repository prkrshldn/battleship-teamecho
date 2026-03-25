import { setPlayerName } from "../state";
import { logout, getCurrentUser, updateUsername } from "../auth";

export function renderHome(root) {
  const el = document.createElement("div");
  el.className = "page";

  const user = getCurrentUser();
  const username = user?.user_metadata?.username || "Unknown";

  el.innerHTML = `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h1>Battleship</h1>
      </div>
      <button id="login" class="btn">Login / Sign Up</button>
      <div class="hr"></div>
      <p class="muted">Welcome to Battleship! Please log in to create or join a game room.</p>
    </div>
  `;

  root.appendChild(el);

  const loginBtn = el.querySelector("#login");
  loginBtn.addEventListener("click", async () => {
    // Handle login logic here, e.g. show a login form or redirect to a login page
    window.location.href = "#/login";
  });

  const usernameInput = el.querySelector("#username");
  const updateUsernameBtn = el.querySelector("#update-username");
  const usernameError = document.createElement("div");
  usernameError.className = "error-message";
  usernameError.style.display = "none";
  usernameError.style.marginBottom = "10px";
  usernameInput.parentNode.insertBefore(usernameError, usernameInput.nextSibling.nextSibling);

  updateUsernameBtn.addEventListener("click", async () => {
    const newUsername = usernameInput.value.trim();
    usernameError.style.display = "none";
    usernameError.textContent = "";

    if (!newUsername || newUsername.length < 2 || newUsername.length > 20) {
      usernameError.textContent = "Username must be 2-20 characters";
      usernameError.style.display = "block";
      return;
    }

    try {
      updateUsernameBtn.disabled = true;
      updateUsernameBtn.textContent = "Updating...";
      await updateUsername(newUsername);
      usernameError.style.display = "block";
      usernameError.className = "success-message";
      usernameError.textContent = "Username updated successfully!";
      setTimeout(() => {
        usernameError.style.display = "none";
      }, 3000);
    } catch (error) {
      usernameError.className = "error-message";
      usernameError.textContent = error.message;
      usernameError.style.display = "block";
    } finally {
      updateUsernameBtn.disabled = false;
      updateUsernameBtn.textContent = "Update";
    }
  });

  const nameInput = el.querySelector("#name");
  const go = el.querySelector("#go");

  // Basic "disable until name"
  const sync = () => {
    const v = nameInput.value.trim();
    go.classList.toggle("disabled", v.length < 2);
  };

  nameInput.addEventListener("input", () => {
    setPlayerName(nameInput.value.trim());
    sync();
  });

  // If someone hits "Continue" without a name, stop them
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
