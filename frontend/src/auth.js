import { connectSocket, disconnectSocket } from "./socket";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:9999";

// Auth state management
let currentUser = null;
let currentSession = null;

async function authRequest(path, options = {}) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method: options.method || "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.error || "Authentication request failed");
  }

  return payload;
}

export async function login(email, password) {
  try {
    const data = await authRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
      }),
    });

    currentUser = data.user;
    currentSession = null;
    await connectSocket();
    return data;
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
}

export async function signup(email, password, username = "") {
  try {
    const body = {
      email,
      password,
    };
    if (username && username.trim().length > 0) {
      body.username = username.trim();
    }

    const data = await authRequest("/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    });

    currentUser = data.user;
    currentSession = null;
    await connectSocket();
    return data;
  } catch (error) {
    console.error("Signup error:", error);
    throw error;
  }
}


export async function logout() {
  try {
    await authRequest("/auth/logout", { method: "POST" });
    currentUser = null;
    currentSession = null;
    disconnectSocket();
  } catch (error) {
    console.error("Logout error:", error);
    currentUser = null;
    currentSession = null;
    disconnectSocket();
  }
}

export function getCurrentUser() {
  return currentUser;
}

export function getToken() {
  return null;
}

export function isAuthenticated() {
  return !!currentUser;
}

// Initialize session from HttpOnly cookie on page load.
export async function initializeAuth() {
  try {
    const data = await authRequest("/auth/me");
    currentUser = data.user;
    currentSession = null;
    await connectSocket();
    return true;
  } catch (error) {
    currentUser = null;
    currentSession = null;
    disconnectSocket();
    return false;
  }
}

export async function updateUsername(newUsername) {
  try {
    if (!newUsername || newUsername.trim().length < 2 || newUsername.trim().length > 20) {
      throw new Error("Username must be 2-20 characters");
    }

    const data = await authRequest("/auth/username", {
      method: "PUT",
      body: JSON.stringify({ username: newUsername.trim() }),
    });

    currentUser = data.user;
    return data;
  } catch (error) {
    console.error("Update username error:", error);
    throw error;
  }
}

