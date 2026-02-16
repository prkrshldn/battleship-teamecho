import { getShipInfo } from "../util/shipGetInfo";

export function createBoard({ size = 10, mode = "place" }) {
  const el = document.createElement("div");
  el.className = `board board-${mode}`;

  // 0 = empty, 1 = ship, 2 = miss, 3 = hit
  const grid = Array.from({ length: size }, () => Array(size).fill(0));
  const shipSelect = document.querySelector("#ship");
  let clickHandler = null;
  const ships = []; // Store placed ships details { name, len, coords: [] }

  function render() {
    el.innerHTML = "";
    el.style.setProperty("--n", size);

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.createElement("button");
        cell.className = "cell";
        cell.type = "button";
        cell.dataset.r = r;
        cell.dataset.c = c;

        const v = grid[r][c];

        if (v === 1) {
          cell.classList.add("ship");
          cell.name = getShipInfo(shipSelect)?.key || "";
        }
        if (v === 2) cell.classList.add("miss");
        if (v === 3) cell.classList.add("hit");
        if (v === 4) {
          cell.classList.add("ship");
          cell.classList.add("hit");
          cell.classList.add("sunk"); // Add sunk style
        }

        cell.addEventListener("click", () => {
          if (clickHandler) clickHandler(r, c);
        });

        el.appendChild(cell);
      }
    }
  }

  function clear() {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        grid[r][c] = 0;
      }
    }
    ships.length = 0; // Clear ships
    render();
  }

  function canPlace({ r, c, len, horizontal }) {
    if (horizontal) {
      if (c + len > size) return false;

      for (let i = 0; i < len; i++) {
        if (grid[r][c + i] !== 0) return false;
      }

      return true;
    } else {
      if (r + len > size) return false;

      for (let i = 0; i < len; i++) {
        if (grid[r + i][c] !== 0) return false;
      }

      return true;
    }
  }

  function placeShip({ r, c, len, horizontal, name }) {
    if (!canPlace({ r, c, len, horizontal })) return false;

    const newShip = { name, len, coords: [] };

    if (horizontal) {
      for (let i = 0; i < len; i++) {
        grid[r][c + i] = 1;
        newShip.coords.push({ r, c: c + i });
        console.log(`Placing part of ship ${name} at (${r}, ${c + i})`);
      }
    } else {
      for (let i = 0; i < len; i++) {
        grid[r + i][c] = 1;
        newShip.coords.push({ r: r + i, c });
      }
    }

    ships.push(newShip);

    render();
    return true;
  }

  function markShot(r, c, outcome) {
    if (outcome === "hit") grid[r][c] = 3;
    else grid[r][c] = 2;

    render();
  }

  function markSunk(shipName) {
    // Find the ship
    const ship = ships.find(s => s.name === shipName);
    if (!ship) return;

    // Mark all its cells as sunk (visually, maybe state 4?)
    // For now we can just rely on adding a class in render, but 
    // let's update grid state to 4 for 'sunk'? 
    // Or just find the elements and add class? 
    // Let's update grid to 4 so it persists on re-render.
    ship.coords.forEach(({ r, c }) => {
      grid[r][c] = 4; // 4 = sunk
    });
    render();
  }

  function onCellClick(fn) {
    clickHandler = fn;
  }

  function getShips() {
    return ships;
  }

  render();

  return {
    el,
    grid,
    getShips,
    clear,
    canPlace,
    placeShip,
    markShot,
    markSunk,
    onCellClick,
  };
}
