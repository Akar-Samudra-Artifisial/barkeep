import type { Metadata } from "next";
import { Suspense } from "react";
import { SourcesTable } from "@/components/sources-table";
import { ReadErrorBlock } from "@/components/states";
import { Empty, SkeletonPanel } from "@/components/ui";
import { getSources } from "@/lib/gno";

export const metadata: Metadata = { title: "Sources" };

export default function SourcesPage() {
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Sources</h1>
          <p className="sub">
            Realms that may attest. A realm registers itself and earns nothing until an admin verifies it; weight scales
            its points and the cap bounds what one address can collect from it.
          </p>
        </div>
      </div>
      <Suspense fallback={<SkeletonPanel label="sources" rows={7} />}>
        <Registry />
      </Suspense>
    </>
  );
}

async function Registry() {
  const r = await getSources();
  if (!r.ok) return <ReadErrorBlock kind={r.kind} message={r.message} what="source registry" />;
  if (r.data.items.length === 0) {
    return <Empty>No realm has registered as a source yet. See Integrate for the two calls a realm needs.</Empty>;
  }
  return <SourcesTable items={r.data.items} />;
}
