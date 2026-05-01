export function createBoard({ size = 10, mode = "place" }) {
  const el = document.createElement("div");
  el.className = `board board-${mode}`;

  // 0 = empty, 1 = ship, 2 = miss, 3 = hit, 4 = sunk
  const grid = Array.from({ length: size }, () => Array(size).fill(0));
  let clickHandler = null;
  const ships = [];
  const cells = Array.from({ length: size }, () => Array(size).fill(null));

  function initDOM() {
    el.innerHTML = "";
    el.style.setProperty("--n", size);

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.createElement("button");
        cell.className = "cell";
        cell.type = "button";
        cell.dataset.r = r;
        cell.dataset.c = c;

        cell.addEventListener("click", () => {
          if (clickHandler) clickHandler(r, c);
        });

        el.appendChild(cell);
        cells[r][c] = cell;
      }
    }
  }
  initDOM();

  function render() {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = cells[r][c];
        const v = grid[r][c];

        let newClass = "cell";
        if (v === 1) newClass += " ship";
        if (v === 2) newClass += " miss";
        if (v === 3) newClass += " hit";
        if (v === 4) newClass += " ship hit sunk";
        if (v === 5) newClass += " sonar";

        if (cell.className !== newClass) {
          cell.className = newClass;
        }
      }
    }
  }

  function clear() {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        grid[r][c] = 0;
      }
    }
    ships.length = 0;
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
    grid[r][c] = outcome === "hit" ? 3 : 2;
    render();
  }

  function markSunk(shipName) {
    const ship = ships.find((s) => s.name === shipName);
    if (!ship) return;

    ship.coords.forEach(({ r, c }) => {
      grid[r][c] = 4;
    });

    render();
  }

  function markSonar(r, c) {
    if (grid[r][c] !== 3 && grid[r][c] !== 4) {
      grid[r][c] = 5;
      render();
    }
  }

  function setGrid(nextGrid) {
    if (!Array.isArray(nextGrid) || nextGrid.length !== size) return;
    for (let r = 0; r < size; r++) {
      if (!Array.isArray(nextGrid[r]) || nextGrid[r].length !== size) return;
      for (let c = 0; c < size; c++) {
        grid[r][c] = nextGrid[r][c];
      }
    }
    render();
  }

  function setShips(nextShips) {
    ships.length = 0;
    if (Array.isArray(nextShips)) {
      for (const ship of nextShips) {
        ships.push(ship);
      }
    }
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
    markSonar,
    setGrid,
    setShips,
    onCellClick,
  };
}
