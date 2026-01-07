import { base58Decode, base58Encode } from "@waves/ts-lib-crypto";
import { invokeScript } from "@waves/waves-transactions";
import { accountData } from "@waves/waves-transactions/dist/nodeInteraction.js";
import { FullPoolId } from "./models.js";
import { Wallet } from "./wallets.js";

type AttestedOracle = {
  quotesAddress: string;
  id: Buffer;
  pool: FullPoolId;
  publicKey: Buffer;
};

export async function fetchOracles(
  dApp: string,
  nodeUrl: string,
): Promise<AttestedOracle[]> {
  const data = await accountData({ address: dApp }, nodeUrl);
  return Object.keys(data)
    .filter((k) => data[k].value)
    .map((key) => parseOracle(dApp, key));
}

export function addOracle(
  quotesAddress: string,
  quoteId: Buffer,
  dApp: string,
  chainId: string,
  wallet: Wallet,
) {
  return invokeScript(
    {
      dApp: dApp,
      call: {
        function: "add",
        args: [
          {
            type: "binary",
            value: Buffer.from(base58Decode(quotesAddress)).toString("base64"),
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

function parseOracle(address: string, key: string): AttestedOracle {
  const [quotesAddress, id, pk] = key.split(":").map(base58Decode);
  const fullPoolId = new FullPoolId(
    address,
    Buffer.concat([quotesAddress, id]),
  );

  return {
    quotesAddress: base58Encode(quotesAddress),
    id: Buffer.from(id),
    pool: fullPoolId,
    publicKey: Buffer.from(pk),
  };
}
