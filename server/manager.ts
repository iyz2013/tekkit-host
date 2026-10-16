import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
  type WriteStream
} from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { createWriteStream as createDownloadStream } from "node:fs";
import { join } from "node:path";
import { platform } from "node:os";
import { pipeline } from "node:stream/promises";
import { Extract } from "unzipper";
import { createReadStream } from "node:fs";
import pidusage from "pidusage";
import { broadcast } from "./bus.ts";
import { createBackup } from "./backups.ts";
import { ensureJava8, javaHomeFromBin, prepareMacPath } from "./java.ts";
import { pingServer } from "./mcping.ts";
import { DOWNLOADS, instanceDir } from "./paths.ts";
import { serverZipUrl } from "./packs.ts";
import { applyServerProperties, writeEula } from "./properties.ts";
import { parseListPlayers, rconCommand } from "./rcon.ts";
import { getInstance, upsertInstance } from "./store.ts";
import type { InstanceConfig, PlayerInfo, RuntimeState } from "./types.ts";

const LOG_LIMIT = 2500;

interface LiveInstance {
  proc: ChildProcessWithoutNullStreams | null;
  logFile: WriteStream | null;
  logs: string[];
  state: RuntimeState;
  backupTimer: NodeJS.Timeout | null;
  metricTimer: NodeJS.Timeout | null;
}

const live = new Map<string, LiveInstance>();

function emptyState(): RuntimeState {
  return {
    status: "stopped",
    pid: null,
    startedAt: null,
    cpuPercent: 0,
    memoryMb: 0,
    players: [],
    lastError: null,
    installPercent: 0,
    installMessage: ""
  };
}

function ensureLive(id: string) {
  const existing = live.get(id);
  if (existing) return existing;
  const created: LiveInstance = {
    proc: null,
    logFile: null,
    logs: [],
    state: emptyState(),
    backupTimer: null,
    metricTimer: null
  };
  live.set(id, created);
  return created;
}

function emitStatus(id: string) {
  const item = ensureLive(id);
  broadcast({ type: "status", payload: { instanceId: id, state: item.state } });
}

function appendLog(id: string, line: string) {
  const item = ensureLive(id);
  const cleaned = line.replace(/\r/g, "").trimEnd();
  if (!cleaned) return;
  item.logs.push(cleaned);
  if (item.logs.length > LOG_LIMIT) item.logs.splice(0, item.logs.length - LOG_LIMIT);
  item.logFile?.write(`${cleaned}\n`);
  broadcast({ type: "log", payload: { instanceId: id, line: cleaned } });
}

function findForgeJar(dir: string) {
  const files = existsSync(dir) ? readdirSync(dir) : [];
  const forge =
    files.find((file) => /^forge-1\.12\.2-.*\.jar$/i.test(file)) ??
    files.find((file) => /^forge\.jar$/i.test(file)) ??
    files.find((file) => /forge.*\.jar$/i.test(file) && !file.includes("installer"));
  return forge ?? null;
}

function flattenInstall(dir: string) {
  if (findForgeJar(dir)) return;
  if (!existsSync(dir)) return;
  const nested = readdirSync(dir)
    .map((name) => join(dir, name))
    .find((full) => statSync(full).isDirectory() && findForgeJar(full));
  if (!nested) return;
  for (const name of readdirSync(nested)) {
    const dest = join(dir, name);
    if (existsSync(dest)) continue;
    renameSync(join(nested, name), dest);
  }
}

export function getState(id: string) {
  return ensureLive(id).state;
}

export function getLogs(id: string) {
  return ensureLive(id).logs.slice(-800);
}

export function listStates() {
  const out: Record<string, RuntimeState> = {};
  for (const [id, item] of live) out[id] = item.state;
  return out;
}

