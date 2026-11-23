"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ReadErrorKind } from "@/lib/types";

const TITLES: Record<ReadErrorKind, string> = {
  "not-deployed": "This realm is not readable on chain yet",
  network: "The RPC node did not answer",
  chain: "The chain rejected the query",
  parse: "The chain answered in an unexpected shape",
};

const HINTS: Record<ReadErrorKind, string> = {
  "not-deployed":
    "The package is not on this chain yet, or is deployed and still waiting for approval. Nothing is shown until the chain returns real data.",
  network: "Check RPC_URL or try again in a moment.",
  chain: "The query reached the node but failed. The message below comes from the chain.",
  parse: "The realm may be on a different version than this dashboard expects.",
};

export function ReadErrorBlock({ kind, message, what }: { kind: ReadErrorKind; message: string; what: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className={`error-block${kind === "not-deployed" ? " neutral" : ""}`} role="status">
      <strong>
        {TITLES[kind]}: {what}
      </strong>
      <p>{HINTS[kind]}</p>
      <p className="small mono">{message}</p>
      <button type="button" className="btn" onClick={() => start(() => router.refresh())} disabled={pending}>
        {pending ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}
