export default function NotFound() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", background: "#0c1016", color: "#e6edf3" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>404 — workspace not found</h1>
        <p style={{ color: "#8a97aa", margin: "10px 0" }}>This route does not exist in InstrumentAZ.</p>
        <a href="/" style={{ color: "#e8a33d" }}>Back to InstrumentAZ</a>
      </div>
    </div>
  );
}
