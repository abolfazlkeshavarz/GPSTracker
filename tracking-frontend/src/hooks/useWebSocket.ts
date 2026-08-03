import { useEffect, useRef, useState } from "react";
import { getToken, isTokenExpired } from "../lib/token";

const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

interface Props {
  onMessage?: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export const useWebSocket = ({ onMessage, onConnect, onDisconnect }: Props = {}) => {
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  const isMountedRef = useRef(true);

  // Callers pass inline arrow functions, so these change identity on every
  // render. Holding them in refs keeps the connect effect's dependency list
  // empty — previously each re-render tore the socket down and rebuilt it,
  // which meant a state update from an incoming message triggered another
  // reconnect, in a loop.
  const handlersRef = useRef({ onMessage, onConnect, onDisconnect });

  useEffect(() => {
    handlersRef.current = { onMessage, onConnect, onDisconnect };
  }, [onMessage, onConnect, onDisconnect]);

  useEffect(() => {
    isMountedRef.current = true;

    const scheduleReconnect = () => {
      if (!isMountedRef.current) return;

      // Exponential backoff with jitter. A flat 5s retry hammered the server
      // forever whenever the token was rejected.
      const delay = Math.min(
        BASE_RECONNECT_DELAY * 2 ** attemptsRef.current,
        MAX_RECONNECT_DELAY
      );
      attemptsRef.current += 1;

      reconnectTimeoutRef.current = setTimeout(
        connectWebSocket,
        delay + Math.random() * 1000
      );
    };

    const connectWebSocket = () => {
      if (!isMountedRef.current) return;

      const token = getToken();

      // Reconnecting with a dead token just produces a 401 loop; the axios
      // interceptor will redirect to /login on the next request.
      if (!token || isTokenExpired(token)) {
        return;
      }

      let ws: WebSocket;
      try {
        ws = new WebSocket(
          `${protocol}//${window.location.host}/api/ws?token=${encodeURIComponent(token)}`
        );
      } catch {
        scheduleReconnect();
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) return;
        attemptsRef.current = 0;
        setIsConnected(true);
        handlersRef.current.onConnect?.();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "connected") return;
          handlersRef.current.onMessage?.(data);
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };

      ws.onerror = () => {
        // onclose always follows, which is where reconnection is handled.
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnected(false);

        // Guard against the unmount case: closing the socket in cleanup fired
        // this handler, which scheduled a reconnect *after* cleanup had
        // already cleared the pending timer, resurrecting the connection.
        if (!isMountedRef.current) return;

        handlersRef.current.onDisconnect?.();
        scheduleReconnect();
      };
    };

    connectWebSocket();

    return () => {
      isMountedRef.current = false;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      const ws = wsRef.current;
      wsRef.current = null;

      if (ws) {
        // Drop handlers before closing so nothing fires during teardown.
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  return { isConnected };
};
