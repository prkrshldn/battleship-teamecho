require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createServer } = require("node:http");
const { Server } = require("socket.io");
const { createClient } = require("@supabase/supabase-js");

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const AUTH_COOKIE_NAME = "auth_token";
const PORT = Number(process.env.PORT || 9999);

function isHttpsRequest(req) {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  return req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";
}

function parseCookies(cookieHeader = "") {
  const pairs = cookieHeader.split(";").map((item) => item.trim()).filter(Boolean);
  const out = {};

  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;

    const key = pair.slice(0, idx);
    const value = pair.slice(idx + 1);
    out[key] = decodeURIComponent(value);
  }

  return out;
}

function getCookieToken(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[AUTH_COOKIE_NAME] || null;
}

function setAuthCookie(res, req, token, expiresInSeconds = 60 * 60 * 24 * 7) {
  const maxAge = Number.isFinite(expiresInSeconds)
    ? Math.max(0, Math.floor(expiresInSeconds))
    : 60 * 60 * 24 * 7;

  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isHttpsRequest(req),
    sameSite: "lax",
    path: "/",
    maxAge: maxAge * 1000,
  });
}

function clearAuthCookie(res, req) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isHttpsRequest(req),
    sameSite: "lax",
    path: "/",
  });
}

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    credentials: true,
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

function createUserScopedClient(token) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

// Auth middleware to verify JWT token from HttpOnly cookie
async function verifyAuth(req, res, next) {
  const token = getCookieToken(req);
  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      return res.status(401).json({ error: "Invalid token" });
    }
    req.user = data.user;
    req.accessToken = token;
    next();
  } catch (err) {
    res.status(401).json({ error: "Auth failed" });
  }
}

app.get("/", (req, res) => {
  res.send("Battleship Server Running");
});

// --- Authentication Routes ---
app.post("/auth/signup", async (req, res) => {
  try {
    const { email, password, username } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    if (username && (typeof username !== "string" || username.trim().length < 2 || username.trim().length > 20)) {
      return res.status(400).json({ error: "Username must be 2-20 characters" });
    }

    const signupClient = supabaseAdmin || supabase;
    const signupResult = supabaseAdmin
      ? await signupClient.auth.admin.createUser({
        email,
        password,
        user_metadata: username ? { username: username.trim() } : {},
        email_confirm: true,
      })
      : await signupClient.auth.signUp({
        email,
        password,
        options: {
          data: username ? { username: username.trim() } : {},
        },
      });

    const { data, error } = signupResult;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Ensure signup has an authenticated session so cookie can be issued.
    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (sessionError) {
      return res.status(400).json({ error: sessionError.message });
    }

    if (!sessionData.session?.access_token) {
      return res.status(400).json({ error: "Signup succeeded but no session was issued" });
    }

    setAuthCookie(res, req, sessionData.session.access_token, sessionData.session.expires_in);
    res.json({ user: sessionData.user || data.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!data.session?.access_token) {
      return res.status(400).json({ error: "Login succeeded but no session was issued" });
    }

    setAuthCookie(res, req, data.session.access_token, data.session.expires_in);
    res.json({ user: data.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/auth/logout", async (req, res) => {
  try {
    clearAuthCookie(res, req);
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/auth/me", verifyAuth, (req, res) => {
  res.json({ user: req.user });
});

app.put("/auth/username", verifyAuth, async (req, res) => {
  try {
    const { username } = req.body;
    const trimmedUsername = username?.trim();
    if (!trimmedUsername || typeof username !== "string" || trimmedUsername.length < 2 || trimmedUsername.length > 20) {
      return res.status(400).json({ error: "Username must be 2-20 characters" });
    }

    let data;
    let error;

    if (supabaseAdmin) {
      ({ data, error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
        user_metadata: {
          ...req.user.user_metadata,
          username: trimmedUsername,
        },
      }));
    } else {
      const userClient = createUserScopedClient(req.accessToken);
      ({ data, error } = await userClient.auth.updateUser({
        data: {
          ...req.user.user_metadata,
          username: trimmedUsername,
        },
      }));
    }

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ user: data.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


io.use(async (socket, next) => {
  try {
    const cookieHeader = socket.handshake.headers.cookie || "";
    const cookies = parseCookies(cookieHeader);
    const token = cookies[AUTH_COOKIE_NAME];

    if (!token) {
      return next(new Error("Unauthorized: missing auth cookie"));
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return next(new Error("Unauthorized: invalid auth cookie"));
    }

    socket.data.user = data.user;
    return next();
  } catch (err) {
    return next(new Error("Unauthorized"));
  }
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

server.listen(PORT, () => {
  console.log(`server running at http://localhost:${PORT}`);
});
