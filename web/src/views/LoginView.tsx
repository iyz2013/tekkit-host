import { useState } from "react";
import { api, setToken } from "../api";

export function LoginView({ onAuthed }: { onAuthed: () => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="login">
      <form
        className="login-card"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          void api
            .login(username, password)
            .then((data) => {
              setToken(data.token);
              onAuthed();
            })
            .catch((err) => setError((err as Error).message))
            .finally(() => setBusy(false));
        }}
      >
        <small className="section-label">Tekkit 2 control</small>
        <h1>Sign in</h1>
        <p>Local dashboard for the Minecraft / Tekkit 2 server on this machine.</p>
        {error && <div className="banner error">{error}</div>}
        <div className="form">
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="btn primary" disabled={busy}>
            {busy ? "Signing in" : "Enter"}
          </button>
        </div>
      </form>
    </div>
  );
}
