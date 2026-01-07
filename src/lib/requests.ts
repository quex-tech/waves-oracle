import { base58Decode, base58Encode } from "@waves/ts-lib-crypto";
import { DataTransactionEntry } from "@waves/ts-types";
import { accountData } from "@waves/waves-transactions/dist/nodeInteraction.js";
import { HttpAction, HttpActionWithProof } from "./models.js";
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
  const currentData = await accountData(
    { address: address, match: `${escapeRegExp(key)}:.*` },
    nodeUrl,
  );
  const req: Record<string, DataTransactionEntry> = {};

  for (const k of Object.keys(currentData)) {
    const parts = k.split(":");
    if (parts.length !== 4) {
      continue;
    }
    req[parts[3]] = currentData[k];
  }

  try {
    return parseRequest(key, req);
  } catch {
    return null;
  }
}

function parseRequest(key: string, req: Record<string, DataTransactionEntry>) {
  const [pool, actionId, txId] = key.split(":").map(base58Decode);
  const action = HttpAction.fromBytes(parseBinaryEntry(req.action));
  if (action.getActionId().compare(actionId) !== 0) {
    throw new Error("Invalid action ID");
  }
  return {
    key: key,
    pool: base58Encode(pool),
    actionId: actionId,
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
