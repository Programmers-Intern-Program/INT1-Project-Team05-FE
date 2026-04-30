'use client';

import { Client, type IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useEffect, useRef } from 'react';

export type RoomStompDestination = 'room' | 'chat';

function sockJsUrl(): string {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '');
  return `${base}/ws-draw`;
}

/**
 * 방 단위 STOMP 구독 (`/sub/rooms/{roomId}`, `/sub/rooms/{roomId}/chat`).
 * CONNECT 시 `Authorization: Bearer …` (백엔드 StompHandler와 동일).
 */
export function useRoomStomp(
  roomId: number,
  enabled: boolean,
  token: string | null,
  onPayload: (dest: RoomStompDestination, body: unknown) => void,
) {
  const onPayloadRef = useRef(onPayload);
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
        client.subscribe(`/sub/rooms/${roomId}`, (message: IMessage) => {
          let body: unknown = message.body;
          try {
            body = JSON.parse(message.body);
          } catch {
            /* 그대로 문자열 */
          }
          onPayloadRef.current('room', body);
        });
        client.subscribe(`/sub/rooms/${roomId}/chat`, (message: IMessage) => {
          let body: unknown = message.body;
          try {
            body = JSON.parse(message.body);
          } catch {
            /* 그대로 */
          }
          onPayloadRef.current('chat', body);
        });
      },
      onStompError: (frame) => {
        console.warn('[STOMP]', frame.headers?.message ?? frame.body);
      },
      onWebSocketError: () => {
        console.warn('[STOMP] websocket error');
      },
    });

    client.activate();

    return () => {
      void client.deactivate();
    };
  }, [roomId, enabled, token]);
}
