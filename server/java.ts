import { execFile } from "node:child_process";
import { chmodSync, createWriteStream, existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { arch, homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { Extract } from "unzipper";
import { loadConfig, updateConfig } from "./store.ts";
import { RUNTIME } from "./paths.ts";
import type { JavaInfo } from "./types.ts";

const execFileAsync = promisify(execFile);

export async function inspectJava(bin: string): Promise<JavaInfo> {
  try {
    const { stderr, stdout } = await execFileAsync(bin, ["-version"], {
      timeout: 8000
    });
    const text = `${stderr}\n${stdout}`;
    const version = text.match(/version "([^"]+)"/)?.[1] ?? null;
    const vendor =
      text.match(/^(?:OpenJDK|Java) Runtime Environment \(([^)]+)\)/m)?.[1] ??
      text.match(/HotSpot|OpenJDK|Zulu|Temurin|Adoptium/)?.[0] ??
      null;
    const isJava8 = Boolean(version && /^1\.8\./.test(version));
    return {
      found: true,
      path: bin,
      version,
      isJava8,
      vendor,
      bundled: bin.includes(RUNTIME)
    };
  } catch {
    return {
      found: false,
      path: bin,
      version: null,
      isJava8: false,
      vendor: null,
      bundled: false
    };
  }
}

function javaHomeBin(home: string) {
  const exe = platform() === "win32" ? "java.exe" : "java";
  const candidates = [join(home, "bin", exe), join(home, "jre", "bin", exe)];
  return candidates.find((item) => existsSync(item)) ?? join(home, "bin", exe);
}

async function fromJavaHomeTool() {
  if (platform() !== "darwin") return null;
  try {
    const { stdout } = await execFileAsync("/usr/libexec/java_home", ["-v", "1.8"], {
      timeout: 5000
    });
    const home = stdout.trim();
    if (home) return javaHomeBin(home);
  } catch {
    /* missing */
  }
  return null;
}

export function javaHomeFromBin(bin: string) {
  return bin.replace(/[\\/]bin[\\/]java(?:\.exe)?$/i, "");
}

export async function prepareMacPath(target: string) {
  if (platform() !== "darwin" || !existsSync(target)) return;
  try {
    chmodSync(target, 0o755);
  } catch {
    /* ignore */
  }
  try {
    await execFileAsync("xattr", ["-dr", "com.apple.quarantine", target], {
      timeout: 15000
    });
  } catch {
    /* no quarantine flag */
  }
}

function macJvmBins() {
  if (platform() !== "darwin") return [];
  const roots = [
    "/Library/Java/JavaVirtualMachines",
    join(homedir(), "Library/Java/JavaVirtualMachines")
  ];
  const bins: string[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      if (!/8|1\.8|zulu-8|temurin-8|jdk1\.8/i.test(name)) continue;
      const home = join(root, name, "Contents", "Home");
      const bin = javaHomeBin(home);
      if (existsSync(bin)) bins.push(bin);
    }
  }
  return bins;
}

function findBundled() {
  const root = join(RUNTIME, "java8");
  if (!existsSync(root)) return null;
  const exe = platform() === "win32" ? "java.exe" : "java";
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) stack.push(full);
      else if (name === exe && full.includes(`${join("bin", exe)}`)) return full;
    }
  }
  return null;
}

const WINDOWS_HINTS = [
  "C:\\Program Files\\Zulu\\zulu-8\\bin\\java.exe",
  "C:\\Program Files\\Eclipse Adoptium\\jdk-8\\bin\\java.exe",
  "C:\\Program Files\\Java\\jdk1.8.0\\bin\\java.exe",
  "C:\\Program Files\\Java\\jre1.8.0\\bin\\java.exe"
];

