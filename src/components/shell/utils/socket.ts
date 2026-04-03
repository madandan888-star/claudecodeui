import { IS_PLATFORM } from '../../../constants/config';
import { getToken as getInMemoryToken } from '../../../utils/tokenStore';
import type { ShellIncomingMessage, ShellOutgoingMessage } from '../types/types';

export function getShellWebSocketUrl(): string | null {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = getInMemoryToken() || localStorage.getItem('auth-token');

  if (!token && !IS_PLATFORM) {
    console.error('No authentication token found for Shell WebSocket connection');
    return null;
  }

  const params = new URLSearchParams();
  if (token) {
    params.set('token', token);
  }

  const query = params.toString();
  return `${protocol}//${window.location.host}/shell${query ? `?${query}` : ''}`;
}

export function parseShellMessage(payload: string): ShellIncomingMessage | null {
  try {
    return JSON.parse(payload) as ShellIncomingMessage;
  } catch {
    return null;
  }
}

export function sendSocketMessage(ws: WebSocket | null, message: ShellOutgoingMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}