export async function installInstance(
  instance: InstanceConfig,
  onProgress?: (percent: number, message: string) => void
) {
  const item = ensureLive(instance.id);
  item.state.status = "installing";
  item.state.installPercent = 1;
  item.state.installMessage = "Preparing folder";
  emitStatus(instance.id);

  const dir = instanceDir(instance.id);
  await mkdir(dir, { recursive: true });
  const url = serverZipUrl(instance.packVersion);
  const zipPath = join(DOWNLOADS, `Tekkit-2_Server_v${instance.packVersion}.zip`);
  await mkdir(DOWNLOADS, { recursive: true });

  const report = (percent: number, message: string) => {
    item.state.installPercent = percent;
    item.state.installMessage = message;
    onProgress?.(percent, message);
    broadcast({
      type: "install",
      payload: { instanceId: instance.id, percent, message }
    });
    emitStatus(instance.id);
  };

  report(5, "Downloading official Tekkit 2 server zip");
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    item.state.status = "stopped";
    item.state.lastError = `Download failed (${response.status})`;
    emitStatus(instance.id);
    throw new Error(item.state.lastError);
  }

  const total = Number(response.headers.get("content-length") || 0);
  let read = 0;
  const reader = response.body.getReader();
  const out = createDownloadStream(zipPath);
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    read += value.byteLength;
    out.write(value);
    if (total) {
      report(5 + Math.round((read / total) * 55), "Downloading Tekkit 2 server");
    }
  }
  await new Promise<void>((resolve, reject) => {
    out.end(() => resolve());
    out.on("error", reject);
  });

  report(65, "Extracting server files");
  await pipeline(createReadStream(zipPath), Extract({ path: dir }));
  flattenInstall(dir);
  await prepareMacPath(dir);

  writeEula(dir);
  applyServerProperties(dir, instance);
  const jar = findForgeJar(dir);
  if (!jar) {
    item.state.status = "stopped";
    item.state.lastError = "Forge jar missing after extract";
    emitStatus(instance.id);
    throw new Error(item.state.lastError);
  }

  instance.installed = true;
  upsertInstance(instance);
  item.state.status = "stopped";
  item.state.installPercent = 100;
  item.state.installMessage = "Installed";
  item.state.lastError = null;
  report(100, "Tekkit 2 installed");
  emitStatus(instance.id);
  return instance;
}

function parsePlayersFromLogs(lines: string[]) {
  const online = new Map<string, PlayerInfo>();
  for (const line of lines) {
    const joined = line.match(/:\s*([A-Za-z0-9_]{3,16}) joined the game/);
    const left = line.match(/:\s*([A-Za-z0-9_]{3,16}) left the game/);
    if (joined) {
      online.set(joined[1], { name: joined[1], joinedAt: new Date().toISOString() });
    }
    if (left) online.delete(left[1]);
  }
  return [...online.values()];
}

async function refreshPlayers(instance: InstanceConfig, item: LiveInstance) {
  try {
    const text = await rconCommand(
      "127.0.0.1",
      instance.rconPort,
      instance.rconPassword,
      "list"
    );
    const names = parseListPlayers(text);
    if (names.length || /players online/i.test(text)) {
      item.state.players = names.map((name) => ({ name }));
      return;
    }
  } catch {
    /* rcon not ready */
  }
  try {
    const ping = await pingServer("127.0.0.1", instance.port);
    item.state.players = ping.sample.map((name) => ({ name }));
  } catch {
    item.state.players = parsePlayersFromLogs(item.logs);
  }
}

function clearTimers(item: LiveInstance) {
  if (item.backupTimer) clearInterval(item.backupTimer);
  if (item.metricTimer) clearInterval(item.metricTimer);
  item.backupTimer = null;
  item.metricTimer = null;
}

