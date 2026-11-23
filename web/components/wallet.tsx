"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AdenaError, connect as adenaConnect, currentAccount, getAdena } from "@/lib/adena";
import { shortAddr } from "@/lib/format";

type Status = "idle" | "connecting" | "connected" | "missing" | "error";

interface WalletState {
  address: string | null;
  status: Status;
  error: string | null;
  connect: () => Promise<string | null>;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Adena injects after load; look once without prompting.
    const t = window.setTimeout(async () => {
      if (!getAdena()) return;
      const a = await currentAccount();
      if (!cancelled && a) {
        setAddress(a);
        setStatus("connected");
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, []);

  const connect = useCallback(async () => {
    if (!getAdena()) {
      setStatus("missing");
      setError("Adena is not installed. Use the gnokey command instead, or install Adena.");
      return null;
    }
    setStatus("connecting");
    setError(null);
    try {
      const a = await adenaConnect();
      setAddress(a);
      setStatus("connected");
      return a;
    } catch (e) {
      setStatus("error");
      setError(e instanceof AdenaError ? e.message : "Adena did not respond.");
      return null;
    }
  }, []);

  const value = useMemo(() => ({ address, status, error, connect }), [address, status, error, connect]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet outside WalletProvider");
  return ctx;
}

export function WalletButton() {
  const { address, status, error, connect } = useWallet();
  if (address) {
    return (
      <Link className="btn" href={`/profile/${address}`} title={address}>
        <span className="dot pos" aria-hidden="true" />
        <span className="mono">{shortAddr(address, 6, 4)}</span>
        <span className="visually-hidden">, connected. Open your profile</span>
      </Link>
    );
  }
  const failed = status === "missing" || status === "error";
  return (
    <div className="wallet">
      <p className="wallet-msg small" role="status" aria-live="polite">
        {failed ? (status === "missing" ? "Adena not found" : (error ?? "Connection failed")) : ""}
      </p>
      <button
        type="button"
        className="btn primary"
        onClick={connect}
        disabled={status === "connecting"}
        aria-busy={status === "connecting" || undefined}
      >
        {status === "connecting" ? "Connecting…" : "Connect Adena"}
      </button>
    </div>
  );
}