export async function detectJava(): Promise<JavaInfo> {
  const configured = loadConfig().javaPath;
  const candidates = [
    configured,
    findBundled(),
    await fromJavaHomeTool(),
    ...macJvmBins(),
    process.env.JAVA_HOME ? javaHomeBin(process.env.JAVA_HOME) : null,
    ...WINDOWS_HINTS,
    platform() === "win32" ? "java.exe" : "java"
  ].filter((item, index, all): item is string => Boolean(item) && all.indexOf(item) === index);

  let fallback: JavaInfo | null = null;
  for (const bin of candidates) {
    const info = await inspectJava(bin);
    if (info.found && info.isJava8) {
      if (configured !== bin) updateConfig({ javaPath: bin });
      return info;
    }
    if (info.found && !fallback) fallback = info;
  }
  return (
    fallback ?? {
      found: false,
      path: null,
      version: null,
      isJava8: false,
      vendor: null,
      bundled: false
    }
  );
}

function azulTarget() {
  const os =
    platform() === "darwin" ? "macos" : platform() === "win32" ? "windows" : "linux";
  const cpu = arch() === "arm64" ? "arm" : "x64";
  const archive = platform() === "win32" ? "zip" : "tar.gz";
  return { os, cpu, archive };
}

export async function downloadJava8(
  onProgress?: (percent: number, message: string) => void
): Promise<JavaInfo> {
  const { os, cpu, archive } = azulTarget();
  const query = new URL("https://api.azul.com/metadata/v1/zulu/packages");
  query.searchParams.set("java_version", "8");
  query.searchParams.set("os", os);
  query.searchParams.set("arch", cpu);
  query.searchParams.set("archive_type", archive);
  query.searchParams.set("java_package_type", "jre");
  query.searchParams.set("latest", "true");
  query.searchParams.set("release_status", "ga");
  query.searchParams.set("availability_types", "ca");
  query.searchParams.set("javafx_bundled", "false");

  onProgress?.(2, "Looking up Azul Zulu Java 8");
  const response = await fetch(query);
  if (!response.ok) throw new Error(`Azul API failed (${response.status})`);
  const packages = (await response.json()) as Array<{
    name: string;
    download_url: string;
  }>;
  const pack =
    packages.find((item) => !item.name.includes("-fx-")) ?? packages[0];
  if (!pack) throw new Error("No Java 8 package found for this Mac/PC");

  const destRoot = join(RUNTIME, "java8");
  await rm(destRoot, { recursive: true, force: true });
  await mkdir(destRoot, { recursive: true });
  const archivePath = join(RUNTIME, pack.name);

  onProgress?.(8, `Downloading ${pack.name}`);
  const fileRes = await fetch(pack.download_url);
  if (!fileRes.ok || !fileRes.body) {
    throw new Error(`Java download failed (${fileRes.status})`);
  }
  const total = Number(fileRes.headers.get("content-length") || 0);
  let read = 0;
  const reader = fileRes.body.getReader();
  const out = createWriteStream(archivePath);
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    read += value.byteLength;
    out.write(value);
    if (total) {
      onProgress?.(8 + Math.round((read / total) * 70), "Downloading Java 8");
    }
  }
  await new Promise<void>((resolve, reject) => {
    out.end(() => resolve());
    out.on("error", reject);
  });

  onProgress?.(82, "Extracting Java 8");
  if (archive === "zip") {
    const { createReadStream } = await import("node:fs");
    await pipeline(createReadStream(archivePath), Extract({ path: destRoot }));
  } else {
    await execFileAsync("tar", ["-xzf", archivePath, "-C", destRoot], {
      timeout: 120_000
    });
  }
  await rm(archivePath, { force: true });

  const bundled = findBundled();
  if (!bundled) throw new Error("Java extracted but java binary was not found");
  await prepareMacPath(destRoot);
  await prepareMacPath(bundled);
  updateConfig({ javaPath: bundled });
  onProgress?.(100, "Java 8 ready");
  return inspectJava(bundled);
}

export async function ensureJava8(
  onProgress?: (percent: number, message: string) => void
): Promise<JavaInfo> {
  const current = await detectJava();
  if (current.found && current.isJava8 && current.path) {
    await prepareMacPath(current.path);
    return current;
  }
  onProgress?.(1, "Java 8 not found. Downloading Azul Zulu 8");
  return downloadJava8(onProgress);
}
