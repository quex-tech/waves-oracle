import { base58Decode, base58Encode } from "@waves/ts-lib-crypto";
import { DataTransactionEntry } from "@waves/ts-types";
import { invokeScript } from "@waves/waves-transactions";
import { accountData } from "@waves/waves-transactions/dist/nodeInteraction.js";
import { DataItem, FullPoolId, QuexResponse } from "./models.js";
import { parseBinaryEntry } from "./utils.js";
import { IWallet } from "./wallets.js";

export type OracleResponse = {
  actionId: Buffer;
  pool: FullPoolId;
  dataItem: DataItem;
};

export async function fetchResponses(address: string, nodeUrl: string) {
  const data = await accountData({ address: address }, nodeUrl);
  return Object.entries(data).map(([key, value]) => parseResponse(key, value));
}

export function publishResponse(
  res: QuexResponse,
  pool: FullPoolId,
  dApp: string,
  chainId: string,
  wallet: IWallet,
) {
  return invokeScript(
    {
      dApp: dApp,
      call: {
        function: "publish",
        args: [
          { type: "binary", value: res.toBytes().toString("base64") },
          {
            type: "binary",
            value: pool.addressBytes().toString("base64"),
          },
          { type: "binary", value: pool.id.toString("base64") },
        ],
      },
      chainId: chainId,
    },
    wallet.seed,
  );
}

function parseResponse(
  key: string,
  entry: DataTransactionEntry,
): OracleResponse {
  const parts = key.split(":");
  if (parts.length !== 3) {
    throw new Error(`Invalid response key: ${key}`);
  }
  const [actionId, poolAddress, poolId] = parts.map(base58Decode);
  return {
    actionId: Buffer.from(actionId),
    pool: new FullPoolId(base58Encode(poolAddress), Buffer.from(poolId)),
    dataItem: DataItem.fromBytes(parseBinaryEntry(entry)),
  };
}
