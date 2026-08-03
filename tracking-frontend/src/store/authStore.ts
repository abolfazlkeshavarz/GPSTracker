import { create } from "zustand";
import {
  TOKEN_KEY,
  USER_KEY,
  clearSession,
  isTokenExpired,
} from "../lib/token";

interface User {
  id: number;
  phone: string;
  role: string;
  created_at: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
}

// Read the persisted session once at startup, discarding it if the token has
// already expired. Previously any stale token counted as "signed in", so the
// app rendered a dashboard whose every request then failed with 401.
const loadSession = (): { token: string | null; user: User | null } => {
  const token = localStorage.getItem(TOKEN_KEY);

  if (isTokenExpired(token)) {
    clearSession();
    return { token: null, user: null };
  }

  const userStr = localStorage.getItem(USER_KEY);

  if (!userStr || userStr === "null" || userStr === "undefined") {
    return { token, user: null };
  }

  try {
    return { token, user: JSON.parse(userStr) as User };
  } catch {
    return { token, user: null };
  }
};

const initial = loadSession();

export const useAuthStore = create<AuthState>((set) => ({
  token: initial.token,
  user: initial.user,

  login: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token, user });
  },

  logout: () => {
    clearSession();
    set({ token: null, user: null });
  },
}));
