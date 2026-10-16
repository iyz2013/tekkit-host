import { useEffect, useState } from "react";
import { api } from "../api";
import { RamPicks } from "../components/RamPicks";
import type { HostSnapshot, PackVersion } from "../types";

export function CreateView({
  host,
  onCreated
}: {
  host: HostSnapshot | null;
  onCreated: (id: string) => Promise<void>;
}) {
  const [versions, setVersions] = useState<PackVersion[]>([]);
  const [name, setName] = useState("Tekkit Main");
  const [packVersion, setPackVersion] = useState("1.2.6");
  const [port, setPort] = useState(25565);
  const [memoryMb, setMemoryMb] = useState(8192);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [onlineMode, setOnlineMode] = useState(true);
  const [eula, setEula] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    void api.packs().then((data) => {
      setVersions(data.versions);
      const rec = data.versions.find((item) => item.recommended);
      if (rec) setPackVersion(rec.id);
    });
    void api.instances().then((data) => setPort(data.ports.port));
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    setProgress("Downloading official Tekkit 2 server zip…");
    try {
      const created = await api.create({
        name,
        packVersion,
        port,
        memoryMb,
        memoryMinMb: Math.min(2048, memoryMb),
        maxPlayers,
        onlineMode,
        eula
      });
      setProgress("Installed.");
      await onCreated(created.instance.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const maxRam = host ? Math.max(4096, host.totalMemMb - 8192) : 32768;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>New Tekkit 2 server</h1>
          <p>Downloads the official Technic dedicated server for Minecraft 1.12.2.</p>
        </div>
      </div>
      {error && <div className="banner error">{error}</div>}
      {busy && (
        <div className="banner">
          {progress} This can take a few minutes the first time.
        </div>
      )}
      <div className="card">
        <form
          className="form two-col"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label>
            Server name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Tekkit 2 version
            <select value={packVersion} onChange={(e) => setPackVersion(e.target.value)}>
              {versions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}
                  {item.recommended ? " (recommended)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Game port
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
            />
          </label>
          <label>
            Max players
            <input
              type="number"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
            />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            Server RAM
            <RamPicks valueMb={memoryMb} onChange={setMemoryMb} maxMb={maxRam} />
          </label>
          <label>
            Online mode
            <select
              value={onlineMode ? "yes" : "no"}
              onChange={(e) => setOnlineMode(e.target.value === "yes")}
            >
              <option value="yes">Yes, premium accounts only</option>
              <option value="no">No, cracked / LAN testing</option>
            </select>
          </label>
          <label className="inline" style={{ gridColumn: "1 / -1" }}>
            <input type="checkbox" checked={eula} onChange={(e) => setEula(e.target.checked)} />
            I accept the Minecraft EULA at https://aka.ms/MinecraftEULA
          </label>
          <div className="actions" style={{ gridColumn: "1 / -1" }}>
            <button className="btn primary" disabled={busy || !eula}>
              {busy ? "Installing…" : "Download and create"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
