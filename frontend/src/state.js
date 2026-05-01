const SHIP_PRESETS = {
  light: [
    { key: "battleship", label: "Battleship", len: 4 },
    { key: "cruiser", label: "Cruiser", len: 3 },
    { key: "destroyer", label: "Destroyer", len: 2 },
  ],
  standard: [
    { key: "carrier", label: "Carrier", len: 5 },
    { key: "battleship", label: "Battleship", len: 4 },
    { key: "cruiser", label: "Cruiser", len: 3 },
    { key: "submarine", label: "Submarine", len: 3 },
    { key: "destroyer", label: "Destroyer", len: 2 },
  ],
  heavy: [
    { key: "carrier", label: "Carrier", len: 5 },
    { key: "battleship", label: "Battleship", len: 4 },
    { key: "cruiser", label: "Cruiser", len: 3 },
    { key: "submarine", label: "Submarine", len: 3 },
    { key: "destroyer", label: "Destroyer", len: 2 },
    { key: "frigate", label: "Frigate", len: 2 },
  ],
};

const DEFAULT_SETTINGS = {
  boardSize: 10,
  difficulty: "normal",
  ships: SHIP_PRESETS.standard,
};

function cloneShips(ships) {
  return ships.map((ship) => ({ ...ship }));
}

function loadSettings() {
  const raw = localStorage.getItem("bs_settings");
  if (!raw) {
    return {
      ...DEFAULT_SETTINGS,
      ships: cloneShips(DEFAULT_SETTINGS.ships),
    };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      boardSize: Number(parsed.boardSize) || DEFAULT_SETTINGS.boardSize,
      difficulty: parsed.difficulty || DEFAULT_SETTINGS.difficulty,
      ships:
        Array.isArray(parsed.ships) && parsed.ships.length > 0
          ? cloneShips(parsed.ships)
          : cloneShips(DEFAULT_SETTINGS.ships),
    };
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      ships: cloneShips(DEFAULT_SETTINGS.ships),
    };
  }
}

export const state = {
  playerName: localStorage.getItem("bs_playerName") || "",
  roomId: localStorage.getItem("bs_roomId") || "",
  roomRole: localStorage.getItem("bs_roomRole") || "left",
  matchMode: localStorage.getItem("bs_matchMode") || "local",
  settings: loadSettings(),
};

function persistSettings() {
  localStorage.setItem("bs_settings", JSON.stringify(state.settings));
}

export function setPlayerName(name) {
  state.playerName = name;
  localStorage.setItem("bs_playerName", name);
}

export function setRoomId(roomId) {
  state.roomId = roomId;
  localStorage.setItem("bs_roomId", roomId);
}

export function setRoomRole(role) {
  state.roomRole = ["left", "right", "middle"].includes(role) ? role : "left";
  localStorage.setItem("bs_roomRole", state.roomRole);
}

export function setMatchMode(mode) {
  state.matchMode = ["ranked", "cpu"].includes(mode) ? mode : "local";
  localStorage.setItem("bs_matchMode", state.matchMode);

  if (state.matchMode === "ranked") {
    setSettings({
      boardSize: 10,
      difficulty: "normal",
      ships: cloneShips(SHIP_PRESETS.standard),
    });
  }
}

export function setSettings(nextSettings = {}) {
  state.settings = {
    ...state.settings,
    ...nextSettings,
    ships:
      Array.isArray(nextSettings.ships) && nextSettings.ships.length > 0
        ? cloneShips(nextSettings.ships)
        : cloneShips(state.settings.ships || DEFAULT_SETTINGS.ships),
  };
  persistSettings();
}

export function applyShipPreset(preset) {
  const ships = SHIP_PRESETS[preset] || SHIP_PRESETS.standard;
  setSettings({ ships: cloneShips(ships) });
}
