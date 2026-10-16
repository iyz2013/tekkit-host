import { JoinAddresses } from "../components/JoinAddresses";
import type { HostSnapshot, InstanceConfig, RuntimeState } from "../types";

export function NetworkView({
  host,
  instances,
  states
}: {
  host: HostSnapshot;
  instances: InstanceConfig[];
  states: Record<string, RuntimeState>;
}) {
  const port = instances[0]?.port ?? 25565;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Let other people join</h1>
          <p>
            This computer is the host. Friends install Tekkit 2{" "}
            {instances[0]?.packVersion ?? "1.2.6"} in the Technic Launcher and use the
            addresses below.
          </p>
        </div>
      </div>
      <div className="grid two">
        <div className="card">
          <JoinAddresses host={host} instance={instances[0]} />
          {instances.slice(1).map((item) => (
            <div key={item.id} style={{ marginTop: 12 }}>
              <strong>{item.name}</strong>
              <div className="note">Status: {states[item.id]?.status ?? "stopped"}</div>
              <JoinAddresses host={host} instance={item} />
            </div>
          ))}
        </div>
        <div className="card">
          <h2>How friends connect</h2>
          <p className="note">
            1. Same house: copy the Wi-Fi address. No router change needed.
          </p>
          <p className="note">
            2. Over the internet: copy the public address, then forward TCP {port} on your
            router to this computer’s LAN IP. The dashboard shows your public IP; it cannot
            open the router for you.
          </p>
          <p className="note">
            3. No port forward: install Tailscale on this Mac and on each friend, then they
            join your Tailscale IP on port {port}.
          </p>
          <p className="note">
            Everyone must use Technic Launcher pack Tekkit 2, same version as the server.
          </p>
        </div>
      </div>
    </>
  );
}
