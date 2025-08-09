"use client";
import React, { useEffect, useState } from "react";

export default function SettingsPage() {
  const [token, setToken] = useState("");
  const [linked, setLinked] = useState(false);
  const [status, setStatus] = useState("");

  const refresh = async () => {
    const res = await fetch("/api/auth/attio");
    const json = await res.json();
    setLinked(Boolean(json.linked));
  };

  useEffect(() => {
    refresh();
  }, []);

  const link = async () => {
    setStatus("Linking...");
    const res = await fetch("/api/auth/attio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, validate: true }),
    });
    if (res.ok) {
      setToken("");
      setStatus("Linked");
      refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setStatus(j.error || "Failed to link");
    }
  };

  const unlink = async () => {
    setStatus("Unlinking...");
    await fetch("/api/auth/attio", { method: "DELETE" });
    setStatus("Unlinked");
    refresh();
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>Settings</h1>
      <h2>Attio Account</h2>
      <p>Status: {linked ? "Linked" : "Not linked"}</p>
      {!linked && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="password"
            placeholder="Paste your Attio API key"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={{ width: 360 }}
          />
          <button onClick={link} disabled={!token}>
            Link
          </button>
        </div>
      )}
      {linked && <button onClick={unlink}>Unlink</button>}
      <div style={{ marginTop: 8, color: "#666" }}>{status}</div>
    </div>
  );
}

