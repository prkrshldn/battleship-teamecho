import { renderHome } from "./pages/home";
import { renderLobby } from "./pages/lobby";
import { renderGame } from "./pages/game";

function getApp() {
  const app = document.getElementById("app");
  if (!app) throw new Error("Missing #app root element");
  return app;
}

function parseRoute() {
  // Examples:
  // #/ -> home
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

  if (route === "") return renderHome(app);
  if (route === "lobby") return renderLobby(app);
  if (route === "game") return renderGame(app, { roomId: param });

  // fallback
  app.innerHTML = `
    <div class="page">
      <h1>404</h1>
      <p>Page not found.</p>
      <a class="btn" href="#/">Go Home</a>
    </div>
  `;
}

export function initRouter() {
  window.addEventListener("hashchange", render);
  render();
}
