import { crypto, seedWithNonce } from "@waves/ts-lib-crypto";
import { TSeedTypes } from "@waves/waves-transactions";
import { chainId } from "./network.js";
import { getEnvVar } from "./utils.js";

export type Wallet = {
  address: string;
  seed: TSeedTypes;
};

const seed = getEnvVar("SEED");

export const treasury = deriveWallet(0);
export const privatePools = deriveWallet(1);
export const responses = deriveWallet(2);
export const requests = deriveWallet(3);
export const quotes = deriveWallet(4);
export const attestedPools = deriveWallet(5);

function deriveWallet(index: number) {
  const s = seedWithNonce(seed, index);
  const c = crypto({ seed: s, output: "Base58" });
  return { address: c.address(chainId), seed: { privateKey: c.privateKey() } };
}
