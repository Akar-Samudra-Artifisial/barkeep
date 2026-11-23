"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { REALMS, gnowebUrl } from "@/lib/config";
import { WalletButton, WalletProvider } from "./wallet";

const NAV = [
  { href: "/", label: "Leaderboard" },
  { href: "/sources", label: "Sources" },
  { href: "/algorithm", label: "Algorithm" },
  { href: "/play", label: "Play" },
  { href: "/integrate", label: "Integrate" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/profile");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className="nav-item"
          aria-current={isActive(pathname, n.href) ? "page" : undefined}
          onClick={onNavigate}
        >
          {n.label}
        </Link>
      ))}
    </>
  );
}

function StaticLinks() {
  return (
    <>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className="nav-item">
          {n.label}
        </Link>
      ))}
    </>
  );
}

function Mark() {
  // A tankard drawn from two shapes: the mug and its handle.
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="13" height="16" rx="2" fill="#1b6c80" />
      <path d="M16 9h2.5A2.5 2.5 0 0 1 21 11.5v3a2.5 2.5 0 0 1-2.5 2.5H16" fill="none" stroke="#1b6c80" strokeWidth="2.2" />
      <rect x="6" y="9" width="2" height="9" rx="1" fill="#ffffff" />
      <rect x="10.5" y="9" width="2" height="9" rx="1" fill="#ffffff" />
    </svg>
  );
}

export function Shell({
  children,
  network,
  fixture,
}: {
  children: React.ReactNode;
  network: string;
  fixture: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);

  // Escape closes the phone menu and returns focus to its toggle.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <WalletProvider>
      <a href="#main" className="skip">
        Skip to content
      </a>
      <div className="app">
        <div className="brand">
          <Link href="/" onClick={close} className="brand-link">
            <Mark />
            <span>Barkeep</span>
          </Link>
          <button
            ref={toggleRef}
            type="button"
            className="btn ghost menu-toggle"
            aria-expanded={open}
            aria-controls="site-nav"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
        <div className="topbar">
          <p className="net">
            <span className={`dot ${fixture ? "warn" : "pos"}`} aria-hidden="true" />
            <span className="truncate">{network}</span>
          </p>
          <WalletButton />
        </div>
        <nav id="site-nav" className={`sidebar${open ? " open" : ""}`} aria-label="Main">
          <Suspense fallback={<StaticLinks />}>
            <NavLinks onNavigate={close} />
          </Suspense>
          <div className="bottom">
            <span>Cross-realm reputation for Gno.land.</span>
            <a className="link" href={gnowebUrl(REALMS.barkeep)} rel="noreferrer">
              Barkeep realm on gnoweb
            </a>
          </div>
        </nav>
        <main id="main" className="sheet">
          <div className="canvas">{children}</div>
        </main>
      </div>
    </WalletProvider>
  );
}
