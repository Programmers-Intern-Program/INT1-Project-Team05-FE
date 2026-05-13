"use client";

import { Client, type IMessage } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { useEffect, useRef, useState } from "react";

function sockJsUrl(): string {
  const base = (
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080"
  ).replace(/\/$/, "");
  return `${base}/ws-draw`;
}

/**
 * 방 입장 없이 `/sub/users/{userId}/notifications`만 구독 (친구 방 초대 등).
 * `useRoomStomp`와 별도 연결 — 방 STOMP과 notify 중복 구독을 피하려면 한쪽만 켠다.
 */
export function useUserNotificationsStomp(
  token: string | null,
  userId: number | null,
  onPayload: (body: unknown) => void,
) {
  const onRef = useRef(onPayload);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    onRef.current = onPayload;
  }, [onPayload]);

  useEffect(() => {
    if (!token || userId == null || !Number.isFinite(userId) || userId <= 0) {
      return;
    }

    const client = new Client({
      reconnectDelay: 5000,
      heartbeatIncoming: 15000,
      heartbeatOutgoing: 15000,
      webSocketFactory: () => new SockJS(sockJsUrl()) as unknown as WebSocket,
      connectHeaders: { Authorization: `Bearer ${token}` },
      onConnect: () => {
        setConnected(true);
        client.subscribe(
          `/sub/users/${userId}/notifications`,
          (message: IMessage) => {
            let body: unknown = message.body;
            try {
              body = JSON.parse(message.body);
            } catch {
              /* 그대로 */
            }
            onRef.current(body);
          },
        );
      },
      onStompError: () => {
        setConnected(false);
      },
      onWebSocketError: () => {
        setConnected(false);
      },
      onWebSocketClose: () => {
        setConnected(false);
      },
    });

    client.activate();
    return () => {
      setConnected(false);
      void client.deactivate();
    };
  }, [token, userId]);

  return { connected };
}
