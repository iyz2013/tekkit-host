import { useState } from "react";
import type { HostSnapshot, InstanceConfig } from "../types";

function CopyRow({ label, value, hint }: { label: string; value: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="join-row">
      <div>
        <div className="section-label">{label}</div>
        <code>{value}</code>
        <div className="note">{hint}</div>
      </div>
      <button
        type="button"
        className="btn"
        disabled={!value || value.includes("not detected")}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function JoinAddresses({
  host,
  instance
}: {
  host: HostSnapshot;
  instance?: InstanceConfig | null;
}) {
  const port = instance?.port ?? 25565;
  const lan = host.lanIps[0] ? `${host.lanIps[0]}:${port}` : "not detected";
  const wan = host.publicIp ? `${host.publicIp}:${port}` : "not detected";

  return (
    <div className="join-box">
      <h2>Friend join address</h2>
      <p className="note">
        Friends need the Technic Launcher and Tekkit 2 {instance?.packVersion ?? "1.2.6"}.
        Vanilla Minecraft will not connect.
      </p>
      <CopyRow
        label="Same Wi-Fi"
        value={lan}
        hint="Works in your house. No router change."
      />
      <CopyRow
        label="Public internet"
        value={wan}
        hint={`Give this to people outside your network after you forward TCP ${port} on the router to this computer.`}
      />
    </div>
  );
}
