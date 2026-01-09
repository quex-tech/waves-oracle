import { base58Decode, base58Encode, base64Encode } from "@waves/ts-lib-crypto";
import { DataTransactionEntry } from "@waves/ts-types";
import { invokeScript } from "@waves/waves-transactions";
import { accountData } from "@waves/waves-transactions/dist/nodeInteraction.js";
import {
  FullPoolId,
  HttpAction,
  HttpActionWithProof,
  QuexResponse,
} from "./models.js";
import {
  groupFieldsByKey,
  parseBinaryEntry,
  parseIntegerEntry,
} from "./utils.js";
import { IWallet } from "./wallets.js";

export type OracleRequest = {
  key: string;
  responsesAddress: string;
  pool: FullPoolId;
  actionId: Buffer;
  txId: string;
  action: HttpActionWithProof;
  after: Date;
  before: Date;
  owner: string;
  reward: number;
};

export async function fetchRequests(address: string, nodeUrl: string) {
  const data = await accountData({ address: address }, nodeUrl);
  return Object.entries(groupFieldsByKey(data)).map(([key, value]) =>
    parseRequest(key, value),
  );
}

export async function findRequest(
  key: string,
  address: string,
  nodeUrl: string,
) {
  const data = await accountData(
    { address: address, match: `${escapeRegExp(key)}:.*` },
    nodeUrl,
  );
  const entries = Object.entries(groupFieldsByKey(data));
  if (!entries.length) {
    return null;
  }

  try {
    return parseRequest(entries[0][0], entries[0][1]);
  } catch {
    return null;
  }
}

export function addRequest(
  action: HttpActionWithProof,
  responsesAddress: string,
  pool: FullPoolId,
  afterUnixSec: number,
  beforeUnixSec: number,
  reward: number,
  dApp: string,
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
            value: Buffer.from(base58Decode(responsesAddress)).toString(
              "base64",
            ),
          },
          {
            type: "binary",
            value: pool.addressBytes().toString("base64"),
          },
          {
            type: "binary",
            value: pool.id.toString("base64"),
          },
          {
            type: "binary",
            value: action.action.toBytes().toString("base64"),
          },
          {
            type: "binary",
            value: action.proof.toString("base64"),
          },
          {
            type: "integer",
            value: afterUnixSec,
          },
          {
            type: "integer",
            value: beforeUnixSec,
          },
        ],
      },
      chainId: chainId,
      payment: [{ amount: reward }],
    },
    wallet.seed,
  );
}

export function recycleRequest(
  key: string,
  dApp: string,
  chainId: string,
  wallet: IWallet,
) {
  return invokeScript(
    {
      dApp: dApp,
      call: {
        function: "recycle",
        args: [
          {
            type: "string",
            value: key,
          },
        ],
      },
      chainId: chainId,
    },
    wallet.seed,
  );
}

export function fulfillRequest(
  res: QuexResponse,
  responsesAddress: string,
  pool: FullPoolId,
  txId: string,
  dApp: string,
  chainId: string,
  wallet: IWallet,
) {
  return invokeScript(
    {
      dApp: dApp,
      call: {
        function: "fulfill",
        args: [
          { type: "binary", value: res.toBytes().toString("base64") },
          {
            type: "binary",
            value: base64Encode(base58Decode(responsesAddress)),
          },
          { type: "binary", value: pool.addressBytes().toString("base64") },
          { type: "binary", value: pool.id.toString("base64") },
          { type: "binary", value: base64Encode(base58Decode(txId)) },
        ],
      },
      chainId: chainId,
    },
    wallet.seed,
  );
}

function parseRequest(
  key: string,
  req: Record<string, DataTransactionEntry>,
): OracleRequest {
  const [responsesAddress, poolAddress, poolId, actionId, txId] =
    key.split(":");
  const action = HttpAction.fromBytes(parseBinaryEntry(req.action));
  if (action.getActionId().compare(base58Decode(actionId)) !== 0) {
    throw new Error("Invalid action ID");
  }
  return {
    key: key,
    responsesAddress: responsesAddress,
    pool: new FullPoolId(poolAddress, Buffer.from(base58Decode(poolId))),
    actionId: Buffer.from(base58Decode(actionId)),
    txId: txId,
    action: new HttpActionWithProof(action, parseBinaryEntry(req.proof)),
    after: new Date(parseIntegerEntry(req.after) * 1000),
    before: new Date(parseIntegerEntry(req.before) * 1000),
    owner: base58Encode(parseBinaryEntry(req.owner)),
    reward: parseIntegerEntry(req.reward),
  };
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
