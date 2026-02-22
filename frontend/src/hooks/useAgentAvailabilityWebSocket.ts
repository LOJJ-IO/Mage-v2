'use client';

import { useEffect, useRef } from 'react';
import { getAgentAvailabilityWsUrl } from '@/lib/api';
import { useMageStore } from '@/store/mageStore';

const MIN_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;
const BACKOFF_MULTIPLIER = 2;

/**
 * Subscribes to agent availability via WebSocket. Updates the store on each message.
 * Reconnects with backoff on close/error; cleans up on unmount.
 */
export function useAgentAvailabilityWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(MIN_RECONNECT_MS);

  useEffect(() => {
    const setContext = useMageStore.getState().setContext;

    function connect() {
      const url = getAgentAvailabilityWsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            human_agent_available?: boolean;
            ai_agent_available?: boolean;
          };
          setContext({
            humanAgentAvailable: data.human_agent_available ?? false,
            aiAgentAvailable: data.ai_agent_available ?? true,
          });
          reconnectDelayRef.current = MIN_RECONNECT_MS;
        } catch {
          // ignore invalid JSON
        }
      };

      ws.onclose = scheduleReconnect;
      ws.onerror = () => {
        ws.close();
      };
    }

    function scheduleReconnect() {
      wsRef.current = null;
      if (reconnectTimeoutRef.current != null) return;
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connect();
        reconnectDelayRef.current = Math.min(
          reconnectDelayRef.current * BACKOFF_MULTIPLIER,
          MAX_RECONNECT_MS
        );
      }, reconnectDelayRef.current);
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current != null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current != null) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);
}
