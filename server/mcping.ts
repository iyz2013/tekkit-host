import { createConnection } from "node:net";

function varInt(value: number) {
  const bytes: number[] = [];
  let n = value;
  do {
    let temp = n & 0x7f;
    n >>>= 7;
    if (n !== 0) temp |= 0x80;
    bytes.push(temp);
  } while (n !== 0);
  return Buffer.from(bytes);
}

function packet(id: number, data: Buffer) {
  const inner = Buffer.concat([varInt(id), data]);
  return Buffer.concat([varInt(inner.length), inner]);
}

function string(value: string) {
  const buf = Buffer.from(value, "utf8");
  return Buffer.concat([varInt(buf.length), buf]);
}

function u16(value: number) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(value);
  return buf;
}

function readVarInt(buf: Buffer, offset: number) {
  let num = 0;
  let bytes = 0;
  while (true) {
    const byte = buf[offset + bytes];
    num |= (byte & 0x7f) << (7 * bytes);
    bytes += 1;
    if ((byte & 0x80) === 0) break;
    if (bytes > 5) throw new Error("varint too long");
  }
  return { value: num, size: bytes };
}

export interface PingResult {
  version: string;
  motd: string;
  online: number;
  max: number;
  sample: string[];
}

export function pingServer(host: string, port: number, timeoutMs = 2500): Promise<PingResult> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    let buf = Buffer.alloc(0);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("ping timed out"));
    }, timeoutMs);

    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    socket.on("connect", () => {
      const handshake = packet(
        0x00,
        Buffer.concat([varInt(340), string(host), u16(port), varInt(1)])
      );
      socket.write(Buffer.concat([handshake, packet(0x00, Buffer.alloc(0))]));
    });

    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        const length = readVarInt(buf, 0);
        if (buf.length < length.size + length.value) return;
        let offset = length.size;
        const id = readVarInt(buf, offset);
        offset += id.size;
        const jsonLen = readVarInt(buf, offset);
        offset += jsonLen.size;
        const json = buf.subarray(offset, offset + jsonLen.value).toString("utf8");
        const data = JSON.parse(json) as {
          version?: { name?: string };
          description?: string | { text?: string };
          players?: { online?: number; max?: number; sample?: Array<{ name: string }> };
        };
        const motd =
          typeof data.description === "string"
            ? data.description
            : data.description?.text ?? "";
        clearTimeout(timer);
        socket.destroy();
        resolve({
          version: data.version?.name ?? "",
          motd,
          online: data.players?.online ?? 0,
          max: data.players?.max ?? 0,
          sample: (data.players?.sample ?? []).map((item) => item.name)
        });
      } catch {
        /* wait for more bytes */
      }
    });
  });
}
