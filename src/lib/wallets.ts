import { crypto, INonceSeed, seedWithNonce } from "@waves/ts-lib-crypto";
import { TSeedTypes } from "@waves/waves-transactions";
import { getEnvVar } from "./utils.js";

export interface IWallet {
  address: (chainId: string) => string;
  seed: TSeedTypes;
}

class RootWallet implements IWallet {
  constructor(private readonly originalSeed: string) {}

  get seed(): TSeedTypes {
    return this.originalSeed;
  }

  address(chainId: string) {
    const c = crypto({ seed: this.originalSeed, output: "Base58" });
    return c.address(chainId);
  }

  derive(index: number) {
    return new DerivedWallet(seedWithNonce(this.originalSeed, index));
  }
}

class DerivedWallet implements IWallet {
  constructor(private readonly originalSeed: INonceSeed) {}

  get seed(): TSeedTypes {
    const c = crypto({ seed: this.originalSeed, output: "Base58" });
    return { privateKey: c.privateKey() };
  }

  address(chainId: string) {
    const c = crypto({ seed: this.originalSeed, output: "Base58" });
    return c.address(chainId);
  }
}

export const wallet = new RootWallet(getEnvVar("SEED"));
