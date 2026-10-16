import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "..");
export const DATA = join(ROOT, "data");
export const INSTANCES = join(DATA, "instances");
export const BACKUPS = join(DATA, "backups");
export const RUNTIME = join(DATA, "runtime");
export const DOWNLOADS = join(DATA, "downloads");
export const CONFIG_FILE = join(DATA, "config.json");
export const DIST = join(ROOT, "dist");

export function ensureDirs() {
  for (const dir of [DATA, INSTANCES, BACKUPS, RUNTIME, DOWNLOADS]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function instanceDir(id: string) {
  return join(INSTANCES, id);
}

export function instanceExists(id: string) {
  return existsSync(instanceDir(id));
}
