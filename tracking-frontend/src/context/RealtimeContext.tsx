import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getToken, isTokenExpired } from "../lib/token";

/*
 * A single WebSocket for the whole app.
 *
 * It used to live inside useWebSocket(), called from Dashboard and
 * DeviceDetails. That made the connection's lifetime the *page component's*
 * lifetime, so it was torn down and rebuilt by things that have nothing to do
 * with the network:
 *
 *   - navigating between the dashboard and a device
 *   - ResponsiveLayout swapping the desktop and mobile layouts, which
 *     unmounts the entire subtree
 *   - StrictMode's double mount in development
 *
 * Owning it above the router fixes all three: the socket is opened once and
 * survives every navigation and layout change. Pages subscribe instead of
 * connecting.
 */

export type ConnectionState =
  | "connecting"
  | "open"
  | "reconnecting"
  | "offline"     // browser reports no network
  | "unauthorized";

export interface DeviceUpdate {
  device: string;
  lat: number;
  lng: number;
  speed?: number;
  sat?: number;
  csq?: number;
  battery?: number;
  ignition?: boolean;
  heading?: number;
  timestamp?: number;
  [key: string]: unknown;
}

type Listener = (update: DeviceUpdate) => void;

interface RealtimeState {
  status: ConnectionState;
  /** True only when the socket is open. */
  isConnected: boolean;
  /** Epoch ms of the last device update, or null if none yet. */
  lastMessageAt: number | null;
  /** Subscribe to device updates; returns an unsubscribe function. */
  subscribe: (listener: Listener) => () => void;
  /** Force an immediate reconnect (used by the "retry" affordance). */
  reconnect: () => void;
}

const RealtimeContext = createContext<RealtimeState | null>(null);

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

/**
 * Close codes the server sends for an authentication problem. Retrying these
 * is pointless — the token will not become valid on its own — so the socket
 * stops instead of hammering the server.
 */
const AUTH_CLOSE_CODES = new Set([4001, 4401]);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionState>("connecting");
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  const aliveRef = useRef(true);

  // A Set, so two pages can listen at once without clobbering each other.
  const listenersRef = useRef<Set<Listener>>(new Set());

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  /** Tears down the current socket without triggering a reconnect. */
  const closeSocket = () => {
    const ws = wsRef.current;
    wsRef.current = null;

    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;

      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, "client shutdown");
      }
    }
  };

  const connectRef = useRef<() => void>(() => {});

  const scheduleReconnect = useCallback(() => {
    if (!aliveRef.current) return;

    clearTimer();

    // Exponential backoff with jitter, so a server restart does not get a
    // synchronised stampede from every open tab.
    const delay =
      Math.min(BASE_DELAY_MS * 2 ** attemptsRef.current, MAX_DELAY_MS) +
      Math.random() * 500;

    attemptsRef.current += 1;
    setStatus("reconnecting");

    timerRef.current = setTimeout(() => connectRef.current(), delay);
  }, []);

  const connect = useCallback(() => {
    if (!aliveRef.current) return;

    // Already connected or mid-handshake: nothing to do.
    const existing = wsRef.current;
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN ||
        existing.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (!navigator.onLine) {
      setStatus("offline");
      return; // the "online" listener retries
    }

    const token = getToken();
    if (!token || isTokenExpired(token)) {
      // No point connecting; the axios 401 interceptor handles the redirect.
      setStatus("unauthorized");
      return;
    }

    setStatus((s) => (s === "open" ? s : attemptsRef.current === 0 ? "connecting" : "reconnecting"));

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/api/ws?token=${encodeURIComponent(token)}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      if (!aliveRef.current) return;
      attemptsRef.current = 0;
      setStatus("open");
    };

    ws.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return; // ignore anything that is not JSON
      }

      if (data?.type === "connected") return; // handshake ack

      if (typeof data?.device === "string") {
        setLastMessageAt(Date.now());
        // Copy before iterating: a listener may unsubscribe during dispatch.
        for (const listener of Array.from(listenersRef.current)) {
          try {
            listener(data as DeviceUpdate);
          } catch (err) {
            console.error("realtime listener threw:", err);
          }
        }
      }
    };

    ws.onerror = () => {
      // onclose always follows; reconnection is handled there.
    };

    ws.onclose = (event) => {
      if (wsRef.current === ws) wsRef.current = null;
      if (!aliveRef.current) return;

      if (AUTH_CLOSE_CODES.has(event.code)) {
        setStatus("unauthorized");
        return;
      }

      scheduleReconnect();
    };
  }, [scheduleReconnect]);

  connectRef.current = connect;

  const reconnect = useCallback(() => {
    attemptsRef.current = 0;
    clearTimer();
    closeSocket();
    connect();
  }, [connect]);

  useEffect(() => {
    aliveRef.current = true;
    connect();

    // A socket suspended by a backgrounded tab often comes back dead without
    // ever firing onclose. Re-check when the tab is shown again.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;

      const ws = wsRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        attemptsRef.current = 0;
        connect();
      }
    };

    const onOnline = () => {
      attemptsRef.current = 0;
      connect();
    };

    const onOffline = () => setStatus("offline");

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      aliveRef.current = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearTimer();
      closeSocket();
    };
  }, [connect]);

  const value = useMemo<RealtimeState>(
    () => ({
      status,
      isConnected: status === "open",
      lastMessageAt,
      subscribe,
      reconnect,
    }),
    [status, lastMessageAt, subscribe, reconnect]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeState {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error("useRealtime must be used inside <RealtimeProvider>");
  }
  return ctx;
}

/**
 * Subscribes to device updates for the lifetime of the calling component.
 *
 * The handler is kept in a ref, so passing an inline arrow function does not
 * resubscribe on every render.
 */
export function useDeviceUpdates(onUpdate: (update: DeviceUpdate) => void) {
  const { subscribe } = useRealtime();
  const handlerRef = useRef(onUpdate);

  useEffect(() => {
    handlerRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(
    () => subscribe((update) => handlerRef.current(update)),
    [subscribe]
  );
}
