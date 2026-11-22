"use client";
import dynamic from "next/dynamic";

const AppShell = dynamic(() => import("@/components/AppShell"), {
  ssr: false,
  loading: () => <div style={{ display: "grid", placeItems: "center", height: "100vh", color: "#8a97aa" }}>Loading InstrumentAZ…</div>,
});

export default function Page() {
  return <AppShell />;
}
