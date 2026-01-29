export function createBoard({ size = 10, mode = "place" }) {
  const el = document.createElement("div");
  el.className = `board board-${mode}`;

  // 0 = empty, 1 = ship, 2 = miss, 3 = hit
  const grid = Array.from({ length: size }, () => Array(size).fill(0));

  let clickHandler = null;

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

        if (v === 1) cell.classList.add("ship");
        if (v === 2) cell.classList.add("miss");
        if (v === 3) cell.classList.add("hit");

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

  function placeShip({ r, c, len, horizontal }) {
    if (!canPlace({ r, c, len, horizontal })) return false;

    if (horizontal) {
      for (let i = 0; i < len; i++) {
        grid[r][c + i] = 1;
      }
    } else {
      for (let i = 0; i < len; i++) {
        grid[r + i][c] = 1;
      }
    }

    render();
    return true;
  }

  function markShot(r, c, outcome) {
    if (outcome === "hit") grid[r][c] = 3;
    else grid[r][c] = 2;

    render();
  }

  function onCellClick(fn) {
    clickHandler = fn;
  }

  render();

  return {
    el,
    grid,
    clear,
    canPlace,
    placeShip,
    markShot,
    onCellClick,
  };
}
