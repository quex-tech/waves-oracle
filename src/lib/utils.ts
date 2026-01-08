import {
  DataTransactionEntry,
  SignedTransaction,
  Transaction,
  WithId,
} from "@waves/ts-types";
import { broadcast, waitForTx } from "@waves/waves-transactions";

export const wvs = 10 ** 8;

export function removePrefix(s: string, p: string): string {
  return s.startsWith(p) ? s.slice(p.length) : s;
}

export function hexToBuffer(hex: string): Buffer {
  return Buffer.from(removePrefix(hex, "0x"), "hex");
}

export function getEnvVar(name: string) {
  const v = process.env[name];
  if (v == null || v === "") throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function handleTx(
  tx: SignedTransaction<Transaction> & WithId,
  apply: boolean,
  nodeUrl: string,
) {
  console.log("Transaction:", tx);
  if (!apply) {
    console.log("Add --apply to submit the transaction.");
    return;
  }

  await broadcast(tx, nodeUrl);
  console.log("Transaction submitted.");
  console.log("Waiting for confirmation...");
  await waitForTx(tx.id, { apiBase: nodeUrl });
  console.log("Transaction confirmed.");
}

export function asOptionalStringArg(
  val: string | boolean | undefined,
): string | undefined {
  if (typeof val === "string") {
    return val;
  }
  return undefined;
}

export function asStringArg(val: string | boolean): string {
  if (typeof val === "string") {
    return val;
  }
  return "";
}

export function parseBinaryEntry(entry: DataTransactionEntry) {
  if (entry.type !== "binary") {
    throw Error("Invalid binary entry");
  }
  if (entry.value.startsWith("base64:")) {
    return Buffer.from(entry.value.slice("base64:".length), "base64");
  }
  return Buffer.from(entry.value, "base64");
}

export function parseIntegerEntry(entry: DataTransactionEntry) {
  if (entry.type !== "integer") {
    throw Error("Invalid integer entry");
  }

  if (typeof entry.value === "string") {
    throw Error("Integer is too large");
  }

  return entry.value;
}

export function groupFieldsByKey(data: Record<string, DataTransactionEntry>) {
  const res: Record<string, Record<string, DataTransactionEntry>> = {};
  for (const [key, val] of Object.entries(data)) {
    const lastSepIdx = key.lastIndexOf(":");
    const field = key.slice(lastSepIdx + 1);
    (res[key.slice(0, lastSepIdx)] ||= {})[field] = val;
  }
  return res;
}
