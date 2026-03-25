# Username Feature Implementation

This document outlines the changes made to add username support to the battleship authentication system.

## Overview

Users can now:
1. Set a username when signing up for a new account
2. Change their username anytime after logging in
3. See their current username on the home page

## Technical Changes

### Backend Changes (`backend/index.js`)

#### 1. Modified `/auth/signup` endpoint
- Now accepts optional `username` parameter (2-20 characters)
- Passes username to Supabase via `user_metadata` field (both admin and regular auth)
- Returns user object with metadata after signup

```javascript
// Request body:
{
  email: "user@example.com",
  password: "securepass123",
  username: "MyUsername"       // New field
}
```

#### 2. Added `PUT /auth/username` endpoint (requires authentication)
- Protected by `verifyAuth` middleware (requires valid HttpOnly cookie)
- Updates username in Supabase user metadata
- Validates username length (2-20 characters)
- Returns updated user object

```javascript
// Request body:
{
  username: "NewUsername"
}
```

**Error Handling:**
- 400: Missing/invalid username format
- 401: Unauthorized (no valid session cookie)
- 500: Server error

### Frontend Changes

#### 1. `frontend/src/auth.js`
- **Modified `signup()` function** - Now accepts `username` parameter and passes it to backend
- **Added `updateUsername()` function** - Sends PUT request to `/auth/username` endpoint and updates local user state

#### 2. `frontend/src/pages/login.js`
- Added username input field that appears only in signup mode
- Username field is required when in signup mode
- Shows validation error ("Username must be 2-20 characters") if invalid
- Passes username to signup function

#### 3. `frontend/src/pages/home.js`
- Displays current username from `user.user_metadata.username`
- Added username edit UI with input field and "Update" button
- Shows success/error messages when updating
- Updates user state in memory when username changes
- Maintains separate "display name for this game" field for game-specific player names

## Data Storage

**Location:** Supabase `user.user_metadata` field

- Non-intrusive approach (no database migrations needed)
- Part of Supabase auth JWT (included on every request)
- Persists across sessions (stored server-side)
- Can be extended with other metadata fields in future

## Validation Rules

- **Minimum length:** 2 characters
- **Maximum length:** 20 characters
- **Trimmed:** Whitespace is removed automatically
- **Required:** Only required on signup; optional (but validated) on update

## User Flow

### Signup
1. User fills email, password, and username on signup form
2. Frontend validates username (2-20 chars)
3. Frontend sends to `/auth/signup` with all three fields
4. Backend stores username in Supabase user metadata
5. Backend sets HttpOnly cookie with JWT
6. User redirected to home page

### Update Username
1. User navigates to home page
2. Current username displayed in editable input
3. User changes input and clicks "Update" button
4. Frontend validates username (2-20 chars)
5. Frontend sends PUT request to `/auth/username`
6. Backend updates Supabase user metadata
7. Frontend updates local user state
8. Success message shown to user

### Login
1. User logs in with email/password (unchanged)
2. Backend retrieves user from Supabase (includes latest username)
3. Username automatically available on home page

## Testing Checklist

- [ ] Signup with username creates account correctly
- [ ] Username appears on home page after signup
- [ ] Updating username persists after page refresh
- [ ] Updating username persists after logout/login
- [ ] Username validation works (reject <2 or >20 chars)
- [ ] Username displays in game lobby/game
- [ ] Multiple users can have different usernames

## Files Modified

1. `backend/index.js` - Auth endpoints and validation
2. `frontend/src/auth.js` - Auth client functions
3. `frontend/src/pages/login.js` - Signup form UI
4. `frontend/src/pages/home.js` - Username display and edit UI

## Backward Compatibility

- Existing users without username set will show "Unknown" on home page
- Username is now optional on signup (if blank, "Unknown" will be displayed)
- No database migrations required (uses existing Supabase metadata field)
