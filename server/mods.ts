import { existsSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { instanceDir } from "./paths.ts";
import type { ModInfo } from "./types.ts";

function modsPath(id: string) {
  return join(instanceDir(id), "mods");
}

export function listMods(id: string): ModInfo[] {
  const dir = modsPath(id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => {
      const lower = file.toLowerCase();
      return lower.endsWith(".jar") || lower.endsWith(".jar.disabled");
    })
    .map((file) => {
      const stat = statSync(join(dir, file));
      return {
        file,
        enabled: !file.toLowerCase().endsWith(".disabled"),
        size: stat.size,
        mtime: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

export async function setModEnabled(id: string, file: string, enabled: boolean) {
  const dir = modsPath(id);
  const current = join(dir, file);
  if (!existsSync(current)) throw new Error("Mod not found");
  const isDisabled = file.toLowerCase().endsWith(".disabled");
  if (enabled && isDisabled) {
    renameSync(current, join(dir, file.replace(/\.disabled$/i, "")));
  } else if (!enabled && !isDisabled) {
    renameSync(current, join(dir, `${file}.disabled`));
  }
  return listMods(id);
}

export function deleteMod(id: string, file: string) {
  const target = join(modsPath(id), file);
  if (!existsSync(target)) throw new Error("Mod not found");
  unlinkSync(target);
  return listMods(id);
}

export async function saveUploadedMod(id: string, filename: string, buffer: Buffer) {
  const dir = modsPath(id);
  await mkdir(dir, { recursive: true });
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (extname(safe).toLowerCase() !== ".jar") {
    throw new Error("Only .jar files can be added to mods");
  }
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(dir, safe), buffer);
  return listMods(id);
}
