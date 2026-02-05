// this is to track ship info based on select value

export function getShipInfo(shipSelect) {
    const v = shipSelect.value;
    // Map values to keys
    if (v === "5") return { key: "carrier", len: 5 };
    if (v === "4") return { key: "battleship", len: 4 };
    if (v === "3") return { key: "cruiser", len: 3 };
    if (v === "3b") return { key: "submarine", len: 3 };
    if (v === "2") return { key: "destroyer", len: 2 };
    return null;
}