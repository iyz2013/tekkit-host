import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import cors from "cors";
import express from "express";
import { WebSocketServer } from "ws";
import {
  clearCookie,
  login,
  logout,
  parseCookie,
  readToken,
  requireAuth,
  sessionCookie,
  validSession
} from "./auth.ts";
import { createBackup, deleteBackup, listBackups, restoreBackup, backupPath } from "./backups.ts";
import { attachBus, broadcast } from "./bus.ts";
import { downloadJava8, detectJava, ensureJava8 } from "./java.ts";
import {
  destroyInstance,
  getLogs,
  getState,
  installInstance,
  listStates,
  restartInstance,
  runRcon,
  sendCommand,
  startInstance,
  stopInstance,
  writeHelperFiles
} from "./manager.ts";
import { deleteMod, listMods, saveUploadedMod, setModEnabled } from "./mods.ts";
import { hostSnapshot } from "./monitor.ts";
import { listTekkitVersions, TEKKIT_NOTES } from "./packs.ts";
import { DIST, ensureDirs } from "./paths.ts";
import {
  getInstance,
  loadConfig,
  newRconPassword,
  nextPorts,
  removeInstance,
  updateConfig,
  upsertInstance
} from "./store.ts";
import type { InstanceConfig } from "./types.ts";

ensureDirs();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "32mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "tekkit-host" });
});

app.post("/api/login", (req, res) => {
  const body = req.body as { username?: string; password?: string };
  const token = login(String(body.username || ""), String(body.password || ""));
  if (!token) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }
  res.setHeader("Set-Cookie", sessionCookie(token));
  res.json({ ok: true, token, username: loadConfig().username });
});

app.post("/api/logout", (req, res) => {
  logout(readToken(req));
  res.setHeader("Set-Cookie", clearCookie());
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  if (!validSession(readToken(req))) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  res.json({ username: loadConfig().username });
});

app.use("/api", (req, res, next) => {
  if (req.path === "/health" || req.path === "/login" || req.path === "/logout" || req.path === "/me") {
    next();
    return;
  }
  requireAuth(req, res, next);
});

app.get("/api/host", async (_req, res) => {
  res.json({
    host: await hostSnapshot(),
    config: {
      bind: loadConfig().bind,
      dashboardPort: loadConfig().dashboardPort,
      javaPath: loadConfig().javaPath
    },
    pack: TEKKIT_NOTES,
    states: listStates()
  });
});

app.get("/api/packs/tekkit-2", async (_req, res) => {
  res.json({
    pack: TEKKIT_NOTES,
    versions: await listTekkitVersions()
  });
});

app.post("/api/java/detect", async (_req, res) => {
  res.json(await detectJava());
});

