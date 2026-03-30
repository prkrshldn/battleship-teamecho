require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");
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

// --- ELO Stats Storage ---
const statsFile = path.join(__dirname, "stats.json");
let playerStats = {};

try {
  if (fs.existsSync(statsFile)) {
    playerStats = JSON.parse(fs.readFileSync(statsFile, "utf-8"));
  }
} catch (e) {
  console.error("Error loading stats.json:", e);
}

function saveStats() {
  fs.writeFileSync(statsFile, JSON.stringify(playerStats, null, 2));
}

function getPlayerStats(name) {
  // If name is falsy, defaults to guest
  if (!name) return { name: "Guest", elo: 1000, wins: 0, losses: 0, powerups: { sonar: 1, doubleShot: 1 }, currentWinStreak: 0, highestEloReached: 1000 };
  if (!playerStats[name]) {
    playerStats[name] = { name, elo: 1000, wins: 0, losses: 0, powerups: { sonar: 1, doubleShot: 1 }, currentWinStreak: 0, highestEloReached: 1000 };
  }
  if (!playerStats[name].powerups) {
    playerStats[name].powerups = { sonar: 1, doubleShot: 1 };
  }
  if (playerStats[name].currentWinStreak === undefined) playerStats[name].currentWinStreak = 0;
  if (playerStats[name].highestEloReached === undefined) playerStats[name].highestEloReached = playerStats[name].elo || 1000;
  return playerStats[name];
}

function hydrateStatsFromUserMetadata(playerName, userMetadata = {}) {
  if (!playerName || !userMetadata || typeof userMetadata !== "object") return;

  const stats = getPlayerStats(playerName);
  let changed = false;

  const metadataPowerups = userMetadata.powerups;
  const sonarRaw =
    (metadataPowerups && metadataPowerups.sonar !== undefined ? metadataPowerups.sonar : undefined)
    ?? userMetadata.sonar
    ?? userMetadata.powerup_sonar;
  const doubleShotRaw =
    (metadataPowerups && metadataPowerups.doubleShot !== undefined ? metadataPowerups.doubleShot : undefined)
    ?? userMetadata.doubleShot
    ?? userMetadata.powerup_doubleShot;

  if (sonarRaw !== undefined) {
    const sonar = Number(sonarRaw);
    if (Number.isFinite(sonar)) {
      stats.powerups.sonar = Math.max(0, Math.floor(sonar));
      changed = true;
    }
  }

  if (doubleShotRaw !== undefined) {
    const doubleShot = Number(doubleShotRaw);
    if (Number.isFinite(doubleShot)) {
      stats.powerups.doubleShot = Math.max(0, Math.floor(doubleShot));
      changed = true;
    }
  }

  if (changed) {
    saveStats();
  }
}

function updateElo(winnerName, loserName, winnerLostShipsCount = 5) {
  const winner = getPlayerStats(winnerName);
  const loser = getPlayerStats(loserName);

  if (winnerName === "Guest" || loserName === "Guest" || winnerName === loserName) {
    return { 
      winnerOldElo: winner.elo, winnerNewElo: winner.elo, winnerGain: 0, 
      loserOldElo: loser.elo, loserNewElo: loser.elo, loserLoss: 0, bonuses: {} 
    };
  }

  const K = 32;
  const expectedWinner = 1 / (1 + Math.pow(10, (loser.elo - winner.elo) / 400));
  const expectedLoser = 1 / (1 + Math.pow(10, (winner.elo - loser.elo) / 400));

  const winnerGain = Math.round(K * (1 - expectedWinner));
  const loserLoss = Math.round(K * (0 - expectedLoser));

  const winnerOldElo = winner.elo;
  const loserOldElo = loser.elo;

  winner.elo += winnerGain;
  loser.elo += loserLoss;
  winner.wins += 1;
  winner.currentWinStreak += 1;
  loser.losses += 1;
  loser.currentWinStreak = 0;

  loser.elo = Math.max(0, loser.elo); // Prevent negative ELO

  const powerupType = Math.random() < 0.5 ? 'sonar' : 'doubleShot';
  if (!winner.powerups) winner.powerups = { sonar: 1, doubleShot: 1 };
  winner.powerups[powerupType] = (winner.powerups[powerupType] || 0) + 1;

  let bonuses = { flawless: false, streak: false, eloTier: false };

  // Flawless Victory
  if (winnerLostShipsCount <= 2) {
    bonuses.flawless = true;
    winner.powerups.sonar += 1;
    winner.powerups.doubleShot += 1;
  }

  // Win Streak
  if (winner.currentWinStreak > 0 && winner.currentWinStreak % 3 === 0) {
    bonuses.streak = true;
    winner.powerups.sonar += 2;
    winner.powerups.doubleShot += 2;
  }

  // ELO Tier
  let currentTier = Math.floor(winner.elo / 50);
  let highestTier = Math.floor(winner.highestEloReached / 50);
  if (currentTier > highestTier) {
    bonuses.eloTier = true;
    winner.powerups.sonar += 1;
    winner.powerups.doubleShot += 1;
    winner.highestEloReached = winner.elo;
  } else if (winner.elo > winner.highestEloReached) {
    winner.highestEloReached = winner.elo;
  }

  saveStats();

  return {
    winnerOldElo, winnerNewElo: winner.elo, winnerGain,
    loserOldElo, loserNewElo: loser.elo, loserLoss, winnerPowerupAwarded: powerupType,
    bonuses
  };
}

