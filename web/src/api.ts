import type {
  BackupInfo,
  HostPayload,
  HostSnapshot,
  InstanceConfig,
  JavaInfo,
  ModInfo,
  PackVersion,
  RuntimeState
} from "./types";

const TOKEN_KEY = "th_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const err = new Error((data as { error?: string }).error || "Sign in required.");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
  return data as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ ok: boolean; token: string; username: string }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    }),
  logout: () => request("/api/logout", { method: "POST" }),
  me: () => request<{ username: string }>("/api/me"),
  host: () => request<HostPayload>("/api/host"),
  packs: () => request<{ versions: PackVersion[] }>("/api/packs/tekkit-2"),
  instances: () =>
    request<{
      instances: InstanceConfig[];
      states: Record<string, RuntimeState>;
      ports: { port: number; rconPort: number; queryPort: number };
    }>("/api/instances"),
  instance: (id: string) =>
    request<{ instance: InstanceConfig; state: RuntimeState; logs: string[] }>(
      `/api/instances/${id}`
    ),
  quickStart: (body: Record<string, unknown> = {}) =>
    request<{ instance: InstanceConfig; state: RuntimeState }>("/api/quick-start", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  create: (body: Record<string, unknown>) =>
    request<{ instance: InstanceConfig; state: RuntimeState }>("/api/instances", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  patch: (id: string, body: Partial<InstanceConfig>) =>
    request<InstanceConfig>(`/api/instances/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  remove: (id: string) => request(`/api/instances/${id}`, { method: "DELETE" }),
  start: (id: string) => request<RuntimeState>(`/api/instances/${id}/start`, { method: "POST" }),
  stop: (id: string) => request<RuntimeState>(`/api/instances/${id}/stop`, { method: "POST" }),
  restart: (id: string) =>
    request<RuntimeState>(`/api/instances/${id}/restart`, { method: "POST" }),
  command: (id: string, command: string) =>
    request(`/api/instances/${id}/command`, {
      method: "POST",
      body: JSON.stringify({ command })
    }),
  rcon: (id: string, command: string) =>
    request<{ result: string }>(`/api/instances/${id}/rcon`, {
      method: "POST",
      body: JSON.stringify({ command })
    }),
  mods: (id: string) => request<ModInfo[]>(`/api/instances/${id}/mods`),
  toggleMod: (id: string, file: string, enabled: boolean) =>
    request<ModInfo[]>(`/api/instances/${id}/mods/toggle`, {
      method: "POST",
      body: JSON.stringify({ file, enabled })
    }),
  deleteMod: (id: string, file: string) =>
    request<ModInfo[]>(`/api/instances/${id}/mods?file=${encodeURIComponent(file)}`, {
      method: "DELETE"
    }),
  uploadMod: (id: string, filename: string, data: string) =>
    request<ModInfo[]>(`/api/instances/${id}/mods/upload`, {
      method: "POST",
      body: JSON.stringify({ filename, data })
    }),
  backups: (id: string) => request<BackupInfo[]>(`/api/instances/${id}/backups`),
  createBackup: (id: string, kind: "world" | "full") =>
    request<BackupInfo>(`/api/instances/${id}/backups`, {
      method: "POST",
      body: JSON.stringify({ kind })
    }),
  restoreBackup: (id: string, file: string) =>
    request(`/api/instances/${id}/backups/restore`, {
      method: "POST",
      body: JSON.stringify({ file })
    }),
  deleteBackup: (id: string, file: string) =>
    request(`/api/instances/${id}/backups?file=${encodeURIComponent(file)}`, {
      method: "DELETE"
    }),
  backupUrl: (id: string, file: string) =>
    `/api/instances/${id}/backups/download?file=${encodeURIComponent(file)}&token=${encodeURIComponent(getToken())}`,
  detectJava: () => request<JavaInfo>("/api/java/detect", { method: "POST" }),
  installJava: () => request<JavaInfo>("/api/java/install", { method: "POST" })
};

export function connectBus(onMessage: (data: {
  type: string;
  payload: Record<string, unknown>;
}) => void) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  let socket: WebSocket;
  let closed = false;
  const open = () => {
    const token = encodeURIComponent(getToken());
    socket = new WebSocket(`${proto}://${location.host}/ws?token=${token}`);
    socket.onmessage = (event) => {
      onMessage(JSON.parse(event.data as string));
    };
    socket.onclose = (event) => {
      if (event.code === 4401) return;
      if (!closed) setTimeout(open, 1500);
    };
  };
  open();
  return {
    close() {
      closed = true;
      socket?.close();
    }
  };
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function usedMem(host: HostSnapshot) {
  return host.totalMemMb - host.freeMemMb;
}
