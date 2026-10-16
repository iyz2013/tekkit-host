import { usedMem } from "../api";
import { JoinAddresses } from "../components/JoinAddresses";
import type { HostPayload, HostSnapshot, InstanceConfig, RuntimeState } from "../types";

export function Overview({
  host,
  pack,
  instances,
  states,
  busy,
  progress,
  onOpen,
  onCreate,
  onQuickStart
}: {
  host: HostSnapshot;
  pack: HostPayload["pack"];
  instances: InstanceConfig[];
  states: Record<string, RuntimeState>;
  busy: boolean;
  progress: string;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onQuickStart: () => void;
}) {
  const used = usedMem(host);
  const usedPct = host.totalMemMb ? Math.round((used / host.totalMemMb) * 100) : 0;
  const diskPct = host.diskTotalGb
    ? Math.round(((host.diskTotalGb - host.diskFreeGb) / host.diskTotalGb) * 100)
    : 0;
  const online = instances.filter((item) => states[item.id]?.status === "running").length;
  const players = instances.reduce(
    (sum, item) => sum + (states[item.id]?.players.length ?? 0),
    0
  );
  const primary = instances[0];
  const primaryState = primary ? states[primary.id] : undefined;
  const running = primaryState?.status === "running";
  const installing =
    busy ||
    primaryState?.status === "installing" ||
    primaryState?.status === "starting";

  const launchLabel = running
    ? "Open server"
    : installing
      ? "Working"
      : primary?.installed
        ? "Start server"
        : "Start Tekkit 2";

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Machine overview</h1>
          <p>
            {host.hostname} · {host.arch} · {host.cpuCount} threads · {pack.name} on Minecraft{" "}
            {pack.minecraft}
          </p>
        </div>
        <div className="pills">
          <span className={`pill ${host.java.isJava8 ? "ok" : "warn"}`}>
            {host.java.isJava8
              ? `Java 8 · ${host.java.version}`
              : host.java.found
                ? `Wrong Java · ${host.java.version}`
                : "Java 8 missing"}
          </span>
          <span className="pill">{Math.round(host.totalMemMb / 1024)} GB RAM</span>
        </div>
      </div>

      <div className="card launch">
        <div>
          <h2>One-click launch</h2>
          <p className="note">
            Installs Java 8 if needed, downloads official Tekkit 2 1.2.6, writes EULA and
            server settings, then starts the world. Clicking accepts the Minecraft EULA.
          </p>
          {(busy || primaryState?.installMessage) && (
            <p className="note" style={{ marginTop: 8 }}>
              {progress || primaryState?.installMessage}
              {primaryState?.installPercent ? ` · ${primaryState.installPercent}%` : ""}
            </p>
          )}
        </div>
        <button
          className="btn launch-btn"
          disabled={installing && !running}
          onClick={() => (running && primary ? onOpen(primary.id) : onQuickStart())}
        >
          {launchLabel}
        </button>
      </div>

      <div className="grid stats">
        <div className="card">
          <h3>Memory</h3>
          <div className="stat-value">{usedPct}%</div>
          <div className="usage">
            <span>In use</span>
            <span>
              {used.toLocaleString()} / {host.totalMemMb.toLocaleString()} MB
            </span>
          </div>
        </div>
        <div className="card">
          <h3>Disk</h3>
          <div className="stat-value">{diskPct}%</div>
          <div className="usage">
            <span>Free</span>
            <span>
              {host.diskFreeGb} GB of {host.diskTotalGb} GB
            </span>
          </div>
        </div>
        <div className="card">
          <h3>Servers live</h3>
          <div className="stat-value">
            {online}/{instances.length}
          </div>
          <div className="note">Tekkit 2 instances this panel can start</div>
        </div>
        <div className="card">
          <h3>Players</h3>
          <div className="stat-value">{players}</div>
          <div className="note">Online across every running server</div>
        </div>
      </div>

      <div className="grid two" style={{ marginTop: 10 }}>
        <div className="card">
          <h2>Servers</h2>
          {!instances.length && (
            <div className="empty">None yet. Use Start Tekkit 2 above.</div>
          )}
          {instances.map((item) => {
            const state = states[item.id];
            return (
              <div key={item.id} className="row">
                <div>
                  <strong>{item.name}</strong>
                  <div className="note">
                    Tekkit 2 {item.packVersion} · :{item.port} · {Math.round(item.memoryMb / 1024)} GB
                  </div>
                </div>
                <div className="actions">
                  <span className={`pill ${state?.status === "running" ? "ok" : ""}`}>
                    {state?.status ?? "stopped"}
                  </span>
                  <button className="btn" onClick={() => onOpen(item.id)}>
                    Open
                  </button>
                </div>
              </div>
            );
          })}
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn" onClick={onCreate}>
              Custom server
            </button>
          </div>
        </div>
        <div className="card">
          <JoinAddresses host={host} instance={primary} />
        </div>
      </div>
    </>
  );
}
