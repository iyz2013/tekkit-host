import { useEffect, useMemo, useState } from "react";
import { api, clearToken, connectBus, getToken } from "./api";
import { CreateView } from "./views/CreateView";
import { JavaView } from "./views/JavaView";
import { LoginView } from "./views/LoginView";
import { NetworkView } from "./views/NetworkView";
import { Overview } from "./views/Overview";
import { ServerView } from "./views/ServerView";
import type { HostPayload, HostSnapshot, InstanceConfig, RuntimeState } from "./types";

type Page = "overview" | "create" | "java" | "network" | "server";

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState("admin");
  const [host, setHost] = useState<HostSnapshot | null>(null);
  const [pack, setPack] = useState<HostPayload["pack"] | null>(null);
  const [instances, setInstances] = useState<InstanceConfig[]>([]);
  const [states, setStates] = useState<Record<string, RuntimeState>>({});
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [page, setPage] = useState<Page>("overview");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchProgress, setLaunchProgress] = useState("");

  const refresh = async () => {
    const [hostPayload, list] = await Promise.all([api.host(), api.instances()]);
    setHost(hostPayload.host);
    setPack(hostPayload.pack);
    setInstances(list.instances);
    setStates((prev) => ({ ...prev, ...list.states }));
  };

  useEffect(() => {
    if (!getToken()) {
      setAuthed(false);
      return;
    }
    void api
      .me()
      .then((data) => {
        setUser(data.username);
        setAuthed(true);
      })
      .catch(() => {
        clearToken();
        setAuthed(false);
      });
  }, []);

  useEffect(() => {
    if (!authed || !selected) return;
    void api.instance(selected).then((detail) => {
      setLogs((prev) => ({ ...prev, [selected]: detail.logs }));
    });
  }, [selected, authed]);

  useEffect(() => {
    if (!authed) return;
    void refresh().catch((err) => {
      if ((err as Error & { status?: number }).status === 401) {
        clearToken();
        setAuthed(false);
        return;
      }
      setError((err as Error).message);
    });
    const socket = connectBus((message) => {
      if (message.type === "status") {
        const instanceId = message.payload.instanceId as string;
        setStates((prev) => ({
          ...prev,
          [instanceId]: message.payload.state as RuntimeState
        }));
      }
      if (message.type === "log") {
        const instanceId = message.payload.instanceId as string;
        const line = message.payload.line as string;
        setLogs((prev) => ({
          ...prev,
          [instanceId]: [...(prev[instanceId] ?? []), line].slice(-800)
        }));
      }
      if (message.type === "install") {
        const messageText = String(message.payload.message ?? "");
        const percent = Number(message.payload.percent ?? 0);
        setLaunchProgress(percent ? `${messageText} · ${percent}%` : messageText);
      }
      if (message.type === "metrics") {
        setHost(message.payload.host as HostSnapshot);
        setStates((prev) => ({
          ...prev,
          ...(message.payload.instances as Record<string, RuntimeState>)
        }));
      }
    });
    return () => socket.close();
  }, [authed]);

  const quickStart = async () => {
    const first = instances[0];
    if (first && states[first.id]?.status === "running") {
      setSelected(first.id);
      setPage("server");
      return;
    }
    setLaunching(true);
    setError(null);
    setLaunchProgress("Installing Java, Tekkit 2, and starting the server");
    try {
      const result = await api.quickStart({ memoryMb: 8192 });
      await refresh();
      setSelected(result.instance.id);
      setPage("server");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLaunching(false);
    }
  };

  const current = useMemo(
    () => instances.find((item) => item.id === selected) ?? null,
    [instances, selected]
  );

  if (authed === null) return <div className="login" />;
  if (!authed) {
    return (
      <LoginView
        onAuthed={() => {
          setError(null);
          setAuthed(true);
        }}
      />
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <small>Tekkit 2</small>
          <strong>Host</strong>
        </div>
        <nav className="nav">
          <button className="btn launch-btn" disabled={launching} onClick={() => void quickStart()}>
            {launching ? "Working" : "Start Tekkit 2"}
          </button>
          <button className={page === "overview" ? "active" : ""} onClick={() => setPage("overview")}>
            Overview
          </button>
          <button className={page === "create" ? "active" : ""} onClick={() => setPage("create")}>
            New server
          </button>
          <button className={page === "java" ? "active" : ""} onClick={() => setPage("java")}>
            Java 8
          </button>
          <button className={page === "network" ? "active" : ""} onClick={() => setPage("network")}>
            Network
          </button>
        </nav>
        <div>
          <div className="section-label">Servers</div>
          <div className="server-list">
            {instances.map((item) => (
              <button
                key={item.id}
                className={`server-link ${page === "server" && selected === item.id ? "active" : ""}`}
                onClick={() => {
                  setSelected(item.id);
                  setPage("server");
                }}
              >
                <span>{item.name}</span>
                <span className={`dot ${states[item.id]?.status ?? "stopped"}`} />
              </button>
            ))}
            {!instances.length && <div className="note">None yet</div>}
          </div>
        </div>
        <div className="sidebar-foot">
          <div className="note" style={{ marginBottom: 6 }}>
            {user}
          </div>
          <button
            className="btn"
            onClick={() => {
              void api.logout().finally(() => {
                clearToken();
                setAuthed(false);
              });
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        {error && <div className="banner error">{error}</div>}
        {page === "overview" && host && pack && (
          <Overview
            host={host}
            pack={pack}
            instances={instances}
            states={states}
            onOpen={(id) => {
              setSelected(id);
              setPage("server");
            }}
            onCreate={() => setPage("create")}
            busy={launching}
            progress={launchProgress}
            onQuickStart={() => void quickStart()}
          />
        )}
        {page === "create" && (
          <CreateView
            host={host}
            onCreated={async (id) => {
              await refresh();
              setSelected(id);
              setPage("server");
            }}
          />
        )}
        {page === "java" && host && <JavaView host={host} onChange={() => void refresh()} />}
        {page === "network" && host && (
          <NetworkView host={host} instances={instances} states={states} />
        )}
        {page === "server" && current && (
          <ServerView
            instance={current}
            host={host}
            state={states[current.id]}
            logs={logs[current.id] ?? []}
            onChange={async () => {
              await refresh();
              if (selected) {
                const detail = await api.instance(selected);
                setLogs((prev) => ({ ...prev, [selected]: detail.logs }));
              }
            }}
            onDeleted={async () => {
              await refresh();
              setSelected(null);
              setPage("overview");
            }}
          />
        )}
      </main>
    </div>
  );
}
