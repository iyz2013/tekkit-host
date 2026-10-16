import { existsSync } from "node:fs";
import { statfs } from "node:fs/promises";
import { cpus, freemem, hostname, loadavg, totalmem } from "node:os";
import { networkInterfaces } from "node:os";
import { ROOT } from "./paths.ts";
import { detectJava } from "./java.ts";
import type { HostSnapshot } from "./types.ts";

let publicIp: string | null = null;
let publicIpAt = 0;

export function lanIps() {
  const ips: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family !== "IPv4" || item.internal) continue;
      ips.push(item.address);
    }
  }
  return ips;
}

export async function fetchPublicIp() {
  if (publicIp && Date.now() - publicIpAt < 5 * 60_000) return publicIp;
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(4000)
    });
    const data = (await res.json()) as { ip?: string };
    publicIp = data.ip ?? null;
    publicIpAt = Date.now();
  } catch {
    /* offline */
  }
  return publicIp;
}

export async function hostSnapshot(): Promise<HostSnapshot> {
  const diskPath = existsSync(ROOT) ? ROOT : process.cwd();
  let diskTotalGb = 0;
  let diskFreeGb = 0;
  try {
    const disk = await statfs(diskPath);
    diskTotalGb = Number(disk.blocks * disk.bsize) / 1024 ** 3;
    diskFreeGb = Number(disk.bavail * disk.bsize) / 1024 ** 3;
  } catch {
    /* Windows older node */
  }

  const cpu = cpus()[0];
  return {
    platform: process.platform,
    arch: process.arch,
    hostname: hostname(),
    cpuModel: cpu?.model ?? "Unknown CPU",
    cpuCount: cpus().length,
    load: loadavg(),
    totalMemMb: Math.round(totalmem() / 1024 / 1024),
    freeMemMb: Math.round(freemem() / 1024 / 1024),
    diskTotalGb: Number(diskTotalGb.toFixed(1)),
    diskFreeGb: Number(diskFreeGb.toFixed(1)),
    java: await detectJava(),
    publicIp: await fetchPublicIp(),
    lanIps: lanIps()
  };
}
