import {
  DataTransactionEntry,
  SignedTransaction,
  Transaction,
  WithId,
} from "@waves/ts-types";
import { broadcast, waitForTx } from "@waves/waves-transactions";
import { nodeUrl } from "./network.js";

export const wvs = 10 ** 8;

function removePrefix(s: string, p: string): string {
  return s.startsWith(p) ? s.slice(p.length) : s;
}

function hexToBuffer(hex: string): Buffer {
  return Buffer.from(removePrefix(hex, "0x"), "hex");
}

function getEnvVar(name: string) {
  const v = process.env[name];
  if (v == null || v === "") throw new Error(`Missing env var: ${name}`);
  return v;
}

async function handleTx(
  tx: SignedTransaction<Transaction> & WithId,
  apply: boolean,
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

function asOptionalStringArg(
  val: string | boolean | undefined,
): string | undefined {
  if (typeof val === "string") {
    return val;
  }
  return undefined;
}

function asStringArg(val: string | boolean): string {
  if (typeof val === "string") {
    return val;
  }
  return "";
}

function parseBinaryEntry(entry: DataTransactionEntry) {
  if (entry.type !== "binary") {
    throw Error("Invalid binary entry");
  }
  if (entry.value.startsWith("base64:")) {
    return Buffer.from(entry.value.slice("base64:".length), "base64");
  }
  return Buffer.from(entry.value, "base64");
}

function parseIntegerEntry(entry: DataTransactionEntry) {
  if (entry.type !== "integer") {
    throw Error("Invalid integer entry");
  }

  if (typeof entry.value === "string") {
    throw Error("Integer is too large");
  }

  return entry.value;
}

export {
  asOptionalStringArg,
  asStringArg,
  getEnvVar,
  handleTx,
  hexToBuffer,
  parseBinaryEntry,
  parseIntegerEntry,
  removePrefix,
};
