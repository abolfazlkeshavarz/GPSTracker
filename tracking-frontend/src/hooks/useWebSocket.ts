import {
  useEffect,
} from "react";

interface Props {
  onMessage: (
    data: any
  ) => void;
}

export const useWebSocket = ({
  onMessage,
}: Props) => {
  useEffect(() => {
    const token =
      localStorage.getItem(
        "token"
      );

    const ws =
      new WebSocket(
        `ws://localhost:8080/api/ws?token=${token}`
      );

    ws.onopen = () => {
      console.log(
        "WebSocket connected"
      );
    };

    ws.onmessage = (
      event
    ) => {
      const data =
        JSON.parse(
          event.data
        );

      onMessage(data);
    };

    ws.onerror = (
      error
    ) => {
      console.error(error);
    };

    ws.onclose = () => {
      console.log(
        "WebSocket closed"
      );
    };

    return () => {
      ws.close();
    };
  }, []);
};