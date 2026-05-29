import { create } from "zustand";

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

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("token"),
  user: (() => {
    const userStr = localStorage.getItem("user");
    if (userStr && userStr !== "null") {
      try {
        return JSON.parse(userStr);
      } catch {
        return null;
      }
    }
    return null;
  })(),
  
  login: (token, user) => {
    console.log("Logging in user:", user); // Debug log
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    set({ token, user });
  },
  
  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    set({ token: null, user: null });
  },
}));