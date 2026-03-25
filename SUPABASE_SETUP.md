# Supabase Authentication Setup Guide

This guide documents the current authentication architecture for this project:

- Backend-managed auth with Supabase
- HttpOnly cookie sessions
- Socket.IO authentication using the same cookie

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up or log in.
2. Click "New Project" and create a project.
3. Choose region/password and wait for provisioning.

## Step 2: Get Supabase API Credentials

In Supabase: Settings -> API

- Project URL -> `SUPABASE_URL`
- Anon public key -> `SUPABASE_ANON_KEY`
- Optional service role key -> `SUPABASE_SERVICE_KEY`

## Step 3: Configure Backend Environment

Open `backend/.env` and set:

```env
SUPABASE_URL=your_project_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_role_key_optional
PORT=9999
FRONTEND_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
```

Notes:

- `SUPABASE_SERVICE_KEY` is optional. If provided, signup can create users via admin API.
- `COOKIE_SECURE` should be `true` in HTTPS deployments.

## Step 4: Configure Frontend Environment

Open `frontend/.env` and set:

```env
VITE_BACKEND_URL=http://localhost:9999
```

## Step 5: Run the App

Terminal 1 (backend):

```bash
cd backend
npm start
```

Terminal 2 (frontend):

```bash
cd frontend
npm run dev
```

Expected URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:9999`

## Step 6: Test the HttpOnly Flow

1. Open `http://localhost:5173`.
2. Sign up or log in.
3. Verify routes work after refresh (`/`, `/lobby`, `/game/:id`).
4. Verify Socket.IO connects and game room join works.
5. Log out and verify access is removed.

## How Auth Works Now

1. Frontend sends credentials to backend (`/auth/login`, `/auth/signup`) with `credentials: "include"`.
2. Backend authenticates with Supabase.
3. Backend sets `auth_token` as an HttpOnly cookie.
4. Frontend cannot read token directly; it checks session via `/auth/me`.
5. Socket.IO sends cookies (`withCredentials: true`) during handshake.
6. Backend Socket.IO middleware validates cookie token with Supabase.

## Backend Auth Endpoints

- `POST /auth/signup`
  - Body: `{ email, password }`
  - Sets HttpOnly cookie on success
  - Returns user object

- `POST /auth/login`
  - Body: `{ email, password }`
  - Sets HttpOnly cookie on success
  - Returns user object

- `POST /auth/logout`
  - Clears HttpOnly cookie

- `GET /auth/me`
  - Reads token from HttpOnly cookie
  - Returns current user if valid

## Socket.IO Security

- Client uses `withCredentials: true` and `autoConnect: false`.
- Connection is initiated after auth restore/login.
- Server rejects socket connections if auth cookie is missing/invalid.

## Troubleshooting

### Login works but socket fails

- Confirm `withCredentials: true` is set in `frontend/src/socket.js`.
- Confirm backend Socket.IO CORS has `credentials: true`.
- Confirm `FRONTEND_ORIGIN` exactly matches frontend URL.

### Cookie is not set

- Ensure frontend requests use `credentials: "include"`.
- Check browser devtools -> Application -> Cookies.
- For local HTTP, use `COOKIE_SECURE=false`.
- For HTTPS deployments, set `COOKIE_SECURE=true`.

### Always redirected to login

- Check `/auth/me` response in network tab.
- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are valid.
- Ensure system time is correct (expired JWTs can fail validation).

### CORS errors

- Backend origin must match frontend exactly (protocol, host, and port).
- Use `FRONTEND_ORIGIN=http://localhost:5173` for local development.

## Relevant Files

- `backend/index.js` - auth routes, cookie handling, Socket.IO auth middleware
- `frontend/src/auth.js` - backend auth API calls and session bootstrap
- `frontend/src/socket.js` - credentialed socket config
- `frontend/src/pages/game.js` - connect/join and auth error handling
