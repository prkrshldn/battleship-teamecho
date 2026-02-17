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

// --- Game State ---
// rooms[code] = {
//   players: { [socketId]: { id, name, board, ships, ready } },
//   turn: socketId,
//   state: 'waiting' | 'playing' | 'ended'
// }
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

  // 1. Join Room
  socket.on("join", (roomCode, playerName) => {
    const code = roomCode.toUpperCase();
    socket.join(code);

    if (!rooms[code]) {
      rooms[code] = { players: {}, turn: null, state: "waiting" };
    }

    const room = rooms[code];
    // Add player
    room.players[socket.id] = {
      id: socket.id,
      name: playerName || "Player",
      board: null, // Will be 10x10 grid (ships)
      // 0 = not shot, 2 = miss, 3 = hit (from opponent)
      shotsReceived: Array.from({ length: 10 }, () => Array(10).fill(0)),
      ready: false,
      stats: {
        hits: 0,
        misses: 0,
        shipsSunk: 0,
        sunkShips: [],
      },
    };

    // Notify everyone in room
    io.to(code).emit("room_update", {
      players: Object.values(room.players).map((p) => ({
        id: p.id,
        name: p.name,
        ready: p.ready,
      })),
    });

    console.log(`${playerName} joined ${code}`);
  });

  // 2. Place Ships (Ready)
  socket.on("place_ships", ({ roomCode, grid, ships }) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];
    if (!room) return;

    if (room.players[socket.id]) {
      room.players[socket.id].board = grid; // Store the secret board
      // store ships: [ { name, len, hits: 0, coords: [{r,c}, ...] } ]
      room.players[socket.id].ships = ships.map((s) => ({ ...s, hits: 0 }));
      room.players[socket.id].ready = true;

      // reset per-game stats on (re)ready
      room.players[socket.id].shotsReceived = Array.from({ length: 10 }, () =>
        Array(10).fill(0),
      );
      room.players[socket.id].stats = {
        hits: 0,
        misses: 0,
        shipsSunk: 0,
        sunkShips: [],
      };
    }

    // Check if both ready
    const pIds = Object.keys(room.players);
    if (pIds.length === 2 && pIds.every((id) => room.players[id].ready)) {
      room.state = "playing";
      room.turn = pIds[0]; // First player starts

      io.to(code).emit("game_start", { turn: room.turn });
      console.log(`Game started in ${code}`);
    } else {
      // Update ready status
      io.to(code).emit("room_update", {
        players: Object.values(room.players).map((p) => ({
          id: p.id,
          name: p.name,
          ready: p.ready,
        })),
      });
    }
  });

  // 3. Fire Shot
  socket.on("fire", ({ roomCode, r, c }) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];
    if (!room || room.state !== "playing") return;

    if (room.turn !== socket.id) return; // Not your turn

    const pIds = Object.keys(room.players);
    const opponentId = pIds.find((id) => id !== socket.id);
    const opponent = room.players[opponentId];

    // Validate: Already shot?
    if (opponent.shotsReceived[r][c] !== 0) {
      return; // Already shot here, ignore
    }

    // Check hit
    const targetCell = opponent.board[r][c];
    // 0=empty, 1=ship
    const isHit = targetCell === 1;

    // Mark shot to prevent duplicates (and for end-of-game summary)
    opponent.shotsReceived[r][c] = isHit ? 3 : 2;

    // Update shooter stats
    const shooter = room.players[socket.id];
    if (isHit) shooter.stats.hits += 1;
    else shooter.stats.misses += 1;

    // Track ship damage
    let sunkShipName = null;
    if (isHit) {
      // Find which ship was hit
      const ship = opponent.ships.find((s) =>
        s.coords.some((coord) => coord.r === r && coord.c === c),
      );

      if (ship) {
        ship.hits += 1;
        if (ship.hits === ship.len) {
          sunkShipName = ship.name;

          // record shooter sunk ship
          shooter.stats.shipsSunk += 1;
          if (!shooter.stats.sunkShips.includes(ship.name)) {
            shooter.stats.sunkShips.push(ship.name);
          }
        }
      }
    }

    // Send result to EVERYONE
    io.to(code).emit("shot_result", {
      shooter: socket.id,
      r,
      c,
      hit: isHit,
      sunk: sunkShipName,
    });

    // Win condition: all opponent ships sunk
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

    // Switch turn only if miss (isHit == false)
    if (isHit == false) {
      room.turn = opponentId;
      io.to(code).emit("turn_change", { turn: room.turn });
    }
  });

  socket.on("disconnect", () => {
    // Cleanup logic could go here
    console.log(`User disconnected: ${socket.id}`);
  });
});

server.listen(9999, () => {
  console.log("server running at http://localhost:9999");
});