app.post("/api/java/install", async (_req, res) => {
  try {
    const java = await downloadJava8((percent, message) => {
      broadcast({
        type: "install",
        payload: { instanceId: "java8", percent, message }
      });
    });
    res.json(java);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.put("/api/settings", (req, res) => {
  const body = req.body as { javaPath?: string | null; dashboardPort?: number; bind?: string };
  res.json(updateConfig(body));
});

app.get("/api/instances", async (_req, res) => {
  res.json({
    instances: loadConfig().instances,
    states: listStates(),
    ports: nextPorts()
  });
});

function defaultInstance(partial: Partial<InstanceConfig> = {}): InstanceConfig {
  const ports = nextPorts();
  const name = (partial.name || "Tekkit Main").trim();
  const memoryMb = partial.memoryMb || 8192;
  return {
    id: slug(name),
    name,
    pack: "tekkit-2",
    packVersion: partial.packVersion || "1.2.6",
    minecraft: "1.12.2",
    port: partial.port || ports.port,
    rconPort: partial.rconPort || ports.rconPort,
    queryPort: partial.queryPort || partial.port || ports.port,
    rconPassword: partial.rconPassword || newRconPassword(),
    memoryMb,
    memoryMinMb: partial.memoryMinMb || Math.min(2048, memoryMb),
    extraJavaArgs: partial.extraJavaArgs || "",
    motd: partial.motd || `Tekkit 2 \\u00A76${name}`,
    maxPlayers: partial.maxPlayers || 20,
    difficulty: partial.difficulty || "normal",
    gamemode: partial.gamemode || "survival",
    pvp: partial.pvp ?? true,
    whitelist: partial.whitelist ?? false,
    onlineMode: partial.onlineMode ?? true,
    viewDistance: partial.viewDistance || 8,
    autoRestart: partial.autoRestart ?? true,
    autoBackupMinutes: partial.autoBackupMinutes ?? 0,
    createdAt: new Date().toISOString(),
    installed: false
  };
}

function reportInstall(instanceId: string, percent: number, message: string) {
  broadcast({ type: "install", payload: { instanceId, percent, message } });
}

app.post("/api/quick-start", async (req, res) => {
  try {
    const body = req.body as { memoryMb?: number };
    let instance = loadConfig().instances[0] ?? null;
    if (!instance) {
      instance = defaultInstance({
        name: "Tekkit Main",
        memoryMb: body.memoryMb || 8192
      });
      upsertInstance(instance);
      writeHelperFiles(instance);
    }

    reportInstall(instance.id, 1, "Preparing Java 8");
    await ensureJava8((percent, message) => reportInstall(instance.id, percent, message));

    const latest = getInstance(instance.id) ?? instance;
    if (!latest.installed) {
      instance = await installInstance(latest);
    } else {
      instance = latest;
    }

    const status = getState(instance.id).status;
    if (status !== "running" && status !== "starting") {
      await startInstance(instance.id);
    }

    res.json({
      instance: getInstance(instance.id),
      state: getState(instance.id)
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/instances", async (req, res) => {
  try {
    const body = req.body as Partial<InstanceConfig> & { eula?: boolean };
    if (!body.eula) {
      res.status(400).json({ error: "You must accept the Minecraft EULA to create a server." });
      return;
    }
    if (!body.name?.trim()) {
      res.status(400).json({ error: "Name is required." });
      return;
    }
    const instance = defaultInstance(body);
    if (getInstance(instance.id)) {
      res.status(409).json({ error: "A server with that name already exists." });
      return;
    }
    upsertInstance(instance);
    writeHelperFiles(instance);
    await ensureJava8((percent, message) => {
      broadcast({
        type: "install",
        payload: { instanceId: instance.id, percent, message }
      });
    });
    const installed = await installInstance(instance);
    res.json({ instance: installed, state: getState(instance.id) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/instances/:id", (req, res) => {
  const instance = getInstance(req.params.id);
  if (!instance) {
    res.status(404).json({ error: "Unknown server" });
    return;
  }
  res.json({
    instance,
    state: getState(instance.id),
    logs: getLogs(instance.id)
  });
});

app.patch("/api/instances/:id", (req, res) => {
  const instance = getInstance(req.params.id);
  if (!instance) {
    res.status(404).json({ error: "Unknown server" });
    return;
  }
  const next = { ...instance, ...(req.body as Partial<InstanceConfig>), id: instance.id };
  upsertInstance(next);
  res.json(next);
});

app.delete("/api/instances/:id", async (req, res) => {
  try {
    await destroyInstance(req.params.id);
    removeInstance(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/instances/:id/start", async (req, res) => {
  try {
    res.json(await startInstance(req.params.id));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/api/instances/:id/stop", async (req, res) => {
  try {
    res.json(await stopInstance(req.params.id));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/api/instances/:id/restart", async (req, res) => {
  try {
    res.json(await restartInstance(req.params.id));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/api/instances/:id/command", async (req, res) => {
  try {
    const command = String((req.body as { command?: string }).command || "");
    if (!command.trim()) {
      res.status(400).json({ error: "Command required" });
      return;
    }
    await sendCommand(req.params.id, command);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/api/instances/:id/rcon", async (req, res) => {
  try {
    const command = String((req.body as { command?: string }).command || "");
    const result = await runRcon(req.params.id, command);
    res.json({ result });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/api/instances/:id/mods", (req, res) => {
  res.json(listMods(req.params.id));
});

app.post("/api/instances/:id/mods/toggle", async (req, res) => {
  try {
    const body = req.body as { file: string; enabled: boolean };
    res.json(await setModEnabled(req.params.id, body.file, body.enabled));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.delete("/api/instances/:id/mods", (req, res) => {
  try {
    const file = String(req.query.file || "");
    res.json(deleteMod(req.params.id, file));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/api/instances/:id/mods/upload", async (req, res) => {
  try {
    const body = req.body as { filename: string; data: string };
    const buffer = Buffer.from(body.data, "base64");
    res.json(await saveUploadedMod(req.params.id, body.filename, buffer));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/api/instances/:id/backups", (req, res) => {
  res.json(listBackups(req.params.id));
});

app.post("/api/instances/:id/backups", async (req, res) => {
  try {
    const kind = (req.body as { kind?: "world" | "full" }).kind ?? "world";
    res.json(await createBackup(req.params.id, kind));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/api/instances/:id/backups/restore", async (req, res) => {
  try {
    if (getState(req.params.id).status !== "stopped") {
      res.status(400).json({ error: "Stop the server before restoring a backup." });
      return;
    }
    const file = String((req.body as { file?: string }).file || "");
    await restoreBackup(req.params.id, file);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.delete("/api/instances/:id/backups", (req, res) => {
  try {
    deleteBackup(req.params.id, String(req.query.file || ""));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/api/instances/:id/backups/download", (req, res) => {
  const file = String(req.query.file || "");
  const full = backupPath(req.params.id, file);
  if (!existsSync(full)) {
    res.status(404).json({ error: "Backup not found" });
    return;
  }
  res.download(full, file);
});

app.get("/api/instances/:id/logs", (req, res) => {
  res.json({ lines: getLogs(req.params.id) });
});

if (existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/ws")) return next();
    res.sendFile(join(DIST, "index.html"));
  });
}

const config = loadConfig();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
attachBus(wss);

wss.on("connection", (socket, req) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const token = url.searchParams.get("token") || parseCookie(req.headers.cookie).th_session || "";
  if (!validSession(token)) {
    socket.close(4401, "Sign in required");
    return;
  }
  socket.send(
    JSON.stringify({
      type: "hello",
      payload: { instanceIds: loadConfig().instances.map((item) => item.id) }
    })
  );
});

setInterval(() => {
  void hostSnapshot().then((host) => {
    broadcast({
      type: "metrics",
      payload: { host, instances: listStates() }
    });
  });
}, 4000);

server.listen(config.dashboardPort, config.bind, () => {
  const local =
    config.bind === "0.0.0.0" ? "127.0.0.1" : config.bind;
  console.log(`Tekkit Host dashboard: http://${local}:${config.dashboardPort}`);
  console.log("Create a Tekkit 2 server from the UI after Java 8 is detected.");
});

function slug(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return base || `tekkit-${Date.now().toString(36)}`;
}
