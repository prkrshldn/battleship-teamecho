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

### Install Root Dependencies

Open a third terminal or return to root and run:

```
npm install
```

---


## Running the Application

You can run both the backend and frontend in the root folder.

### Step 1 – Start Backend

In terminal 1:

```
npm start
```

Backend will run at:

```
http://localhost:9999
```
Frontend will run at:

```
http://localhost:5173
```

---

## How to Use

1. Start both backend and frontend servers.
2. Open [http://localhost:5173](http://localhost:5173) in two separate browser windows.
3. Create an account using the sign in screen
4. Once signed in, you would have to sign up again on a different account in a different window
3. Once done, press Player Vs. Player.
4. You can play a ranked game or a local game.

## Local Game
1. Go to Local (Code).
2. Try out the different settings, or keep it the same
3. When you're ready press the create button on one window
4. To join, go to the other window/account and Go to Player Vs. Player -> Local (Code)
5. Then get the code from the window you created the room in, and paste it in the Join Room text box
6. Hit join and you're in the game!

## Ranked Game
1. Go to Ranked Matchmaking.
2. All you have to do is search for a game.
3. To be matched up with someone, the other account has to do the same thing
4. If both accounts are searching for a game, you would join a room where you can play!

## How to Play
1. Each player places ships on their board.
2. Click Ready when ship placement is complete.
3. Once both players are ready, the game begins.
4. Players take turns firing at the opponent's board.
5. Players can use power ups during there turn doing different abilities
6. The game ends when one player's ships are all sunk.
7. Depending on the game mode, you can get power ups for winning!


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

## Sprint 2 Scope Completion

The following features were completed in Sprint 2:

* Login System
* Ranked Matchmaking using Elo
* Power-ups to spice up the game
* Board settings to change board size, ship count, and difficulty
* Timer system
* Ranked Leaderboard

---

## Known Limitations (To Be Addressed in Future Sprints)

* Basic UI styling
* The servers aren't perfect just yet, still dealing with issues like the amount of people can be in a room
* You can't really see your stats for yourself
* Player Vs. CPU hasn't been integrated yet

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

### Root

```
npm start
```