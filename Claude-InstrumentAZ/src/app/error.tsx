"use client";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[InstrumentAZ] unhandled error", error); }, [error]);
  const hasRecovery = typeof window !== "undefined" && !!localStorage.getItem("iaz.recovery");
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 24, background: "var(--bg)", color: "var(--text)" }}>
      <div className="panel" style={{ maxWidth: 560, padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--danger)" }}>InstrumentAZ hit an unexpected error</h1>
        <p className="muted" style={{ margin: "10px 0" }}>{error.message}</p>
        <p style={{ margin: "10px 0" }}>{hasRecovery ? "An autosaved recovery copy of your project exists in this browser and will be offered on restart." : "No recovery copy was found in this browser."}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={() => reset()}>Try again</button>
          <button className="btn" onClick={() => location.reload()}>Reload application</button>
        </div>
      </div>
    </div>
  );
}
