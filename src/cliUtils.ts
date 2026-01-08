import type { SignedTransaction, Transaction, WithId } from "@waves/ts-types";
import { broadcast, waitForTx } from "@waves/waves-transactions";
import fs from "fs";
import {
  HttpActionWithProof,
  HttpRequest,
  isHttpMethod,
  UnencryptedHttpAction,
  UnencryptedHttpPrivatePatch,
} from "./lib/models.js";

export async function handleTx(
  tx: SignedTransaction<Transaction> & WithId,
  apply: boolean,
  nodeUrl: string,
) {
  console.log("Transaction:", tx);
  if (!apply) {
    console.log("Add --apply to submit the transaction.");
    return;
  }

  await broadcast(tx, nodeUrl);
  console.log("Transaction submitted.");
  console.log("Waiting for confirmation...");
  await waitForTx(tx.id, { apiBase: nodeUrl });
  console.log("Transaction confirmed.");
}

export const httpActionOptions = {
  request: {
    type: "string",
    default: "GET",
    short: "X",
  },
  header: {
    type: "string",
    multiple: true,
    short: "H",
  },
  data: {
    type: "string",
    short: "d",
  },
  "enc-url-suffix": {
    type: "string",
  },
  "enc-header": {
    type: "string",
    multiple: true,
  },
  "enc-data": {
    type: "string",
  },
  filter: {
    type: "string",
    short: "f",
    default: ".",
  },
  "from-file": {
    type: "string",
  },
} as const;

type ParsedHttpActionValues = {
  request: string;
  header?: string[];
  data?: string;
  "enc-url-suffix"?: string;
  "enc-header"?: string[];
  "enc-data"?: string;
  filter: string;
  "from-file"?: string;
};

export function parseHttpAction(
  values: ParsedHttpActionValues,
  positionals: string[],
) {
  if (!isHttpMethod(values.request)) {
    throw new Error(`Unsupported HTTP method: ${values.request}`);
  }

  if (values["from-file"]) {
    return HttpActionWithProof.fromBytes(
      Buffer.from(
        fs.readFileSync(values["from-file"], {
          encoding: "utf-8",
        }),
        "base64",
      ),
    );
  }

  if (!positionals[0]) {
    throw new Error("URL is reqiured");
  }

  if (!positionals[1]) {
    throw new Error("Schema is reqiured");
  }

  return new UnencryptedHttpAction(
    HttpRequest.fromParts(
      values.request,
      positionals[0],
      values.header || [],
      values.data || "",
    ),
    UnencryptedHttpPrivatePatch.fromParts(
      values["enc-url-suffix"] || null,
      values["enc-header"] || null,
      values["enc-data"] || null,
    ),
    positionals[1],
    values.filter,
  );
}
