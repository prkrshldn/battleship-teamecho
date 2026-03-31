export function getShipInfo(shipSelect, ships) {
  const selectedKey = shipSelect.value;
  return ships.find((ship) => ship.key === selectedKey) || null;
}
