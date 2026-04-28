import { ranks } from "../util/rank";

export function renderRanks(root) {
  const el = document.createElement("div");
  el.className = "page";

  const ranksHtml = ranks.map(rank => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px; border: 1px solid #333; background: #0f0f0f; border-radius: 8px; margin-bottom: 12px;">
      <div style="display: flex; align-items: center; gap: 16px;">
        <div style="font-size: 2em; display: flex; align-items: center; justify-content: center; width: 60px;">${rank.svg}</div>
        <div>
          <h3 style="margin: 0; color: ${rank.color}; text-shadow: 0 0 10px ${rank.color}40;">${rank.name}</h3>
          <p class="muted tiny" style="margin: 4px 0 0 0;">Competitive Tier</p>
        </div>
      </div>
      <div style="text-align: right;">
        <p class="mono" style="margin: 0; font-size: 1.2em; color: #fff;">${rank.min}+ ELO</p>
      </div>
    </div>
  `).join("");

  el.innerHTML = `
    <h1>Battleship</h1>
    <div class="card">
      <div class="grid2">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2>Competitive Ranks</h2>
        </div>
      </div>
      <div class="hr"></div>
      <p class="muted">Reach the required ELO to earn these badges in ranked matchmaking.</p>
      
      <div style="margin-top: 24px;">
        ${ranksHtml}
      </div>

      <div class="hr"></div>
      <button class="btn" id="goBack">Go Back</button>
    </div>
  `;

  root.appendChild(el);

  el.querySelector("#goBack").addEventListener("click", () => {
    window.history.back();
  });
}
