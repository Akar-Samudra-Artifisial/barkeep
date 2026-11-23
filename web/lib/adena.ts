// Thin client wrapper over the Adena injected provider (window.adena).
// Flow: AddEstablish → GetAccount → check chainId → SwitchNetwork / AddNetwork
// → DoContract with one /vm.m_call message. Adena's DoContract takes no gas or
// deposit field; the chain applies its default deposit.

import { CHAIN_ID, CHAIN_NAME, PUBLIC_RPC_URL } from "./config";

interface AdenaResponse<T = unknown> {
  code?: number;
  status?: "success" | "failure" | string;
  type?: string;
  message?: string;
  data?: T;
}

interface AdenaAccount {
  address: string;
  chainId: string;
  status?: string;
}

interface MsgCall {
  type: "/vm.m_call";
  value: { caller: string; send: string; pkg_path: string; func: string; args: string[] };
}

interface AdenaProvider {
  AddEstablish(name: string): Promise<AdenaResponse>;
  GetAccount(): Promise<AdenaResponse<AdenaAccount>>;
  SwitchNetwork(chainId: string): Promise<AdenaResponse>;
  AddNetwork(net: { chainId: string; chainName: string; rpcUrl: string }): Promise<AdenaResponse>;
  DoContract(tx: { messages: MsgCall[]; memo?: string }): Promise<AdenaResponse<{ hash?: string }>>;
}

declare global {
  interface Window {
    adena?: AdenaProvider;
  }
}

export class AdenaError extends Error {}

export function getAdena(): AdenaProvider | null {
  return typeof window !== "undefined" && window.adena ? window.adena : null;
}

function failed(r: AdenaResponse | undefined): boolean {
  return !r || (r.status !== undefined && r.status !== "success");
}

function reason(r: AdenaResponse | undefined, fallback: string): string {
  return r?.message || r?.type || fallback;
}

/** Connects, makes sure Adena is on CHAIN_ID, and returns the account address. */
export async function connect(): Promise<string> {
  const adena = getAdena();
  if (!adena) throw new AdenaError("Adena is not installed in this browser.");
  const est = await adena.AddEstablish("Barkeep");
  if (failed(est) && est?.type !== "ALREADY_CONNECTED") {
    throw new AdenaError(reason(est, "Connection was declined in Adena."));
  }
  let acct = await adena.GetAccount();
  if (failed(acct) || !acct.data?.address) throw new AdenaError(reason(acct, "Adena returned no account."));
  if (acct.data.chainId !== CHAIN_ID) {
    let sw = await adena.SwitchNetwork(CHAIN_ID);
    if (failed(sw)) {
      const add = await adena.AddNetwork({ chainId: CHAIN_ID, chainName: CHAIN_NAME, rpcUrl: PUBLIC_RPC_URL });
      if (failed(add)) throw new AdenaError(reason(add, `Add the ${CHAIN_ID} network in Adena first.`));
      sw = await adena.SwitchNetwork(CHAIN_ID);
      if (failed(sw)) throw new AdenaError(reason(sw, `Switch Adena to ${CHAIN_ID} and try again.`));
    }
    acct = await adena.GetAccount();
    if (failed(acct) || !acct.data?.address) throw new AdenaError(reason(acct, "Adena returned no account."));
  }
  return acct.data.address;
}

/** Address of an already-approved site, without prompting. */
export async function currentAccount(): Promise<string | null> {
  const adena = getAdena();
  if (!adena) return null;
  try {
    const acct = await adena.GetAccount();
    return !failed(acct) && acct.data?.address ? acct.data.address : null;
  } catch {
    return null;
  }
}

export async function callRealm(caller: string, pkgPath: string, func: string, args: string[]): Promise<string> {
  const adena = getAdena();
  if (!adena) throw new AdenaError("Adena is not installed in this browser.");
  const res = await adena.DoContract({
    messages: [{ type: "/vm.m_call", value: { caller, send: "", pkg_path: pkgPath, func, args } }],
    memo: "barkeep",
  });
  if (failed(res)) throw new AdenaError(reason(res, "The transaction was rejected."));
  return res.data?.hash ?? "";
}
