export const DEFAULT_SETTINGS = {
  boardSize: 10,
  difficulty: "normal",
  ships: [
    { key: "carrier", label: "Carrier", len: 5 },
    { key: "battleship", label: "Battleship", len: 4 },
    { key: "cruiser", label: "Cruiser", len: 3 },
    { key: "submarine", label: "Submarine", len: 3 },
    { key: "destroyer", label: "Destroyer", len: 2 },
  ],
};

export const SHIP_PRESETS = {
  light: [
    { key: "cruiser", label: "Cruiser", len: 3 },
    { key: "submarine", label: "Submarine", len: 3 },
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
    { key: "patrol", label: "Patrol Boat", len: 2 },
  ],
};

function loadSettings() {
  try {
    const raw = localStorage.getItem("bs_settings");
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      ships: parsed?.ships?.length ? parsed.ships : DEFAULT_SETTINGS.ships,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export const state = {
  playerName: localStorage.getItem("bs_playerName") || "",
  roomId: localStorage.getItem("bs_roomId") || "",
  settings: loadSettings(),
};

export function setPlayerName(name) {
  state.playerName = name;
  localStorage.setItem("bs_playerName", name);
}

export function setRoomId(roomId) {
  state.roomId = roomId;
  localStorage.setItem("bs_roomId", roomId);
}

export function setSettings(nextSettings) {
  state.settings = {
    ...state.settings,
    ...nextSettings,
    ships: nextSettings?.ships?.length
      ? nextSettings.ships
      : state.settings.ships,
  };
  localStorage.setItem("bs_settings", JSON.stringify(state.settings));
}

export function applyShipPreset(presetName) {
  const ships = SHIP_PRESETS[presetName] || SHIP_PRESETS.standard;
  setSettings({ ships });
}
