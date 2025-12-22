import { SignedTransaction, Transaction, WithId } from "@waves/ts-types";
import { broadcast, waitForTx } from "@waves/waves-transactions";
import { nodeUrl } from "./network.js";

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
  apply: boolean
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

export { hexToBuffer, getEnvVar, handleTx };
