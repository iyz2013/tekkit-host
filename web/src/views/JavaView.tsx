import { useState } from "react";
import { api } from "../api";
import type { HostSnapshot } from "../types";

export function JavaView({
  host,
  onChange
}: {
  host: HostSnapshot;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const java = host.java;

  const install = async () => {
    setBusy(true);
    setError(null);
    setMessage("Downloading Azul Zulu Java 8 into data/runtime…");
    try {
      const result = await api.installJava();
      setMessage(`Installed ${result.version} at ${result.path}`);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Java 8</h1>
          <p>Tekkit 2 / Forge 1.12.2 will not start on Java 11, 17, or 21.</p>
        </div>
        <span className={`pill ${java.isJava8 ? "ok" : "warn"}`}>
          {java.isJava8 ? "Ready" : "Needs Java 8"}
        </span>
      </div>
      {error && <div className="banner error">{error}</div>}
      {message && <div className="banner">{message}</div>}
      <div className="grid two">
        <div className="card">
          <h2>Detected runtime</h2>
          <p className="note">Path: {java.path ?? "none"}</p>
          <p className="note">Version: {java.version ?? "unknown"}</p>
          <p className="note">Vendor: {java.vendor ?? "unknown"}</p>
          <p className="note">Bundled with this app: {java.bundled ? "yes" : "no"}</p>
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => void api.detectJava().then(onChange)}>
              Re-scan
            </button>
            <button className="btn primary" disabled={busy} onClick={() => void install()}>
              {busy ? "Installing…" : "Download Java 8 here"}
            </button>
          </div>
        </div>
        <div className="card">
          <h2>MacBook notes</h2>
          <p className="note">
            Best option on Apple Silicon: Azul Zulu 8 ARM64. This panel can download it into{" "}
            <code>data/runtime/java8</code>, or you can install it system-wide:
          </p>
          <p className="note">
            <code>brew install --cask zulu@8</code>
          </p>
          <p className="note">
            Creating or starting a server also installs Java 8 automatically if it is missing.
            After download, the panel marks the binary executable and clears macOS quarantine
            so Gatekeeper does not block it.
          </p>
          <p className="note">
            The dashboard uses <code>/usr/libexec/java_home -v 1.8</code> when Zulu 8 is
            installed system-wide. Do not point Tekkit 2 at a newer JDK.
          </p>
        </div>
      </div>
    </>
  );
}
