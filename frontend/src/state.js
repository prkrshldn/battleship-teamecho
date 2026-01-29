export const state = {
  playerName: localStorage.getItem("bs_playerName") || "",
  roomId: localStorage.getItem("bs_roomId") || "",
};

export function setPlayerName(name) {
  state.playerName = name;
  localStorage.setItem("bs_playerName", name);
}

export function setRoomId(roomId) {
  state.roomId = roomId;
  localStorage.setItem("bs_roomId", roomId);
}
