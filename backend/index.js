const express = require("express");
const { createServer } = require("node:http");
const { Server } = require("socket.io");

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

app.get("/", (req, res) => {
  res.send("Battleship Server Running");
});

const rooms = {};

function buildGameSummary(room) {
  const summary = {};
  for (const p of Object.values(room.players)) {
    summary[p.id] = {
      id: p.id,
      name: p.name,
      hits: p.stats?.hits ?? 0,
      misses: p.stats?.misses ?? 0,
      shipsSunk: p.stats?.shipsSunk ?? 0,
      sunkShips: p.stats?.sunkShips ?? [],
    };
  }
  return summary;
}

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("join", ({ roomCode, playerName, settings }) => {
    const code = roomCode.toUpperCase();
    socket.join(code);

    if (!rooms[code]) {
      rooms[code] = {
        players: {},
        turn: null,
        state: "waiting",
        settings: settings || {
          boardSize: 10,
          difficulty: "normal",
          ships: [],
        },
      };
    }

    const room = rooms[code];
    const boardSize = room.settings.boardSize || 10;

    room.players[socket.id] = {
      id: socket.id,
      name: playerName || "Player",
      board: null,
      ships: [],
      shotsReceived: Array.from({ length: boardSize }, () =>
        Array(boardSize).fill(0),
      ),
      ready: false,
      stats: {
        hits: 0,
        misses: 0,
        shipsSunk: 0,
        sunkShips: [],
      },
    };

    io.to(code).emit("room_update", {
      players: Object.values(room.players).map((p) => ({
        id: p.id,
        name: p.name,
        ready: p.ready,
      })),
      settings: room.settings,
    });

    console.log(`${playerName} joined ${code}`);
  });

  socket.on("place_ships", ({ roomCode, grid, ships }) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];
    if (!room) return;

    const boardSize = room.settings.boardSize || 10;

    if (room.players[socket.id]) {
      room.players[socket.id].board = grid;
      room.players[socket.id].ships = ships.map((s) => ({ ...s, hits: 0 }));
      room.players[socket.id].ready = true;
      room.players[socket.id].shotsReceived = Array.from(
        { length: boardSize },
        () => Array(boardSize).fill(0),
      );
      room.players[socket.id].stats = {
        hits: 0,
        misses: 0,
        shipsSunk: 0,
        sunkShips: [],
      };
    }

    const pIds = Object.keys(room.players);
    if (pIds.length === 2 && pIds.every((id) => room.players[id].ready)) {
      room.state = "playing";
      room.turn = pIds[0];

      io.to(code).emit("game_start", {
        turn: room.turn,
        settings: room.settings,
      });

      console.log(`Game started in ${code}`);
    } else {
      io.to(code).emit("room_update", {
        players: Object.values(room.players).map((p) => ({
          id: p.id,
          name: p.name,
          ready: p.ready,
        })),
        settings: room.settings,
      });
    }
  });

  socket.on("fire", ({ roomCode, r, c }) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];
    if (!room || room.state !== "playing") return;

    const boardSize = room.settings.boardSize || 10;

    if (r < 0 || c < 0 || r >= boardSize || c >= boardSize) return;
    if (room.turn !== socket.id) return;

    const pIds = Object.keys(room.players);
    const opponentId = pIds.find((id) => id !== socket.id);
    const opponent = room.players[opponentId];
    if (!opponent || !opponent.board) return;

    if (opponent.shotsReceived[r][c] !== 0) {
      return;
    }

    const targetCell = opponent.board[r][c];
    const isHit = targetCell === 1;

    opponent.shotsReceived[r][c] = isHit ? 3 : 2;

    const shooter = room.players[socket.id];
    if (isHit) shooter.stats.hits += 1;
    else shooter.stats.misses += 1;

    let sunkShipName = null;
    if (isHit) {
      const ship = opponent.ships.find((s) =>
        s.coords.some((coord) => coord.r === r && coord.c === c),
      );

      if (ship) {
        ship.hits += 1;
        if (ship.hits === ship.len) {
          sunkShipName = ship.name;
          shooter.stats.shipsSunk += 1;
          if (!shooter.stats.sunkShips.includes(ship.name)) {
            shooter.stats.sunkShips.push(ship.name);
          }
        }
      }
    }

    io.to(code).emit("shot_result", {
      shooter: socket.id,
      r,
      c,
      hit: isHit,
      sunk: sunkShipName,
    });

    const allSunk = opponent.ships.every((s) => s.hits >= s.len);
    if (allSunk) {
      room.state = "ended";
      const summary = buildGameSummary(room);
      io.to(code).emit("game_over", {
        winnerId: socket.id,
        loserId: opponentId,
        summary,
      });
      return;
    }

    if (!isHit) {
      room.turn = opponentId;
      io.to(code).emit("turn_change", { turn: room.turn });
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

server.listen(9999, () => {
  console.log("server running at http://localhost:9999");
});
