import { base58Decode } from "@waves/ts-lib-crypto";
import { invokeScript } from "@waves/waves-transactions";
import { accountData } from "@waves/waves-transactions/dist/nodeInteraction.js";
import { FullPoolId } from "./models.js";
import { Wallet } from "./wallets.js";

type Oracle = {
  pool: FullPoolId;
  publicKey: Buffer;
};

export async function fetchOracles(
  dApp: string,
  nodeUrl: string,
): Promise<Oracle[]> {
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
  wallet: Wallet,
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

function parseOracle(address: string, key: string): Oracle {
  const [ownerAddress, poolId, pk] = key.split(":").map(base58Decode);
  const fullPoolId = new FullPoolId(
    address,
    Buffer.concat([ownerAddress, poolId]),
  );

  return {
    pool: fullPoolId,
    publicKey: Buffer.from(pk),
  };
}
