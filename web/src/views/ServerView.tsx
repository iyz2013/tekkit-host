import { useEffect, useRef, useState } from "react";
import { api, formatBytes } from "../api";
import { JoinAddresses } from "../components/JoinAddresses";
import { RamPicks } from "../components/RamPicks";
import type { BackupInfo, HostSnapshot, InstanceConfig, ModInfo, RuntimeState } from "../types";

type Tab = "console" | "players" | "mods" | "backups" | "settings";

export function ServerView({
  instance,
  host,
  state,
  logs,
  onChange,
  onDeleted
}: {
  instance: InstanceConfig;
  host: HostSnapshot | null;
  state?: RuntimeState;
  logs: string[];
  onChange: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("console");
  const [command, setCommand] = useState("");
  const [mods, setMods] = useState<ModInfo[]>([]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [settings, setSettings] = useState(instance);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSettings(instance), [instance]);
  useEffect(() => {
    if (tab === "mods") void api.mods(instance.id).then(setMods);
    if (tab === "backups") void api.backups(instance.id).then(setBackups);
  }, [tab, instance.id]);
  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs, tab]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const status = state?.status ?? "stopped";

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{instance.name}</h1>
          <p>
            Tekkit 2 {instance.packVersion} · Minecraft {instance.minecraft} · :{instance.port}
            {host?.publicIp ? ` · public ${host.publicIp}:${instance.port}` : ""}
          </p>
        </div>
        <div className="pills">
          <span className={`pill ${status === "running" ? "ok" : status === "crashed" ? "bad" : ""}`}>
            {status}
          </span>
          <span className="pill">{state?.memoryMb ?? 0} MB used</span>
          <span className="pill">{state?.cpuPercent ?? 0}% CPU</span>
          <span className="pill">{state?.players.length ?? 0} players</span>
        </div>
      </div>
      {error && <div className="banner error">{error}</div>}
      {state?.lastError && <div className="banner error">{state.lastError}</div>}
      {status === "installing" && (
        <div className="banner">
          {state?.installMessage} {state?.installPercent}%
        </div>
      )}
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy || status === "running" || status === "starting"}
          onClick={() => void run(() => api.start(instance.id))}
        >
          Start
        </button>
        <button
          className="btn"
          disabled={busy || status === "stopped"}
          onClick={() => void run(() => api.stop(instance.id))}
        >
          Stop
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() => void run(() => api.restart(instance.id))}
        >
          Restart
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() => void run(() => api.createBackup(instance.id, "world"))}
        >
          Backup world
        </button>
      </div>
      {host && (
        <div className="card" style={{ marginBottom: 10 }}>
          <JoinAddresses host={host} instance={instance} />
        </div>
      )}
      <div className="tabs">
        {(["console", "players", "mods", "backups", "settings"] as Tab[]).map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>

      {tab === "console" && (
        <div className="card">
          <div className="console" ref={consoleRef}>
            {(logs.length ? logs : ["No log lines yet. Start the server to stream output."]).map(
              (line, index) => (
                <div key={`${index}-${line.slice(0, 24)}`} className={line.startsWith(">") ? "cmd" : ""}>
                  {line}
                </div>
              )
            )}
          </div>
          <form
            className="actions"
            style={{ marginTop: 10 }}
            onSubmit={(event) => {
              event.preventDefault();
              if (!command.trim()) return;
              void run(() => api.command(instance.id, command)).then(() => setCommand(""));
            }}
          >
            <input
              style={{ flex: 1 }}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="say Hello / list / op Steve"
            />
            <button className="btn primary" disabled={status !== "running"}>
              Send
            </button>
          </form>
        </div>
      )}

      {tab === "players" && (
        <div className="card">
          <h2>Online</h2>
          {!state?.players.length && <div className="empty">Nobody is online.</div>}
          {!!state?.players.length && (
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.players.map((player) => (
                  <tr key={player.name}>
                    <td>{player.name}</td>
                    <td className="actions">
                      <button
                        className="btn"
                        onClick={() => void run(() => api.command(instance.id, `kick ${player.name}`))}
                      >
                        Kick
                      </button>
                      <button
                        className="btn danger"
                        onClick={() => void run(() => api.command(instance.id, `ban ${player.name}`))}
                      >
                        Ban
                      </button>
                      <button
                        className="btn"
                        onClick={() => void run(() => api.command(instance.id, `op ${player.name}`))}
                      >
                        Op
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "mods" && (
        <div className="card">
          <div className="actions" style={{ marginBottom: 12 }}>
            <label className="btn">
              Upload jar
              <input
                type="file"
                accept=".jar"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const result = reader.result as string;
                    const base64 = result.split(",")[1] ?? "";
                    void run(() => api.uploadMod(instance.id, file.name, base64)).then(() =>
                      api.mods(instance.id).then(setMods)
                    );
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            <span className="note">Disable a mod, then restart the server for Forge to drop it.</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
                <th>State</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {mods.map((mod) => (
                <tr key={mod.file}>
                  <td>{mod.file}</td>
                  <td>{formatBytes(mod.size)}</td>
                  <td>{mod.enabled ? "enabled" : "disabled"}</td>
                  <td className="actions">
                    <button
                      className="btn"
                      onClick={() =>
                        void run(() => api.toggleMod(instance.id, mod.file, !mod.enabled)).then(() =>
                          api.mods(instance.id).then(setMods)
                        )
                      }
                    >
                      {mod.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      className="btn danger"
                      onClick={() =>
                        void run(() => api.deleteMod(instance.id, mod.file)).then(() =>
                          api.mods(instance.id).then(setMods)
                        )
                      }
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "backups" && (
        <div className="card">
          <div className="actions" style={{ marginBottom: 12 }}>
            <button
              className="btn primary"
              onClick={() =>
                void run(() => api.createBackup(instance.id, "world")).then(() =>
                  api.backups(instance.id).then(setBackups)
                )
              }
            >
              World backup
            </button>
            <button
              className="btn"
              onClick={() =>
                void run(() => api.createBackup(instance.id, "full")).then(() =>
                  api.backups(instance.id).then(setBackups)
                )
              }
            >
              Full instance backup
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Kind</th>
                <th>Size</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {backups.map((backup) => (
                <tr key={backup.id}>
                  <td>{backup.file}</td>
                  <td>{backup.kind}</td>
                  <td>{formatBytes(backup.size)}</td>
                  <td>{new Date(backup.createdAt).toLocaleString()}</td>
                  <td className="actions">
                    <a className="btn" href={api.backupUrl(instance.id, backup.file)}>
                      Download
                    </a>
                    <button
                      className="btn"
                      onClick={() => {
                        if (!confirm("Stop-required restore. Continue?")) return;
                        void run(() => api.restoreBackup(instance.id, backup.file));
                      }}
                    >
                      Restore
                    </button>
                    <button
                      className="btn danger"
                      onClick={() =>
                        void run(() => api.deleteBackup(instance.id, backup.file)).then(() =>
                          api.backups(instance.id).then(setBackups)
                        )
                      }
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "settings" && (
        <div className="card">
          <form
            className="form two-col"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => api.patch(instance.id, settings));
            }}
          >
            <label>
              MOTD
              <input
                value={settings.motd}
                onChange={(e) => setSettings({ ...settings, motd: e.target.value })}
              />
            </label>
            <label>
              Port
              <input
                type="number"
                value={settings.port}
                onChange={(e) => setSettings({ ...settings, port: Number(e.target.value) })}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Server RAM
              <RamPicks
                valueMb={settings.memoryMb}
                onChange={(memoryMb) =>
                  setSettings({
                    ...settings,
                    memoryMb,
                    memoryMinMb: Math.min(settings.memoryMinMb, memoryMb)
                  })
                }
              />
            </label>
            <label>
              Max players
              <input
                type="number"
                value={settings.maxPlayers}
                onChange={(e) => setSettings({ ...settings, maxPlayers: Number(e.target.value) })}
              />
            </label>
            <label>
              Difficulty
              <select
                value={settings.difficulty}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    difficulty: e.target.value as InstanceConfig["difficulty"]
                  })
                }
              >
                <option>peaceful</option>
                <option>easy</option>
                <option>normal</option>
                <option>hard</option>
              </select>
            </label>
            <label>
              Auto backup minutes (0 = off)
              <input
                type="number"
                value={settings.autoBackupMinutes}
                onChange={(e) =>
                  setSettings({ ...settings, autoBackupMinutes: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Extra Java args
              <input
                value={settings.extraJavaArgs}
                onChange={(e) => setSettings({ ...settings, extraJavaArgs: e.target.value })}
              />
            </label>
            <label>
              Whitelist
              <select
                value={settings.whitelist ? "yes" : "no"}
                onChange={(e) => setSettings({ ...settings, whitelist: e.target.value === "yes" })}
              >
                <option value="no">Off</option>
                <option value="yes">On</option>
              </select>
            </label>
            <label>
              Auto restart
              <select
                value={settings.autoRestart ? "yes" : "no"}
                onChange={(e) =>
                  setSettings({ ...settings, autoRestart: e.target.value === "yes" })
                }
              >
                <option value="yes">On</option>
                <option value="no">Off</option>
              </select>
            </label>
            <div className="actions" style={{ gridColumn: "1 / -1" }}>
              <button className="btn primary">Save settings</button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  if (!confirm("Delete this server and its world?")) return;
                  void run(() => api.remove(instance.id)).then(onDeleted);
                }}
              >
                Delete server
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
