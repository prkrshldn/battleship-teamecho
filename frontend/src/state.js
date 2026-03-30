export const state = {
  playerName: localStorage.getItem("bs_playerName") || "",
  roomId: localStorage.getItem("bs_roomId") || "",
  matchMode: localStorage.getItem("bs_matchMode") || "local",
};

export function setPlayerName(name) {
  state.playerName = name;
  localStorage.setItem("bs_playerName", name);
}

export function setRoomId(roomId) {
  state.roomId = roomId;
  localStorage.setItem("bs_roomId", roomId);
}

export function setMatchMode(mode) {
  state.matchMode = mode === "ranked" ? "ranked" : "local";
  localStorage.setItem("bs_matchMode", state.matchMode);
}
