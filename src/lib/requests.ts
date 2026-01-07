import { base58Decode, base58Encode, base64Encode } from "@waves/ts-lib-crypto";
import { DataTransactionEntry } from "@waves/ts-types";
import { invokeScript, TSeedTypes } from "@waves/waves-transactions";
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

export type OracleRequest = {
  key: string;
  pool: string;
  actionId: Uint8Array;
  txId: Uint8Array;
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
  nowUnixMs: number,
  reward: number,
  dApp: string,
  chainId: string,
  seed: TSeedTypes,
) {
  const nowUnixSec = Math.floor(nowUnixMs / 1000);
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
            value: pool.toBytes().toString("base64"),
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
            value: nowUnixSec,
          },
          {
            type: "integer",
            value: nowUnixSec + 5 * 60,
          },
        ],
      },
      chainId: chainId,
      payment: [{ amount: reward }],
    },
    seed,
  );
}

export function recycleRequest(
  key: string,
  dApp: string,
  chainId: string,
  seed: TSeedTypes,
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
    seed,
  );
}

export function fulfillRequest(
  res: QuexResponse,
  responsesAddress: string,
  pool: FullPoolId,
  txId: string,
  dApp: string,
  chainId: string,
  seed: TSeedTypes,
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
          { type: "binary", value: pool.toBytes().toString("base64") },
          { type: "binary", value: base64Encode(base58Decode(txId)) },
        ],
      },
      chainId: chainId,
    },
    seed,
  );
}

function parseRequest(key: string, req: Record<string, DataTransactionEntry>) {
  const [responsesAddress, pool, actionId, txId] = key.split(":");
  const action = HttpAction.fromBytes(parseBinaryEntry(req.action));
  if (action.getActionId().compare(base58Decode(actionId)) !== 0) {
    throw new Error("Invalid action ID");
  }
  return {
    key: key,
    responsesAddress: responsesAddress,
    pool: FullPoolId.fromBytes(base58Decode(pool)),
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
