import { createConnection, type Socket } from "node:net";

const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_RESPONSE_VALUE = 0;

function encode(id: number, type: number, body: string) {
  const payload = Buffer.from(body, "utf8");
  const length = 4 + 4 + payload.length + 2;
  const buf = Buffer.alloc(4 + length);
  buf.writeInt32LE(length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  payload.copy(buf, 12);
  return buf;
}

function readPackets(buffer: Buffer) {
  const packets: Array<{ id: number; type: number; body: string }> = [];
  let offset = 0;
  while (offset + 4 <= buffer.length) {
    const length = buffer.readInt32LE(offset);
    if (offset + 4 + length > buffer.length) break;
    const id = buffer.readInt32LE(offset + 4);
    const type = buffer.readInt32LE(offset + 8);
    const body = buffer
      .subarray(offset + 12, offset + 4 + length - 2)
      .toString("utf8");
    packets.push({ id, type, body });
    offset += 4 + length;
  }
  return { packets, rest: buffer.subarray(offset) };
}

export function rconCommand(
  host: string,
  port: number,
  password: string,
  command: string,
  timeoutMs = 4000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket: Socket = createConnection({ host, port });
    let buf = Buffer.alloc(0);
    let authed = false;
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("RCON timed out"));
    }, timeoutMs);

    const finish = (err?: Error, result?: string) => {
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve(result ?? "");
    };

    socket.on("error", (err) => finish(err));
    socket.on("connect", () => socket.write(encode(1, SERVERDATA_AUTH, password)));
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const { packets, rest } = readPackets(buf);
      buf = rest;
      for (const packet of packets) {
        if (!authed) {
          if (packet.id === -1) {
            finish(new Error("RCON auth failed"));
            return;
          }
          if (packet.type === SERVERDATA_AUTH_RESPONSE || packet.id === 1) {
            authed = true;
            socket.write(encode(2, SERVERDATA_EXECCOMMAND, command));
          }
          continue;
        }
        if (packet.id === 2 && packet.type === SERVERDATA_RESPONSE_VALUE) {
          finish(undefined, packet.body);
        }
      }
    });
  });
}

export function parseListPlayers(text: string) {
  const match = text.match(/There are \d+ of a max(?: of)? \d+ players online:\s*(.*)$/i);
  if (match) {
    return match[1]
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  }
  const names = text
    .split(/[\n,]/)
    .map((name) => name.replace(/^[\s\d/.-]+/, "").trim())
    .filter((name) => name && !name.includes(" "));
  return names;
}
