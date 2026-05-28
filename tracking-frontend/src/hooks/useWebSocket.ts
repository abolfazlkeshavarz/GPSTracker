import { useEffect, useRef, useState } from "react";

interface Props {
  onMessage?: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export const useWebSocket = ({ onMessage, onConnect, onDisconnect }: Props = {}) => {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const connectWebSocket = () => {
      const token = localStorage.getItem("token");
      
      if (!token) {
        console.log("No token, skipping WebSocket connection");
        return;
      }

      const ws = new WebSocket(`ws://localhost:8080/api/ws?token=${token}`);
      
      ws.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
        if (onConnect) onConnect();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Handle connection confirmation message
          if (data.type === "connected") {
            console.log("WebSocket confirmed:", data.message);
            return;
          }
          if (onMessage) onMessage(data);
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log("WebSocket closed, attempting to reconnect in 5 seconds...");
        setIsConnected(false);
        if (onDisconnect) onDisconnect();
        
        // Attempt to reconnect
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 5000) as unknown as number;
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [onMessage, onConnect, onDisconnect]);

  return { isConnected };
};