import { createWriteStream, existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { createReadStream } from "node:fs";
import archiver from "archiver";
import { Extract } from "unzipper";
import { pipeline } from "node:stream/promises";
import { BACKUPS, instanceDir } from "./paths.ts";
import type { BackupInfo } from "./types.ts";

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function instanceBackupDir(id: string) {
  return join(BACKUPS, id);
}

function worldEntries(dir: string) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) {
      return [
        "ops.json",
        "whitelist.json",
        "banned-players.json",
        "banned-ips.json",
        "server.properties",
        "eula.txt",
        "usercache.json"
      ].includes(name);
    }
    return name === "world" || name.startsWith("world") || name.startsWith("DIM");
  });
}

export function listBackups(id?: string): BackupInfo[] {
  const roots = id
    ? [instanceBackupDir(id)]
    : existsSync(BACKUPS)
      ? readdirSync(BACKUPS).map((name) => join(BACKUPS, name))
      : [];
  const items: BackupInfo[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const instanceId = basename(root);
    for (const file of readdirSync(root)) {
      if (!file.endsWith(".zip")) continue;
      const full = join(root, file);
      const stat = statSync(full);
      items.push({
        id: `${instanceId}/${file}`,
        instanceId,
        kind: file.includes("-full-") ? "full" : "world",
        file,
        size: stat.size,
        createdAt: stat.mtime.toISOString()
      });
    }
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createBackup(id: string, kind: "world" | "full") {
  const dir = instanceDir(id);
  if (!existsSync(dir)) throw new Error("Instance folder missing");
  const destDir = instanceBackupDir(id);
  await mkdir(destDir, { recursive: true });
  const file = `${id}-${kind}-${stamp()}.zip`;
  const dest = join(destDir, file);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(dest);
    const archive = archiver("zip", { zlib: { level: 5 } });
    output.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(output);
    if (kind === "full") {
      archive.directory(dir, false);
    } else {
      for (const name of worldEntries(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) archive.directory(full, name);
        else archive.file(full, { name });
      }
    }
    void archive.finalize();
  });

  return listBackups(id).find((item) => item.file === file)!;
}

export async function restoreBackup(id: string, file: string) {
  const zip = join(instanceBackupDir(id), file);
  if (!existsSync(zip)) throw new Error("Backup not found");
  const dir = instanceDir(id);
  if (file.includes("-full-")) {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
  } else {
    for (const name of worldEntries(dir)) {
      await rm(join(dir, name), { recursive: true, force: true });
    }
  }
  await pipeline(createReadStream(zip), Extract({ path: dir }));
}

export function deleteBackup(id: string, file: string) {
  const zip = join(instanceBackupDir(id), file);
  if (!existsSync(zip)) throw new Error("Backup not found");
  unlinkSync(zip);
}

export function backupPath(id: string, file: string) {
  return join(instanceBackupDir(id), file);
}
