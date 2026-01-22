import { base58Decode, base58Encode, sha256 } from "@waves/ts-lib-crypto";
import { invokeScript } from "@waves/waves-transactions";
import { accountData } from "@waves/waves-transactions/dist/nodeInteraction.js";
import { FullPoolId, Quote } from "./models.js";
import { IWallet } from "./wallets.js";

export async function fetchOracles(
  poolAddress: string,
  nodeUrl: string,
  match: string | null,
): Promise<string[]> {
  const data = await accountData(
    {
      address: poolAddress,
      match: match || undefined,
    },
    nodeUrl,
  );
  return Object.keys(data).filter((k) => data[k].value);
}

export class AttestedOracle {
  constructor(
    public readonly quotesAddress: string,
    public readonly id: Buffer,
    public readonly pool: FullPoolId,
    public readonly publicKey: Buffer,
  ) {}

  static parse(address: string, key: string): AttestedOracle {
    const [quotesAddress, id, pk] = key.split(":").map(base58Decode);
    const fullPoolId = new FullPoolId(
      address,
      Buffer.concat([quotesAddress, id]),
    );

    return new AttestedOracle(
      base58Encode(quotesAddress),
      Buffer.from(id),
      fullPoolId,
      Buffer.from(pk),
    );
  }

  static fromQuote(quote: Quote, quotesAddress: string, poolAddress: string) {
    const quoteBody = quote.body.toBytes();
    const id = Buffer.from(
      sha256(quoteBody.subarray(0, quoteBody.length - 64)),
    );
    return new AttestedOracle(
      quotesAddress,
      id,
      new FullPoolId(
        poolAddress,
        Buffer.concat([base58Decode(quotesAddress), id]),
      ),
      quote.body.reportData,
    );
  }

  add(quoteId: Buffer, chainId: string, wallet: IWallet) {
    return invokeScript(
      {
        dApp: this.pool.address,
        call: {
          function: "add",
          args: [
            {
              type: "binary",
              value: Buffer.from(base58Decode(this.quotesAddress)).toString(
                "base64",
              ),
            },
            {
              type: "binary",
              value: quoteId.toString("base64"),
            },
          ],
        },
        chainId: chainId,
      },
      wallet.seed,
    );
  }
}

export class AttestedWhitelistOracle {
  constructor(
    public readonly ownerAddress: string,
    public readonly id: Buffer,
    public readonly pool: FullPoolId,
    public readonly publicKey: Buffer,
  ) {}

  static parse(address: string, key: string): AttestedWhitelistOracle {
    const [ownerAddress, id, pk] = key.split(":").map(base58Decode);
    const fullPoolId = new FullPoolId(
      address,
      Buffer.concat([ownerAddress, id]),
    );

    return new AttestedWhitelistOracle(
      base58Encode(ownerAddress),
      Buffer.from(id),
      fullPoolId,
      Buffer.from(pk),
    );
  }

  static fromQuote(
    quote: Quote,
    ownerAddress: string,
    quotesAddress: string,
    poolAddress: string,
  ) {
    const quoteBody = quote.body.toBytes();
    const id = Buffer.from(
      sha256(
        Buffer.concat([
          base58Decode(quotesAddress),
          quoteBody.subarray(0, quoteBody.length - 64),
        ]),
      ),
    );
    return new AttestedWhitelistOracle(
      ownerAddress,
      id,
      new FullPoolId(
        poolAddress,
        Buffer.concat([base58Decode(ownerAddress), id]),
      ),
      quote.body.reportData,
    );
  }

  add(
    quoteId: Buffer,
    quotesAddress: string,
    chainId: string,
    wallet: IWallet,
  ) {
    return invokeScript(
      {
        dApp: this.pool.address,
        call: {
          function: "add",
          args: [
            {
              type: "binary",
              value: Buffer.from(base58Decode(quotesAddress)).toString(
                "base64",
              ),
            },
            {
              type: "binary",
              value: quoteId.toString("base64"),
            },
          ],
        },
        chainId: chainId,
      },
      wallet.seed,
    );
  }

  delete(chainId: string, wallet: IWallet) {
    return invokeScript(
      {
        dApp: this.pool.address,
        call: {
          function: "delete",
          args: [
            {
              type: "binary",
              value: this.id.toString("base64"),
            },
            {
              type: "binary",
              value: this.publicKey.toString("base64"),
            },
          ],
        },
        chainId: chainId,
      },
      wallet.seed,
    );
  }
}

export class PrivateOracle {
  constructor(
    public readonly ownerAddress: string,
    public readonly pool: FullPoolId,
    public readonly publicKey: Buffer,
  ) {}

  static parse(poolAddress: string, key: string): PrivateOracle {
    const [ownerAddress, poolId, pk] = key.split(":").map(base58Decode);
    const fullPoolId = new FullPoolId(
      poolAddress,
      Buffer.concat([ownerAddress, poolId]),
    );

    return new PrivateOracle(
      base58Encode(ownerAddress),
      fullPoolId,
      Buffer.from(pk),
    );
  }

  static make(
    poolAddress: string,
    poolIdSuffix: Buffer,
    publicKey: Buffer,
    ownerAddress: string,
  ) {
    return new PrivateOracle(
      ownerAddress,
      new FullPoolId(
        poolAddress,
        Buffer.concat([base58Decode(ownerAddress), poolIdSuffix]),
      ),
      publicKey,
    );
  }

  add(chainId: string, wallet: IWallet) {
    return invokeScript(
      {
        dApp: this.pool.address,
        call: {
          function: "add",
          args: [
            {
              type: "binary",
              value: this.pool.id.subarray(26).toString("base64"),
            },
            {
              type: "binary",
              value: this.publicKey.toString("base64"),
            },
          ],
        },
        chainId: chainId,
      },
      wallet.seed,
    );
  }

  delete(chainId: string, wallet: IWallet) {
    return invokeScript(
      {
        dApp: this.pool.address,
        call: {
          function: "delete",
          args: [
            {
              type: "binary",
              value: this.pool.id.subarray(26).toString("base64"),
            },
            {
              type: "binary",
              value: this.publicKey.toString("base64"),
            },
          ],
        },
        chainId: chainId,
      },
      wallet.seed,
    );
  }
}
