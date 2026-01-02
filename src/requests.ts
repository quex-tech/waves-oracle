import { keygen } from "@noble/secp256k1";
import { base58Decode, base58Encode, base64Encode } from "@waves/ts-lib-crypto";
import { invokeScript } from "@waves/waves-transactions";
import { parseArgs } from "node:util";
import { parseHttpAction } from "./httpAction.js";
import { HttpActionWithProof } from "./lib/models.js";
import { chainId, nodeUrl } from "./lib/network.js";
import { fetchRequests, findRequest } from "./lib/requests.js";
import { SignerClient } from "./lib/signer.js";
import {
  asOptionalStringArg,
  asStringArg,
  handleTx,
  wvs,
} from "./lib/utils.js";
import { oracles, requests, treasury } from "./lib/wallets.js";

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
      `Usage: ${process.argv[0]} ${process.argv[1]} list|add|recycle|fulfill`,
    );
    break;
}

async function list() {
  for (const req of await fetchRequests(requests.address, nodeUrl)) {
    console.log("- Key:    ", req.key);
    console.log("  Request:", req.action.action.request.formatMethodAndUrl());
    if (
      req.action.action.request.headers.length ||
      req.action.action.patch.headers.length
    ) {
      console.log("  Headers:");
      for (const h of req.action.action.request.headers) {
        console.log(`  - ${h.key}: ${h.value}`);
      }
      for (const h of req.action.action.patch.headers) {
        console.log(`  - ${h.key}: <encrypted>`);
      }
    }
    if (req.action.action.patch.body.length) {
      console.log("  Body:    <encrypted>");
    } else if (req.action.action.request.body.length) {
      console.log("  Body:   ", req.action.action.request.body);
    }
    console.log("  Filter: ", req.action.action.filter);
    console.log("  Schema: ", req.action.action.schema);
    console.log("  After:  ", req.after.toISOString());
    console.log("  Before: ", req.before.toISOString());
    console.log("  Owner:  ", req.owner);
    console.log(`  Reward:  ${req.reward / wvs} WAVES`);
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

  function printHelp() {
    console.log(`Usage:
 ${process.argv[0]} ${process.argv[1]} add [options] <url> <schema>
 ${process.argv[0]} ${process.argv[1]} add --from-file <path> [options]
 <schema>                       Schema to encode response body. Examples: "int", "(string,(int,bool[]))"
 -X, --request <method>         Specify request method to use. Default: GET
 -H, --header <header>          Pass custom header(s) to server. Example: "Content-Type: application/json"
 -d, --data <data>              HTTP POST data
     --enc-url-suffix <suffix>  URL suffix to append and send encrypted. Examples: /sec, ?sec=1&enc=2, /sec?enc=a
     --enc-header <header>      Pass custom header(s) to server encrypted
     --enc-data <data>          HTTP POST data to send encrypted
 -f, --filter                   jq filter to transform response body. Default: .
     --output-request <path>    Save base64-encoded request into a file
     --from-file <path>         Use request from file
     --oracle-url <url>         Base URL of the oracle API
     --pool <address>           Address of the oracle pool script with isInPool method. Default: ${oracles.address}
     --apply                    Actually submit the transaction
 -h, --help                     Show this help message and exit`);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const action = (function () {
    try {
      return parseHttpAction(rest);
    } catch (e) {
      if (e instanceof Error) {
        console.log(e.message);
      }
      printHelp();
      process.exit(1);
    }
  })();

  const oracleUrl = asOptionalStringArg(values["oracle-url"]);
  if (!oracleUrl) {
    console.log("--oracle-url is required");
    printHelp();
    process.exit(1);
  }

  const signerClient = new SignerClient(oracleUrl);
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
              "base64",
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
    treasury.seed,
  );
  await handleTx(tx, Boolean(values.apply));
  console.log(
    `Key: ${asStringArg(values.pool)}:${base58Encode(
      actionWithProof.action.getActionId(),
    )}:${tx.id}`,
  );
}

async function recycle(rest: string[]) {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
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

  function printHelp() {
    console.log(
      `Usage: ${process.argv[0]} ${process.argv[1]} recycle [options] <key>
     --apply             Actually submit the transaction
 -h, --help              Show this help message and exit`,
    );
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (!positionals[0]) {
    printHelp();
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
      treasury.seed,
    ),
    Boolean(values.apply),
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

  function printHelp() {
    console.log(
      `Usage: ${process.argv[0]} ${process.argv[1]} fulfill [options] <key>
     --oracle-url <url>  Base URL of the oracle API
     --apply             Actually submit the transaction
 -h, --help              Show this help message and exit`,
    );
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }
  if (!positionals[0]) {
    printHelp();
    process.exit(1);
  }
  const oracleUrl = values["oracle-url"];
  if (!oracleUrl) {
    console.log("--oracle-url is required");
    printHelp();
    process.exit(1);
  }

  const key = positionals[0];
  const req = await findRequest(key, requests.address, nodeUrl);
  if (!req) {
    throw new Error("Request is not found");
  }

  const signerClient = new SignerClient(oracleUrl);
  const res = await signerClient.query(
    req.action,
    base58Decode(treasury.address),
  );
  await handleTx(
    invokeScript(
      {
        dApp: requests.address,
        call: {
          function: "fulfill",
          args: [
            { type: "binary", value: res.toBytes().toString("base64") },
            { type: "binary", value: base64Encode(base58Decode(req.pool)) },
            { type: "binary", value: base64Encode(req.txId) },
          ],
        },
        chainId: chainId,
      },
      treasury.seed,
    ),
    Boolean(values.apply),
  );
}
