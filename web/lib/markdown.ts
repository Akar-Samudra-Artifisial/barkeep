// Small parsers for the Render() markdown of townhall and lounge, which have
// no JSON readers. Cells are escaped with sanitize.TableCell on chain.

import type { LoungeEntry, Poll, PollDetail } from "./types";

/** Split one markdown table row into cells, honouring backslash escapes. */
export function splitRow(line: string): string[] | null {
  const t = line.trim();
  if (!t.startsWith("|") || !t.endsWith("|")) return null;
  const cells: string[] = [];
  let cur = "";
  for (let i = 1; i < t.length; i++) {
    const c = t[i];
    if (c === "\\" && i + 1 < t.length) {
      cur += c + t[i + 1];
      i++;
      continue;
    }
    if (c === "|") {
      cells.push(unescapeCell(cur.trim()));
      cur = "";
      continue;
    }
    cur += c;
  }
  return cells;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

export function unescapeCell(s: string): string {
  return s
    .replace(/\\(.)/g, "$1")
    .replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m);
}

function tableRows(md: string): string[][] {
  const rows: string[][] = [];
  for (const line of md.split("\n")) {
    const cells = splitRow(line);
    if (!cells) continue;
    if (cells.every((c) => /^-+$/.test(c))) continue; // separator
    rows.push(cells);
  }
  return rows.slice(1); // drop header
}

/** townhall Render("") → newest-first poll rows. */
export function parsePollList(md: string): Poll[] {
  const out: Poll[] = [];
  for (const cells of tableRows(md)) {
    if (cells.length < 3) continue;
    const id = Number(/^\[(\d+)\]/.exec(cells[0])?.[1]);
    const votes = Number(cells[2]);
    if (!Number.isFinite(id) || !Number.isFinite(votes)) continue;
    out.push({ id, question: cells[1], votes });
  }
  return out;
}

/** townhall Render("poll/<id>") → poll with option tallies. */
export function parsePoll(md: string, id: number): PollDetail | null {
  if (md.startsWith("# Not found")) return null;
  const question = /^\*\*(.*)\*\*$/m.exec(md)?.[1] ?? "";
  const opened = /Opened by \[([^\]]+)\]\([^)]*\) at block (\d+)/.exec(md);
  const options = tableRows(md)
    .filter((c) => c.length >= 3)
    .map((c) => ({ index: Number(c[0]), label: c[1], votes: Number(c[2]) }))
    .filter((o) => Number.isFinite(o.index) && Number.isFinite(o.votes));
  return {
    id,
    question: unescapeCell(question),
    author: opened?.[1] ?? "",
    height: Number(opened?.[2] ?? 0),
    options,
  };
}

/** lounge Render("") → kept entries, newest first. */
export function parseLounge(md: string): LoungeEntry[] {
  return tableRows(md)
    .filter((c) => c.length >= 4)
    .map((c) => ({ height: Number(c[0]), patron: c[1], tier: c[2], message: c[3] }))
    .filter((e) => Number.isFinite(e.height));
}
