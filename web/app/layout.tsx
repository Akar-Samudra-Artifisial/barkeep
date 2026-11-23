import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Shell } from "@/components/shell";
import { FixtureBanner } from "@/components/ui";
import { CHAIN_ID, dataSource } from "@/lib/config";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: { default: "Barkeep — reputation across Gno.land realms", template: "%s · Barkeep" },
  description:
    "Barkeep turns activity in Gno.land realms into one decaying, sybil-aware reputation score that any realm can read.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const fixture = dataSource() === "fixture";
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <Shell fixture={fixture} network={fixture ? `${CHAIN_ID} · demo data` : `${CHAIN_ID} · live`}>
          {fixture && <FixtureBanner />}
          {children}
        </Shell>
      </body>
    </html>
  );
}
