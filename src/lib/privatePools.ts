import { base58Decode, base58Encode } from "@waves/ts-lib-crypto";
import { invokeScript } from "@waves/waves-transactions";
import { accountData } from "@waves/waves-transactions/dist/nodeInteraction.js";
import { FullPoolId } from "./models.js";
import { IWallet } from "./wallets.js";

type PrivateOracle = {
  ownerAddress: string;
  pool: FullPoolId;
  publicKey: Buffer;
};

export async function fetchOracles(
  dApp: string,
  nodeUrl: string,
): Promise<PrivateOracle[]> {
  const data = await accountData({ address: dApp }, nodeUrl);
  return Object.keys(data)
    .filter((k) => data[k].value)
    .map((key) => parseOracle(dApp, key));
}

export function addOracle(
  dApp: string,
  poolIdSuffix: Buffer,
  publicKey: Buffer,
  chainId: string,
  wallet: IWallet,
) {
  return invokeScript(
    {
      dApp: dApp,
      call: {
        function: "add",
        args: [
          {
            type: "binary",
            value: poolIdSuffix.toString("base64"),
          },
          {
            type: "binary",
            value: publicKey.toString("base64"),
          },
        ],
      },
      chainId: chainId,
    },
    wallet.seed,
  );
}

export function deleteOracle(
  dApp: string,
  poolIdSuffix: Buffer,
  publicKey: Buffer,
  chainId: string,
  wallet: IWallet,
) {
  return invokeScript(
    {
      dApp: dApp,
      call: {
        function: "delete",
        args: [
          {
            type: "binary",
            value: poolIdSuffix.toString("base64"),
          },
          {
            type: "binary",
            value: publicKey.toString("base64"),
          },
        ],
      },
      chainId: chainId,
    },
    wallet.seed,
  );
}

function parseOracle(address: string, key: string): PrivateOracle {
  const [ownerAddress, poolId, pk] = key.split(":").map(base58Decode);
  const fullPoolId = new FullPoolId(
    address,
    Buffer.concat([ownerAddress, poolId]),
  );

  return {
    ownerAddress: base58Encode(ownerAddress),
    pool: fullPoolId,
    publicKey: Buffer.from(pk),
  };
}
