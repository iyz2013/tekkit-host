import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { CONFIG_FILE, ensureDirs } from "./paths.ts";
import type { AppConfig, InstanceConfig } from "./types.ts";

function randomPassword() {
  return randomBytes(9).toString("base64url");
}

function defaults(): AppConfig {
  return {
    bind: "0.0.0.0",
    dashboardPort: 3840,
    javaPath: null,
    username: "admin",
    password: "admin",
    instances: []
  };
}

let cache: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cache) return cache;
  ensureDirs();
  if (!existsSync(CONFIG_FILE)) {
    cache = defaults();
    saveConfig(cache);
    return cache;
  }
  const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as Partial<AppConfig>;
  cache = {
    ...defaults(),
    ...parsed,
    username: parsed.username || "admin",
    password: parsed.password || "admin",
    instances: parsed.instances ?? []
  };
  if (!parsed.username || !parsed.password) saveConfig(cache);
  return cache;
}

export function saveConfig(next: AppConfig) {
  ensureDirs();
  cache = next;
  writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
}

export function updateConfig(patch: Partial<AppConfig>) {
  const next = { ...loadConfig(), ...patch };
  saveConfig(next);
  return next;
}

export function getInstance(id: string) {
  return loadConfig().instances.find((item) => item.id === id) ?? null;
}

export function upsertInstance(instance: InstanceConfig) {
  const config = loadConfig();
  const index = config.instances.findIndex((item) => item.id === instance.id);
  if (index === -1) config.instances.push(instance);
  else config.instances[index] = instance;
  saveConfig(config);
  return instance;
}

export function removeInstance(id: string) {
  const config = loadConfig();
  config.instances = config.instances.filter((item) => item.id !== id);
  saveConfig(config);
}

export function nextPorts() {
  const used = new Set<number>();
  for (const instance of loadConfig().instances) {
    used.add(instance.port);
    used.add(instance.rconPort);
    used.add(instance.queryPort);
  }
  const pick = (start: number) => {
    let port = start;
    while (used.has(port)) port += 1;
    used.add(port);
    return port;
  };
  return {
    port: pick(25565),
    rconPort: pick(25575),
    queryPort: pick(25565)
  };
}

export function newRconPassword() {
  return randomPassword();
}