// --- API Endpoints ---
app.get("/api/leaderboard", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  const leaderboard = Object.values(playerStats).sort((a, b) => b.elo - a.elo);
  res.json(leaderboard);
});

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

if (!supabaseAdmin) {
  console.warn("SUPABASE_SERVICE_KEY is not set. Post-game stats will not sync to Supabase.");
}

async function syncPlayerStatsToSupabase(player) {
  if (!supabaseAdmin || !player?.userId || !player?.name || player.name === "Guest") {
    return;
  }

  const stats = getPlayerStats(player.name);
  const nextMetadata = {
    ...(player.userMetadata || {}),
    wins: stats.wins || 0,
    losses: stats.losses || 0,
    current_elo: stats.elo || 1000,
    highest_elo: stats.highestEloReached || stats.elo || 1000,
    powerups: stats.powerups || { sonar: 1, doubleShot: 1 },
  };

  const { error } = await supabaseAdmin.auth.admin.updateUserById(player.userId, {
    user_metadata: nextMetadata,
  });

  if (error) {
    throw new Error(error.message || "Failed to sync player stats");
  }

  player.userMetadata = nextMetadata;
}

async function syncMatchStatsToSupabase(winner, loser) {
  if (!supabaseAdmin) {
    return;
  }

  const results = await Promise.allSettled([
    syncPlayerStatsToSupabase(winner),
    syncPlayerStatsToSupabase(loser),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Supabase stats sync failed:", result.reason?.message || result.reason);
    }
  }
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

    let updatedUser = null;
    let errorMessage = null;

    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
        user_metadata: {
          ...req.user.user_metadata,
          username: trimmedUsername,
        },
      });

      if (error) {
        errorMessage = error.message;
      } else {
        updatedUser = data.user;
      }
    } else {
      // updateUser in supabase-js requires an in-memory session and can fail with
      // "Auth session missing" in stateless server handlers. Use Auth REST directly.
      const authResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${req.accessToken}`,
        },
        body: JSON.stringify({
          data: {
            ...req.user.user_metadata,
            username: trimmedUsername,
          },
        }),
      });

      const authPayload = await authResp.json().catch(() => ({}));
      if (!authResp.ok) {
        errorMessage = authPayload?.msg || authPayload?.error_description || authPayload?.error || "Failed to update username";
      } else {
        updatedUser = authPayload;
      }
    }

    if (errorMessage) {
      return res.status(400).json({ error: errorMessage });
    }

    res.json({ user: updatedUser });
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
const rankedQueue = [];

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function createRoomPlayer(socketId, name, user) {
  return {
    id: socketId,
    name: name || "Player",
    userId: user?.id || null,
    userMetadata: user?.user_metadata || {},
    board: null,
    shotsReceived: Array.from({ length: 10 }, () => Array(10).fill(0)),
    ready: false,
    stats: {
      hits: 0,
      misses: 0,
      shipsSunk: 0,
      sunkShips: [],
    },
  };
}

function getRankedNameFromUser(user) {
  const username = user?.user_metadata?.username;
  if (typeof username === "string" && username.trim().length >= 2) {
    return username.trim();
  }

  if (typeof user?.email === "string" && user.email.includes("@")) {
    return user.email.split("@")[0];
  }

  return "Player";
}

function removeFromRankedQueue(socketId) {
  const idx = rankedQueue.findIndex((entry) => entry.socketId === socketId);
  if (idx >= 0) {
    rankedQueue.splice(idx, 1);
    return true;
  }
  return false;
}

function findRankedMatchPair(nowMs = Date.now()) {
  if (rankedQueue.length < 2) return null;

  let bestPair = null;

  for (let i = 0; i < rankedQueue.length; i++) {
    for (let j = i + 1; j < rankedQueue.length; j++) {
      const a = rankedQueue[i];
      const b = rankedQueue[j];

      const diff = Math.abs(a.elo - b.elo);
      const waitedMs = Math.max(nowMs - a.queuedAt, nowMs - b.queuedAt);
      const waitedSeconds = Math.floor(waitedMs / 1000);
      const threshold = 120 + Math.min(380, waitedSeconds * 8);

      if (diff > threshold) continue;

      const score = diff - waitedSeconds * 0.25;
      if (!bestPair || score < bestPair.score) {
        bestPair = { i, j, score, diff };
      }
    }
  }

  return bestPair;
}

function tryStartRankedMatches() {
  while (rankedQueue.length >= 2) {
    const pair = findRankedMatchPair(Date.now());
    if (!pair) return;

    const [high, low] = pair.i > pair.j ? [pair.i, pair.j] : [pair.j, pair.i];
    const second = rankedQueue.splice(high, 1)[0];
    const first = rankedQueue.splice(low, 1)[0];

    const firstSocket = io.sockets.sockets.get(first.socketId);
    const secondSocket = io.sockets.sockets.get(second.socketId);

    if (!firstSocket || !secondSocket) {
      continue;
    }

    let roomCode = makeRoomCode();
    while (rooms[roomCode]) {
      roomCode = makeRoomCode();
    }

    rooms[roomCode] = {
      players: {},
      turn: null,
      state: "waiting",
      mode: "ranked",
    };

    const room = rooms[roomCode];
    room.players[firstSocket.id] = createRoomPlayer(firstSocket.id, first.name, first.user);
    room.players[secondSocket.id] = createRoomPlayer(secondSocket.id, second.name, second.user);

    firstSocket.join(roomCode);
    secondSocket.join(roomCode);

    firstSocket.emit("ranked_match_found", {
      roomCode,
      mode: "ranked",
      yourElo: first.elo,
      opponent: { name: second.name, elo: second.elo },
    });
    secondSocket.emit("ranked_match_found", {
      roomCode,
      mode: "ranked",
      yourElo: second.elo,
      opponent: { name: first.name, elo: first.elo },
    });

    io.to(roomCode).emit("room_update", {
      mode: "ranked",
      players: Object.values(room.players).map((p) => ({
        id: p.id,
        name: p.name,
        ready: p.ready,
      })),
    });

    console.log(`Ranked match created in ${roomCode}: ${first.name} (${first.elo}) vs ${second.name} (${second.elo})`);
  }
}

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

  socket.on("ranked_queue_join", () => {
    removeFromRankedQueue(socket.id);

    const rankedName = getRankedNameFromUser(socket.data.user);
    const stats = getPlayerStats(rankedName);

    rankedQueue.push({
      socketId: socket.id,
      queuedAt: Date.now(),
      elo: stats.elo || 1000,
      name: rankedName,
      user: socket.data.user,
    });

    socket.emit("ranked_queue_joined", {
      mode: "ranked",
      elo: stats.elo || 1000,
      queuedAt: Date.now(),
    });

    tryStartRankedMatches();
  });

  socket.on("ranked_queue_leave", () => {
    const removed = removeFromRankedQueue(socket.id);
    socket.emit("ranked_queue_left", { removed });
  });

  // 1. Join Room
  socket.on("join", (roomCode, playerName, options = {}) => {
    const code = roomCode.toUpperCase();
    const requestedMode = options?.mode === "ranked" ? "ranked" : "local";

    if (!rooms[code]) {
      rooms[code] = { players: {}, turn: null, state: "waiting", mode: requestedMode };
    }

    const room = rooms[code];
    if (!room.mode) {
      room.mode = requestedMode;
    }

    if (room.mode !== requestedMode) {
      socket.emit("join_error", { message: `Room is ${room.mode} mode` });
      return;
    }

    const isAlreadyInRoom = Boolean(room.players[socket.id]);
    const playerCount = Object.keys(room.players).length;
    if (!isAlreadyInRoom && playerCount >= 2) {
      socket.emit("join_error", { message: "Room is full (2 players max)" });
      return;
    }

    socket.join(code);

    // Add player
    room.players[socket.id] = createRoomPlayer(socket.id, playerName, socket.data.user);
    const joinedPlayer = room.players[socket.id];
    hydrateStatsFromUserMetadata(joinedPlayer.name, joinedPlayer.userMetadata);
    const joinedPlayerStats = getPlayerStats(joinedPlayer.name);
    const joinedPowerups = joinedPlayerStats.powerups || { sonar: 1, doubleShot: 1 };

    socket.emit("player_stats", {
      powerups: {
        sonar: Number.isFinite(Number(joinedPowerups.sonar)) ? Number(joinedPowerups.sonar) : 1,
        doubleShot: Number.isFinite(Number(joinedPowerups.doubleShot)) ? Number(joinedPowerups.doubleShot) : 1,
      },
    });

    // Notify everyone in room
    io.to(code).emit("room_update", {
      mode: room.mode,
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

      for (const id of pIds) {
        const player = room.players[id];
        const stats = getPlayerStats(player.name);
        const powerups = stats.powerups || { sonar: 1, doubleShot: 1 };
        io.to(id).emit("player_stats", {
          powerups: {
            sonar: Number.isFinite(Number(powerups.sonar)) ? Number(powerups.sonar) : 1,
            doubleShot: Number.isFinite(Number(powerups.doubleShot)) ? Number(powerups.doubleShot) : 1,
          },
        });
      }

      io.to(code).emit("game_start", { turn: room.turn });
      console.log(`Game started in ${code}`);
    } else {
      // Update ready status
      io.to(code).emit("room_update", {
        mode: room.mode,
        players: Object.values(room.players).map((p) => ({
          id: p.id,
          name: p.name,
          ready: p.ready,
        })),
      });
    }
  });

  // 3. Fire Shot
  socket.on("fire", async ({ roomCode, r, c }) => {
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
      let eloChanges = null;

      if (room.mode === "ranked") {
        const winnerLostShipsCount = (shooter.ships || []).filter((s) => s.hits >= s.len).length;
        eloChanges = updateElo(shooter.name, opponent.name, winnerLostShipsCount);
        await syncMatchStatsToSupabase(shooter, opponent);
      }

      io.to(code).emit("game_over", {
        winnerId: socket.id,
        loserId: opponentId,
        mode: room.mode,
        summary,
        eloChanges,
      });
      return;
    }

    // Switch turn only if miss (isHit == false)
        // Switch turn only if miss (isHit == false)
    if (isHit == false) {
      if (shooter.doubleShotActive) {
        shooter.doubleShotActive = false;
        socket.emit("bonus_turn", { message: "Miss! First shot fired. Double Shot is active, fire second shot!" });
      } else {
        room.turn = opponentId;
        io.to(code).emit("turn_change", { turn: room.turn });
      }
    }
  });

  // 4. Use Sonar
  socket.on("use_sonar", ({ roomCode, r, c }) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];
    if (!room || room.state !== "playing" || room.turn !== socket.id) return;

    const pIds = Object.keys(room.players);
    const opponentId = pIds.find((id) => id !== socket.id);
    const opponent = room.players[opponentId];
    const shooter = room.players[socket.id];
    const stats = getPlayerStats(shooter.name);

    if (!stats.powerups || !stats.powerups.sonar || stats.powerups.sonar <= 0) return;

    // Deduct sonar
    stats.powerups.sonar -= 1;
    saveStats();

    // Check 3x3 area
    let foundCells = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10) {
          if (opponent.board[nr][nc] === 1) {
            foundCells.push({ r: nr, c: nc });
          }
        }
      }
    }

    // Emit result back to who activated it
    socket.emit("sonar_result", { r, c, found: foundCells, remaining: stats.powerups.sonar });
  });

  // 5. Activate Double Shot
  socket.on("activate_double_shot", ({ roomCode }) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];
    if (!room || room.state !== "playing" || room.turn !== socket.id) return;

    const shooter = room.players[socket.id];
    const stats = getPlayerStats(shooter.name);

    if (!stats.powerups || !stats.powerups.doubleShot || stats.powerups.doubleShot <= 0) return;

    // Deduct doubleShot
    stats.powerups.doubleShot -= 1;
    saveStats();

    shooter.doubleShotActive = true;
    socket.emit("double_shot_activated", { remaining: stats.powerups.doubleShot });
  });

  socket.on("disconnect", () => {
    removeFromRankedQueue(socket.id);
    // Cleanup logic could go here
    console.log(`User disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`server running at http://localhost:${PORT}`);
});
