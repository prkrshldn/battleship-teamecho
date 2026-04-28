export const ranks = [
  {
    level: 0,
    name: "Iron",
    min: 0,
    color: "#6e6e6e",
    svg: `<svg viewBox="0 0 100 100" class="rank-badge" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); width: 1.5em; height: 1.5em; vertical-align: middle;">
            <polygon points="50,5 95,50 50,95 5,50" fill="#4a4a4a" stroke="#8c8c8c" stroke-width="4"/>
            <polygon points="50,20 80,50 50,80 20,50" fill="#303030"/>
            <circle cx="50" cy="50" r="10" fill="#8c8c8c"/>
          </svg>`
  },
  {
    level: 1,
    name: "Bronze",
    min: 950,
    color: "#cd7f32",
    svg: `<svg viewBox="0 0 100 100" class="rank-badge" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); width: 1.5em; height: 1.5em; vertical-align: middle;">
            <polygon points="50,5 95,50 50,95 5,50" fill="#a0522d" stroke="#cd7f32" stroke-width="4"/>
            <polygon points="50,20 80,50 50,80 20,50" fill="#8b4513"/>
            <polygon points="50,30 70,50 50,70 30,50" fill="#cd7f32"/>
          </svg>`
  },
  {
    level: 2,
    name: "Silver",
    min: 1000,
    color: "#e0e0e0",
    svg: `<svg viewBox="0 0 100 100" class="rank-badge" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); width: 1.5em; height: 1.5em; vertical-align: middle;">
            <polygon points="50,5 95,50 50,95 5,50" fill="#a9a9a9" stroke="#e0e0e0" stroke-width="4"/>
            <polygon points="50,20 80,50 50,80 20,50" fill="#d3d3d3"/>
            <polygon points="50,35 65,50 50,65 35,50" fill="#ffffff"/>
          </svg>`
  },
  {
    level: 3,
    name: "Gold",
    min: 1050,
    color: "#ffd700",
    svg: `<svg viewBox="0 0 100 100" class="rank-badge" style="filter: drop-shadow(0 0 8px rgba(255,215,0,0.4)); width: 1.5em; height: 1.5em; vertical-align: middle;">
            <polygon points="50,5 95,50 50,95 5,50" fill="#daa520" stroke="#ffd700" stroke-width="4"/>
            <polygon points="50,20 80,50 50,80 20,50" fill="#b8860b"/>
            <polygon points="50,30 70,50 50,70 30,50" fill="#ffd700"/>
            <circle cx="50" cy="50" r="8" fill="#ffffff"/>
          </svg>`
  },
  {
    level: 4,
    name: "Platinum",
    min: 1100,
    color: "#00ced1",
    svg: `<svg viewBox="0 0 100 100" class="rank-badge" style="filter: drop-shadow(0 0 10px rgba(0,206,209,0.5)); width: 1.5em; height: 1.5em; vertical-align: middle;">
            <polygon points="50,5 95,50 50,95 5,50" fill="#20b2aa" stroke="#00ced1" stroke-width="4"/>
            <polygon points="50,15 85,50 50,85 15,50" fill="#008b8b"/>
            <polygon points="50,25 75,50 50,75 25,50" fill="#00ffff"/>
            <polygon points="50,40 60,50 50,60 40,50" fill="#ffffff"/>
          </svg>`
  },
  {
    level: 5,
    name: "Diamond",
    min: 1150,
    color: "#b9f2ff",
    svg: `<svg viewBox="0 0 100 100" class="rank-badge" style="filter: drop-shadow(0 0 12px rgba(185,242,255,0.6)); width: 1.5em; height: 1.5em; vertical-align: middle;">
            <polygon points="50,5 95,50 50,95 5,50" fill="#9370db" stroke="#da70d6" stroke-width="4"/>
            <polygon points="50,15 85,50 50,85 15,50" fill="#8a2be2"/>
            <polygon points="50,25 75,50 50,75 25,50" fill="#ee82ee"/>
            <circle cx="50" cy="50" r="12" fill="#ffffff"/>
          </svg>`
  },
  {
    level: 6,
    name: "Immortal",
    min: 1200,
    color: "#ff4d4d",
    svg: `<svg viewBox="0 0 100 100" class="rank-badge" style="filter: drop-shadow(0 0 15px rgba(255,77,77,0.8)); width: 1.5em; height: 1.5em; vertical-align: middle;">
            <polygon points="50,0 100,50 50,100 0,50" fill="#dc143c" stroke="#ff4d4d" stroke-width="4"/>
            <polygon points="50,15 85,50 50,85 15,50" fill="#8b0000"/>
            <path d="M50 25 L65 45 L50 75 L35 45 Z" fill="#ff4d4d"/>
            <path d="M50 35 L58 48 L50 65 L42 48 Z" fill="#ffffff"/>
          </svg>`
  },
  {
    level: 7,
    name: "Radiant",
    min: 1250,
    color: "#ffdf00",
    svg: `<svg viewBox="0 0 100 100" class="rank-badge" style="filter: drop-shadow(0 0 20px rgba(255,223,0,1)); width: 1.5em; height: 1.5em; vertical-align: middle;">
            <polygon points="50,0 100,40 70,100 30,100 0,40" fill="#ffdf00" stroke="#ffffff" stroke-width="4"/>
            <polygon points="50,15 85,45 60,85 40,85 15,45" fill="#daa520"/>
            <polygon points="50,25 70,50 55,75 45,75 30,50" fill="#ffffff"/>
          </svg>`
  }
];

export function getRank(elo) {
  // Ensure Elo is at least 0
  const validElo = Math.max(0, elo || 1000);
  
  // Find the highest rank where min <= validElo
  let currentRank = ranks[0];
  for (const rank of ranks) {
    if (validElo >= rank.min) {
      currentRank = rank;
    }
  }
  
  return currentRank;
}
