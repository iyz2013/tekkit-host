import { WebSocketServer, type WebSocket } from "ws";
import type { WsOutgoing } from "./types.ts";

const sockets = new Set<WebSocket>();

export function attachBus(wss: WebSocketServer) {
  wss.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
}

export function broadcast(message: WsOutgoing) {
  const raw = JSON.stringify(message);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) socket.send(raw);
  }
}
