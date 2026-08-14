import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HilalSight — Crescent Moon Visibility",
  description: "Global new crescent moon visibility projections using the HMNAO / Yallop q-test.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
