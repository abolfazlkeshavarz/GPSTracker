import { create } from "zustand";

/*
 * Shared unread-alert count.
 *
 * The nav badge (AppLayout) and the Alerts page both need this number, and
 * they disagree the moment a user reads an alert without navigating away:
 * AppLayout only refetches on mount, so marking something read on the Alerts
 * page left the sidebar badge showing the old count until the next
 * navigation. A tiny shared store keeps both in sync from a single source
 * of truth instead of two independent fetches.
 */

interface AlertCountState {
  unreadCount: number;
  setCount: (n: number) => void;
  increment: () => void;
  decrement: (by?: number) => void;
}

export const useAlertCountStore = create<AlertCountState>((set) => ({
  unreadCount: 0,
  setCount: (n) => set({ unreadCount: Math.max(0, n) }),
  increment: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  decrement: (by = 1) => set((s) => ({ unreadCount: Math.max(0, s.unreadCount - by) })),
}));
