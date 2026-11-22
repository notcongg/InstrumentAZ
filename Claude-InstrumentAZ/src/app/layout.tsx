import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "InstrumentAZ — Violin Engineering Environment",
  description: "Design, simulate, wire, program and manufacture a violin: CAD, string physics, electronics, audio and manufacturing in one project model.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
