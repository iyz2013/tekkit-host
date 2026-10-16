export type InstanceStatus =
  | "stopped"
  | "installing"
  | "starting"
  | "running"
  | "stopping"
  | "crashed";

export interface InstanceConfig {
  id: string;
  name: string;
  pack: "tekkit-2";
  packVersion: string;
  minecraft: string;
  port: number;
  rconPort: number;
  queryPort: number;
  rconPassword: string;
  memoryMb: number;
  memoryMinMb: number;
  extraJavaArgs: string;
  motd: string;
  maxPlayers: number;
  difficulty: "peaceful" | "easy" | "normal" | "hard";
  gamemode: "survival" | "creative" | "adventure" | "spectator";
  pvp: boolean;
  whitelist: boolean;
  onlineMode: boolean;
  viewDistance: number;
  autoRestart: boolean;
  autoBackupMinutes: number;
  createdAt: string;
  installed: boolean;
}

export interface PlayerInfo {
  name: string;
  uuid?: string;
  joinedAt?: string;
}

export interface RuntimeState {
  status: InstanceStatus;
  pid: number | null;
  startedAt: string | null;
  cpuPercent: number;
  memoryMb: number;
  players: PlayerInfo[];
  lastError: string | null;
  installPercent: number;
  installMessage: string;
}

export interface JavaInfo {
  found: boolean;
  path: string | null;
  version: string | null;
  isJava8: boolean;
  vendor: string | null;
  bundled: boolean;
}

export interface HostSnapshot {
  platform: string;
  arch: string;
  hostname: string;
  cpuModel: string;
  cpuCount: number;
  load: number[];
  totalMemMb: number;
  freeMemMb: number;
  diskTotalGb: number;
  diskFreeGb: number;
  java: JavaInfo;
  publicIp: string | null;
  lanIps: string[];
}

export interface PackVersion {
  id: string;
  recommended: boolean;
  minecraft: string;
  url: string;
}

export interface ModInfo {
  file: string;
  enabled: boolean;
  size: number;
  mtime: string;
}

export interface BackupInfo {
  id: string;
  instanceId: string;
  kind: "world" | "full";
  file: string;
  size: number;
  createdAt: string;
}

export interface HostPayload {
  host: HostSnapshot;
  pack: {
    id: string;
    name: string;
    minecraft: string;
    java: string;
    loader: string;
    whyJava8: string;
    whyMacZulu: string;
    memoryHintGb: number;
  };
  states: Record<string, RuntimeState>;
}
