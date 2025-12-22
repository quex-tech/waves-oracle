import { seedWithNonce, crypto } from "@waves/ts-lib-crypto";
import { TSeedTypes } from "@waves/waves-transactions";
import { chainId } from "./network.js";

export type Wallet = {
  address: string;
  seed: TSeedTypes;
};

const seed = getEnvVar("SEED");

export const treasury = deriveWallet(0);
export const oracles = deriveWallet(1);
export const responses = deriveWallet(2);

function deriveWallet(index: number) {
  const s = seedWithNonce(seed, index);
  const c = crypto({ seed: s, output: "Base58" });
  return { address: c.address(chainId), seed: { privateKey: c.privateKey() } };
}

function getEnvVar(name: string) {
  const v = process.env[name];
  if (v == null || v === "") throw new Error(`Missing env var: ${name}`);
  return v;
}
