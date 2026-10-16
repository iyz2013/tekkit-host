import type { PackVersion } from "./types.ts";

const TEKKIT_MINECRAFT = "1.12.2";
const FALLBACK_BUILDS = [
  "1.2.6",
  "1.2.5",
  "1.2.4",
  "1.2.3",
  "1.2.2",
  "1.2.1",
  "1.2.0",
  "1.1.3",
  "1.1.2",
  "1.1.1",
  "1.1.0",
  "1.0.5",
  "1.0.4",
  "1.0.3",
  "1.0.2",
  "1.0.1",
  "1.0.0"
];

export function serverZipUrl(version: string) {
  const tag = version.startsWith("v") ? version : `v${version}`;
  return `https://servers.technicpack.net/Technic/servers/tekkit-2/Tekkit-2_Server_${tag}.zip`;
}

export async function listTekkitVersions(): Promise<PackVersion[]> {
  try {
    const [solderRes, packRes] = await Promise.all([
      fetch("https://solder.technicpack.net/api/modpack/tekkit-2"),
      fetch("https://api.technicpack.net/modpack/tekkit-2?build=latest")
    ]);
    const solder = solderRes.ok
      ? ((await solderRes.json()) as {
          recommended?: string;
          latest?: string;
          builds?: string[];
        })
      : {};
    const pack = packRes.ok
      ? ((await packRes.json()) as { version?: string; serverPackUrl?: string })
      : {};
    const recommended = solder.recommended || solder.latest || pack.version || "1.2.6";
    const builds = (solder.builds?.length ? solder.builds : FALLBACK_BUILDS)
      .slice()
      .reverse();
    return builds.map((id) => ({
      id,
      recommended: id === recommended,
      minecraft: TEKKIT_MINECRAFT,
      url:
        id === pack.version && pack.serverPackUrl
          ? pack.serverPackUrl
          : serverZipUrl(id)
    }));
  } catch {
    return FALLBACK_BUILDS.map((id, index) => ({
      id,
      recommended: index === 0,
      minecraft: TEKKIT_MINECRAFT,
      url: serverZipUrl(id)
    }));
  }
}

export const TEKKIT_NOTES = {
  id: "tekkit-2",
  name: "Tekkit 2",
  minecraft: TEKKIT_MINECRAFT,
  java: "8",
  loader: "Forge 1.12.2",
  whyJava8:
    "Forge 1.12.2 uses the old LaunchWrapper. Java 11+ throws ClassCastException and will not start.",
  whyMacZulu:
    "On Apple Silicon, Azul Zulu JDK/JRE 8 has a native ARM64 build. That is faster and more reliable than Intel Java under Rosetta.",
  memoryHintGb: 8
};
