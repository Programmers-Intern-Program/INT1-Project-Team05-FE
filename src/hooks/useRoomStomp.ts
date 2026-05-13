"use client";

import { Client, type IMessage } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { useCallback, useEffect, useRef, useState } from "react";

export type RoomStompDestination = "room" | "chat" | "ranking" | "notify";

function sockJsUrl(): string {
  const base = (
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080"
  ).replace(/\/$/, "");
  return `${base}/ws-draw`;
}

/**
 * 방 단위 STOMP 구독 (`/sub/rooms/{roomId}`, `/sub/rooms/{roomId}/chat`, `/sub/rooms/{roomId}/ranking`).
 * 선택적으로 `/sub/users/{userId}/notifications`(친구 방 초대 등)도 구독합니다.
 * CONNECT 시 `Authorization: Bearer …` (백엔드 StompHandler와 동일).
 */
export function useRoomStomp(
  roomId: number,
  enabled: boolean,
  token: string | null,
  onPayload: (dest: RoomStompDestination, body: unknown) => void,
  notifyUserId: number | null = null,
) {
  const onPayloadRef = useRef(onPayload);
  const clientRef = useRef<Client | null>(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    onPayloadRef.current = onPayload;
  }, [onPayload]);

  useEffect(() => {
    if (!enabled || !Number.isFinite(roomId) || roomId <= 0 || !token) return;

    const client = new Client({
      reconnectDelay: 5000,
      heartbeatIncoming: 15000,
      heartbeatOutgoing: 15000,
      webSocketFactory: () => new SockJS(sockJsUrl()) as unknown as WebSocket,
      connectHeaders: { Authorization: `Bearer ${token}` },
      onConnect: () => {
        setConnected(true);
        client.subscribe(`/sub/rooms/${roomId}`, (message: IMessage) => {
          let body: unknown = message.body;
          try {
            body = JSON.parse(message.body);
          } catch {
            /* 그대로 문자열 */
          }
          onPayloadRef.current("room", body);
        });
        client.subscribe(`/sub/rooms/${roomId}/chat`, (message: IMessage) => {
          let body: unknown = message.body;
          try {
            body = JSON.parse(message.body);
          } catch {
            /* 그대로 */
          }
          onPayloadRef.current("chat", body);
        });
        client.subscribe(
          `/sub/rooms/${roomId}/ranking`,
          (message: IMessage) => {
            let body: unknown = message.body;
            try {
              body = JSON.parse(message.body);
            } catch {
              /* 그대로 */
            }
            onPayloadRef.current("ranking", body);
          },
        );
        if (
          notifyUserId != null &&
          Number.isFinite(notifyUserId) &&
          notifyUserId > 0
        ) {
          client.subscribe(
            `/sub/users/${notifyUserId}/notifications`,
            (message: IMessage) => {
              let body: unknown = message.body;
              try {
                body = JSON.parse(message.body);
              } catch {
                /* 그대로 */
              }
              onPayloadRef.current("notify", body);
            },
          );
        }
      },
      onStompError: (frame) => {
        setConnected(false);
        console.warn("[STOMP]", frame.headers?.message ?? frame.body);
      },
      onWebSocketError: () => {
        setConnected(false);
        console.warn("[STOMP] websocket error");
      },
      onWebSocketClose: () => {
        setConnected(false);
      },
    });

    clientRef.current = client;
    client.activate();

    return () => {
      setConnected(false);
      clientRef.current = null;
      void client.deactivate();
    };
  }, [roomId, enabled, token, notifyUserId]);

  const publishChat = useCallback(
    (message: string, moderationTraceId?: string) => {
      const client = clientRef.current;
      const trimmed = message.trim();
      if (!client || !connected || !trimmed) return false;
      client.publish({
        destination: `/pub/rooms/${roomId}/chat`,
        body: JSON.stringify({
          message: trimmed,
          ...(moderationTraceId ? { moderationTraceId } : {}),
        }),
      });
      return true;
    },
    [connected, roomId],
  );

  return { connected, publishChat };
}
