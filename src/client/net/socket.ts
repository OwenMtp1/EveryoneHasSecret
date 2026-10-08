import { io, type Socket } from 'socket.io-client';
import type { AckResult, ClientToServerEvents, ServerToClientEvents } from '@shared/protocol';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

export function connectSocket(token: string): GameSocket {
  socket?.disconnect();
  socket = io({ auth: { token }, transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
  return socket;
}

export function getSocket(): GameSocket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

type EventsWithAck = {
  [K in keyof ClientToServerEvents]: Parameters<ClientToServerEvents[K]> extends [...infer _A, (r: AckResult<infer _R>) => void] ? K : never;
}[keyof ClientToServerEvents];

type ArgsOf<K extends EventsWithAck> = Parameters<ClientToServerEvents[K]> extends [...infer A, (r: AckResult<infer _R>) => void] ? A : never;
type ResultOf<K extends EventsWithAck> = Parameters<ClientToServerEvents[K]> extends [...infer _A, (r: AckResult<infer R>) => void] ? R : never;

/** Appel requête/réponse : le serveur valide et répond (ou lève une erreur lisible). */
export function call<K extends EventsWithAck>(event: K, ...args: ArgsOf<K>): Promise<ResultOf<K>> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Connexion au serveur perdue…'));
    const timer = setTimeout(() => reject(new Error('Le serveur ne répond pas.')), 8000);
    (socket.emit as (...a: unknown[]) => void)(event, ...args, (res: AckResult<ResultOf<K>>) => {
      clearTimeout(timer);
      if (res.ok) resolve(res.data);
      else reject(new Error(res.error));
    });
  });
}
