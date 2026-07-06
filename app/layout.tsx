import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Honeycombing — H3 Hex Grid Voting Analysis",
  description:
    "Hexagonal grid visualization tool for analyzing gerrymandering with H3 spatial indexing",
  other: {
    "viewport": "width=device-width, initial-scale=1, viewport-fit=cover",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased dark`}
      style={{ height: '100dvh' }}
    >
      <body className="bg-black text-white" style={{ minHeight: '100dvh' }}>{children}</body>
    </html>
  );
}
