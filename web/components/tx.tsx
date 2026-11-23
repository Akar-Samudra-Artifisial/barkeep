"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { AdenaError, callRealm } from "@/lib/adena";
import { helpUrl } from "@/lib/config";
import { gnokeyCall } from "@/lib/gnokey";
import { useWallet } from "./wallet";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        } catch {
          setDone(false);
        }
      }}
    >
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </button>
  );
}

export function TxFallback({ pkgPath, func, args }: { pkgPath: string; func: string; args: string[] }) {
  const cmd = gnokeyCall(pkgPath, func, args);
  return (
    <details>
      <summary>No Adena? Run it another way</summary>
      <div className="code-block">
        <p className="small">
          Open{" "}
          <a className="link" href={helpUrl(pkgPath, func)} rel="noreferrer">
            {func} on gnoweb
          </a>{" "}
          to call it from the browser, or paste this into a terminal with gnokey.
        </p>
        <div className="code-head">
          <span className="small muted">gnokey, replace mykey with your key name</span>
          <CopyButton text={cmd} label="Copy command" />
        </div>
        <pre>{cmd}</pre>
      </div>
    </details>
  );
}

type Phase = { kind: "idle" } | { kind: "signing" } | { kind: "sent"; hash: string } | { kind: "error"; message: string };

/** Sends one realm call through Adena, connecting first when needed. */
export function useRealmCall(pkgPath: string, func: string) {
  const { address, connect } = useWallet();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const send = useCallback(
    async (args: string[]) => {
      setPhase({ kind: "signing" });
      try {
        const caller = address ?? (await connect());
        if (!caller) {
          setPhase({ kind: "error", message: "Connect Adena first, or use the gnokey command below." });
          return;
        }
        const hash = await callRealm(caller, pkgPath, func, args);
        setPhase({ kind: "sent", hash });
        router.refresh();
      } catch (e) {
        setPhase({ kind: "error", message: e instanceof AdenaError ? e.message : "Adena did not send the transaction." });
      }
    },
    [address, connect, pkgPath, func, router],
  );

  return { phase, send, reset: () => setPhase({ kind: "idle" }) };
}

export function TxStatus({ phase, doneText }: { phase: Phase; doneText: string }) {
  if (phase.kind === "idle") return null;
  if (phase.kind === "signing") return <p className="notice" role="status">Waiting for Adena to sign…</p>;
  if (phase.kind === "error")
    return (
      <p className="notice neg" role="alert">
        {phase.message}
      </p>
    );
  return (
    <p className="notice pos" role="status">
      {doneText}
      {phase.hash && (
        <>
          {" "}
          Transaction <span className="mono">{phase.hash.slice(0, 16)}…</span>
        </>
      )}{" "}
      The board refreshes within about 15 seconds.
    </p>
  );
}