export async function startInstance(id: string) {
  const instance = getInstance(id);
  if (!instance) throw new Error("Unknown server");
  if (!instance.installed) throw new Error("Server is not installed yet");
  const item = ensureLive(id);
  if (item.proc) throw new Error("Server is already running");

  const java = await ensureJava8((percent, message) => {
    item.state.installPercent = percent;
    item.state.installMessage = message;
    broadcast({ type: "install", payload: { instanceId: id, percent, message } });
    emitStatus(id);
  });
  if (!java.found || !java.path || !java.isJava8) {
    throw new Error("Java 8 is required. The dashboard could not install it automatically.");
  }

  const dir = instanceDir(id);
  flattenInstall(dir);
  const jar = findForgeJar(dir);
  if (!jar) throw new Error("Forge jar not found in the instance folder");
  writeEula(dir);
  applyServerProperties(dir, instance);
  await prepareMacPath(dir);
  await prepareMacPath(java.path);

  const home = javaHomeFromBin(java.path);
  const pathSep = platform() === "win32" ? ";" : ":";
  const args = [
    `-Xms${instance.memoryMinMb}M`,
    `-Xmx${instance.memoryMb}M`,
    "-XX:+UseG1GC",
    "-XX:+UnlockExperimentalVMOptions",
    "-XX:G1NewSizePercent=20",
    "-XX:G1ReservePercent=20",
    "-XX:MaxGCPauseMillis=50",
    "-XX:G1HeapRegionSize=32M",
    "-Djava.awt.headless=true",
    "-Dlog4j2.formatMsgNoLookups=true",
    "-Dfile.encoding=UTF-8",
    "-Dfml.queryResult=confirm",
    ...instance.extraJavaArgs.split(" ").filter(Boolean),
    "-jar",
    jar,
    "nogui"
  ];

  const logsDir = join(dir, "logs");
  await mkdir(logsDir, { recursive: true });
  item.logFile = createWriteStream(join(logsDir, "tekkit-host.log"), { flags: "a" });
  item.state = {
    ...emptyState(),
    status: "starting",
    startedAt: new Date().toISOString()
  };
  emitStatus(id);
  appendLog(id, `[host] Starting with ${java.path} (${java.version})`);
  appendLog(id, `[host] java ${args.join(" ")}`);

  const proc = spawn(java.path, args, {
    cwd: dir,
    detached: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      JAVA_HOME: home,
      PATH: `${join(home, "bin")}${pathSep}${process.env.PATH ?? ""}`
    }
  });
  item.proc = proc;
  item.state.pid = proc.pid ?? null;

  const handleChunk = (chunk: Buffer) => {
    for (const line of chunk.toString("utf8").split(/\r?\n/)) {
      if (!line) continue;
      appendLog(id, line);
      if (/Done \(/.test(line) || /For help, type "help"/.test(line)) {
        item.state.status = "running";
        emitStatus(id);
      }
    }
  };
  proc.stdout.on("data", handleChunk);
  proc.stderr.on("data", handleChunk);

  proc.on("exit", (code, signal) => {
    appendLog(id, `[host] Process exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    item.proc = null;
    item.logFile?.end();
    item.logFile = null;
    clearTimers(item);
    const crashing = item.state.status !== "stopping" && code !== 0;
    item.state.status = crashing ? "crashed" : "stopped";
    item.state.pid = null;
    item.state.cpuPercent = 0;
    item.state.memoryMb = 0;
    item.state.players = [];
    if (crashing) item.state.lastError = `Server exited with code ${code ?? signal}`;
    emitStatus(id);
    if (crashing && instance.autoRestart) {
      appendLog(id, "[host] Auto-restart in 5 seconds");
      setTimeout(() => {
        void startInstance(id).catch((err) =>
          appendLog(id, `[host] Auto-restart failed: ${(err as Error).message}`)
        );
      }, 5000);
    }
  });

  item.metricTimer = setInterval(() => {
    void (async () => {
      if (!item.proc?.pid) return;
      try {
        const usage = await pidusage(item.proc.pid);
        item.state.cpuPercent = Number(usage.cpu.toFixed(1));
        item.state.memoryMb = Math.round(usage.memory / 1024 / 1024);
      } catch {
        /* process gone */
      }
      if (item.state.status === "running") {
        await refreshPlayers(instance, item);
      }
      emitStatus(id);
    })();
  }, 3000);

  if (instance.autoBackupMinutes > 0) {
    item.backupTimer = setInterval(() => {
      if (item.state.status !== "running") return;
      appendLog(id, "[host] Automatic world backup starting");
      void sendCommand(id, "save-all").finally(() => {
        setTimeout(() => {
          void createBackup(id, "world")
            .then((backup) => appendLog(id, `[host] Backup saved ${backup.file}`))
            .catch((err) => appendLog(id, `[host] Backup failed: ${(err as Error).message}`));
        }, 2000);
      });
    }, instance.autoBackupMinutes * 60_000);
  }

  return item.state;
}

export async function stopInstance(id: string) {
  const item = ensureLive(id);
  if (!item.proc) {
    item.state.status = "stopped";
    emitStatus(id);
    return item.state;
  }
  item.state.status = "stopping";
  emitStatus(id);
  try {
    item.proc.stdin.write("stop\n");
  } catch {
    item.proc.kill();
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      item.proc?.kill();
      resolve();
    }, 20_000);
    item.proc?.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  return item.state;
}

export async function restartInstance(id: string) {
  await stopInstance(id);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return startInstance(id);
}

export function sendCommand(id: string, command: string) {
  const item = ensureLive(id);
  if (!item.proc) return Promise.reject(new Error("Server is not running"));
  const line = command.replace(/^\//, "");
  appendLog(id, `> ${line}`);
  item.proc.stdin.write(`${line}\n`);
  return Promise.resolve();
}

export async function runRcon(id: string, command: string) {
  const instance = getInstance(id);
  if (!instance) throw new Error("Unknown server");
  appendLog(id, `> ${command}`);
  const result = await rconCommand(
    "127.0.0.1",
    instance.rconPort,
    instance.rconPassword,
    command
  );
  if (result) appendLog(id, result);
  return result;
}

export async function destroyInstance(id: string) {
  await stopInstance(id);
  live.delete(id);
  await rm(instanceDir(id), { recursive: true, force: true });
}

export function writeHelperFiles(instance: InstanceConfig) {
  const dir = instanceDir(instance.id);
  writeFileSync(
    join(dir, "README-HOST.txt"),
    [
      `Tekkit Host instance: ${instance.name}`,
      `Pack: Tekkit 2 ${instance.packVersion} (Minecraft ${instance.minecraft})`,
      `Port: ${instance.port}`,
      "Do not start this folder by double-clicking LaunchServer scripts.",
      "Use the Tekkit Host dashboard so memory, RCON, logs, and backups stay in sync.",
      ""
    ].join("\n")
  );
}
