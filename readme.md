# Team Echo Battleship – Sprint 1

## Project Overview

Team Echo Battleship is a real-time multiplayer Battleship game built using a Vite frontend and a Node.js + Express + Socket.IO backend. This sprint focused on establishing a working multiplayer foundation including room creation, ship placement, readiness state, and turn-based gameplay.

---

## Tech Stack

**Frontend**

* Vite
* Vanilla JavaScript
* HTML/CSS

**Backend**

* Node.js
* Express
* Socket.IO

---

## Prerequisites

Before running this project, make sure you have:

* Node.js version 18 or higher
* npm (installed with Node)
* VS Code (recommended)
* Git (for cloning the repository)

To check your Node version:

```
node -v
```

---

## Project Structure

```
battleship-teamecho/
│
├── frontend/        # Vite frontend (UI)
├── backend/         # Express + Socket.IO server
├── CHANGELOG.md     # Project change log
└── README.md        # Setup and usage instructions
```

---

## Installation Instructions

Clone the repository:

```
git clone https://github.com/prkrshldn/battleship-teamecho.git
cd battleship-teamecho
```

---

### Install Backend Dependencies

```
cd backend
npm install
```

---

### Install Frontend Dependencies

Open a second terminal or return to root and run:

```
cd frontend
npm install
```

---

## Running the Application

You must run the backend and frontend separately.

### Step 1 – Start Backend

In terminal 1:

```
cd backend
npm start
```

Backend will run at:

```
http://localhost:9999
```

---

### Step 2 – Start Frontend

In terminal 2:

```
cd frontend
npm run dev
```

Frontend will run at:

```
http://localhost:5173
```

---

## How to Play

1. Start both backend and frontend servers.
2. Open [http://localhost:5173](http://localhost:5173) in two separate browser windows.
3. Enter the same Room Code for both players.
4. Each player places ships on their board.
5. Click Ready when ship placement is complete.
6. Once both players are ready, the game begins.
7. Players take turns firing at the opponent's board.
8. The game ends when one player's ships are all sunk.

---

## Ports Used

* Frontend: 5173
* Backend: 9999

If either port is already in use, stop the conflicting process or update the port configuration.

---

## Troubleshooting

### Frontend loads but cannot connect to backend

* Confirm backend is running on port 9999.
* Confirm the frontend socket connection points to `http://localhost:9999`.

### Port already in use

* Stop other running servers.
* Restart VS Code.
* Or change the port in backend and update frontend socket configuration accordingly.

### Dependencies fail to install

* Delete `node_modules` folder and `package-lock.json`.
* Run `npm install` again.

---

## Sprint 1 Scope Completion

The following features were completed in Sprint 1:

* Multiplayer room system
* Real-time player connection via Socket.IO
* Ship placement functionality
* Player readiness state
* Turn-based attack system
* Hit/miss tracking
* Basic win condition detection

---

## Known Limitations (To Be Addressed in Future Sprints)

* No persistent database (in-memory game state only)
* No matchmaking system beyond room codes
* No user authentication
* Basic UI styling

---

## Scripts Reference

### Backend

```
npm start
```

### Frontend

```
npm run dev
npm run build
npm run preview
```
