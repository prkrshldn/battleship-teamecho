import { renderHome } from "./pages/home";
import { renderLobby } from "./pages/lobby";
import { renderGame } from "./pages/game";
import { renderLogin } from "./pages/login";
import { renderLeaderboard } from "./pages/leaderboard";
import { renderRanks } from "./pages/ranks";
import { initializeAuth, isAuthenticated } from "./auth";

function getApp() {
  const app = document.getElementById("app");
  if (!app) throw new Error("Missing #app root element");
  return app;
}

function parseRoute() {
  // Examples:
  // #/ -> login (signed out) or home/settings (signed in)
  // #/lobby -> lobby
  // #/game/ROOM123 -> game with room
  const hash = window.location.hash || "#/";
  const parts = hash.replace("#", "").split("/").filter(Boolean);

  const route = parts[0] || "";
  const param = parts[1] || null;
  return { route, param };
}

function render() {
  const app = getApp();
  const { route, param } = parseRoute();

  app.innerHTML = ""; // clear

  // Root route decides where to send the user.
  if (route === "") {
    window.location.hash = isAuthenticated() ? "#/lobby" : "#/login";
    return;
  }

  if (route === "login") {
    if (isAuthenticated()) {
      window.location.hash = "#/lobby";
      return;
    }
    return renderLogin(app);
  }

  // Protect non-root routes.
  if (!isAuthenticated()) {
    window.location.hash = "#/login";
    return;
  }

  if (route === "home") return renderHome(app);
  if (route === "lobby") return renderLobby(app);
  if (route === "game") return renderGame(app, { roomId: param });
  if (route === "leaderboard") return renderLeaderboard(app);
  if (route === "ranks") return renderRanks(app);

  // fallback
  app.innerHTML = `
    <div class="page">
      <h1>404</h1>
      <p>Page not found.</p>
      <a class="btn" href="#/">Go Home</a>
    </div>
  `;
}

export async function initRouter() {
  // Initialize auth before rendering
  await initializeAuth();

  window.addEventListener("hashchange", render);
  render();
}
