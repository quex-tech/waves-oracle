import { accountData } from "@waves/waves-transactions/dist/nodeInteraction.js";
import { DataTransactionEntry } from "@waves/ts-types";
import { chainId, nodeUrl } from "./network.js";
import { requests, treasury, oracles } from "./wallets.js";
import { base58Decode, base58Encode, base64Encode } from "@waves/ts-lib-crypto";
import { parseHttpAction } from "./httpAction.js";
import { SignerClient } from "./signer.js";
import { keygen } from "@noble/secp256k1";
import { asStringArg, handleTx, parseBinaryEntry } from "./utils.js";
import { invokeScript } from "@waves/waves-transactions";
import { HttpAction, HttpActionWithProof } from "./models.js";
import { parseArgs } from "node:util";

const wvs = 10 ** 8;

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "list":
    await list();
    break;
  case "add":
    await add(rest);
    break;
  case "recycle":
    await recycle(rest);
    break;
  case "fulfill":
    await fulfill(rest);
    break;
  default:
    console.log(
      `Usage: ${process.argv[0]} ${process.argv[1]} list|add|recycle|fulfill`
    );
    break;
}

async function list() {
  const currentData = await accountData({ address: requests.address }, nodeUrl);
  const groupedData: Record<string, Record<string, DataTransactionEntry>> = {};

  for (const k of Object.keys(currentData)) {
    const parts = k.split(":");
    if (parts.length !== 4) {
      continue;
    }
    const [pool, actionId, txId, field] = parts;
    (groupedData[[pool, actionId, txId].join(":")] ||= {})[field] =
      currentData[k];
  }

  for (const k of Object.keys(groupedData)) {
    console.log("- Key:    ", k);
    const req = groupedData[k];
    const action = HttpAction.fromBytes(parseBinaryEntry(req.action));
    console.log("  Request:", action.request.formatMethodAndUrl());
    if (action.request.headers.length) {
      console.log("  Headers:");
      for (const h of action.request.headers) {
        console.log(`  - ${h.key}: ${h.value}`);
      }
    }
    if (action.request.body.length) {
      console.log("  Body:   ", action.request.body);
    }
    console.log("  Filter: ", action.filter);
    console.log("  Schema: ", action.schema);
    console.log(
      "  After:  ",
      new Date(Number(req.after.value) * 1000).toISOString()
    );
    console.log(
      "  Before: ",
      new Date(Number(req.before.value) * 1000).toISOString()
    );
    console.log("  Owner:  ", base58Encode(parseBinaryEntry(req.owner)));
    console.log(`  Reward:  ${Number(req.reward.value) / wvs} WAVES`);
  }
}

async function add(rest: string[]) {
  const { values } = parseArgs({
    options: {
      "oracle-url": {
        type: "string",
        default: process.env["ORACLE_URL"],
      },
      pool: {
        type: "string",
        default: oracles.address,
      },
      apply: {
        type: "boolean",
      },
      help: {
        type: "boolean",
        short: "h",
      },
    },
    strict: false,
  });

  const action = parseHttpAction(rest);
  const signerClient = new SignerClient(
    asStringArg(values["oracle-url"] || "")
  );

  const tdPublicKey = await signerClient.publicKey();
  const senderPrivKey = keygen().secretKey;

  const actionWithProof =
    action instanceof HttpActionWithProof
      ? action
      : action
          .encrypt(tdPublicKey, await signerClient.address(), senderPrivKey)
          .addProof(tdPublicKey, senderPrivKey);

  const now = Math.floor(Date.now() / 1000);
  const tx = invokeScript(
    {
      dApp: requests.address,
      call: {
        function: "add",
        args: [
          {
            type: "binary",
            value: Buffer.from(base58Decode(asStringArg(values.pool))).toString(
              "base64"
            ),
          },
          {
            type: "binary",
            value: actionWithProof.action.toBytes().toString("base64"),
          },
          {
            type: "binary",
            value: actionWithProof.proof.toString("base64"),
          },
          {
            type: "integer",
            value: now,
          },
          {
            type: "integer",
            value: now + 5 * 60,
          },
        ],
      },
      chainId: chainId,
      payment: [{ amount: 0.01 * wvs }],
    },
    treasury.seed
  );
  await handleTx(tx, Boolean(values.apply));
  console.log(
    `Key: ${asStringArg(values.pool)}:${base58Encode(
      actionWithProof.action.getActionId()
    )}:${tx.id}`
  );
}

async function recycle(rest: string[]) {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      apply: {
        type: "boolean",
      },
    },
    allowPositionals: true,
  });
  if (!positionals[0]) {
    console.log(`Usage: ${process.argv[0]} ${process.argv[1]} recycle <key>`);
    process.exit(1);
  }
  await handleTx(
    invokeScript(
      {
        dApp: requests.address,
        call: {
          function: "recycle",
          args: [
            {
              type: "string",
              value: positionals[0],
            },
          ],
        },
        chainId: chainId,
      },
      treasury.seed
    ),
    Boolean(values.apply)
  );
}

async function fulfill(rest: string[]) {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      "oracle-url": {
        type: "string",
        default: process.env["ORACLE_URL"],
      },
      apply: {
        type: "boolean",
      },
      help: {
        type: "boolean",
        short: "h",
      },
    },
    allowPositionals: true,
  });

  const key = positionals[0];
  const keyParts = key.split(":");
  const [pool, actionId, txId] = keyParts.map(base58Decode);
  const currentData = await accountData(
    { address: requests.address, match: `${escapeRegExp(key)}:.*` },
    nodeUrl
  );
  const action = currentData[`${key}:action`];
  const proof = currentData[`${key}:proof`];
  if (!action || !proof) {
    throw new Error("Request is not found");
  }
  const actionWithProof = new HttpActionWithProof(
    HttpAction.fromBytes(parseBinaryEntry(action)),
    parseBinaryEntry(proof)
  );
  if (actionWithProof.action.getActionId().compare(actionId) !== 0) {
    throw new Error("Invalid action ID");
  }
  const signerClient = new SignerClient(String(values["oracle-url"]));
  const res = await signerClient.query(
    actionWithProof,
    base58Decode(treasury.address)
  );
  await handleTx(
    invokeScript(
      {
        dApp: requests.address,
        call: {
          function: "fulfill",
          args: [
            { type: "binary", value: res.toBytes().toString("base64") },
            { type: "binary", value: base64Encode(pool) },
            { type: "binary", value: base64Encode(txId) },
          ],
        },
        chainId: chainId,
      },
      treasury.seed
    ),
    Boolean(values.apply)
  );
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
