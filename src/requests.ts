import { keygen } from "@noble/secp256k1";
import { base58Decode, base58Encode } from "@waves/ts-lib-crypto";
import { parseArgs } from "node:util";
import { handleTx } from "./cliUtils.js";
import { httpActionOptions, parseHttpAction } from "./cliUtils.js";
import { NetworkConfig } from "./lib/config.js";
import {
  ANY_TD_ADDRESS,
  FullPoolId,
  HttpActionWithProof,
} from "./lib/models.js";
import {
  addRequest,
  fetchRequests,
  findRequest,
  fulfillRequest,
  recycleRequest,
} from "./lib/requests.js";
import { SignerClient } from "./lib/signer.js";
import { wvs } from "./lib/utils.js";
import { wallet } from "./lib/wallets.js";

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "list":
    await list(rest);
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

async function list(rest: string[]) {
  const { values } = parseArgs({
    args: rest,
    options: {
      config: {
        type: "string",
        default: "./config.json",
      },
      chain: {
        type: "string",
        default: "R",
      },
      help: {
        type: "boolean",
        short: "h",
      },
    },
  });

  function printHelp() {
    console.log(
      `Usage: ${process.argv[0]} ${process.argv[1]} list [options]
     --config <path>     Path to config.json. Default: ./config.json
     --chain <id>        Chain ID. Default: R
 -h, --help              Show this help message and exit`,
    );
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }
  const network = await NetworkConfig.fromArgs(values.config, values.chain);
  const nodeUrl = network.getNodeUrl();
  for (const req of await fetchRequests(network.dApps.requests, nodeUrl)) {
    console.log(`- Key:                ${req.key}
  Responses Address:  ${req.responsesAddress}
  Pool:
    Address:          ${req.pool.address}
    ID:               ${req.pool.formatId()}
  Action ID:          ${req.actionId.toString("hex")}
  Tx ID:              ${req.txId}
  Request:            ${req.action.action.request.formatMethodAndUrl()}`);
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
    console.log(`  Filter:             ${req.action.action.filter}
  Schema:             ${req.action.action.schema}
  After:              ${req.after.toISOString()}
  Before:             ${req.before.toISOString()}
  Owner:              ${req.owner}
  Reward:             ${req.reward / wvs} WAVES`);
  }
}

async function add(rest: string[]) {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      "pool-addr": {
        type: "string",
      },
      "pool-id": {
        type: "string",
      },
      "oracle-url": {
        type: "string",
      },
      config: {
        type: "string",
        default: "./config.json",
      },
      chain: {
        type: "string",
        default: "R",
      },
      apply: {
        type: "boolean",
      },
      help: {
        type: "boolean",
        short: "h",
      },
      ...httpActionOptions,
    },
    allowPositionals: true,
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
     --oracle-url <url>         Base URL of the oracle API. Default: from config
     --pool-addr <address>      Address of the oracle pool script with isInPool method. Default: from config
     --pool-id <address>        Pool ID in hex. Default: wallet address when using private pool
     --config <path>            Path to config.json. Default: ./config.json
     --chain <id>               Chain ID. Default: R
     --apply                    Actually submit the transaction
 -h, --help                     Show this help message and exit`);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const action = (function () {
    try {
      return parseHttpAction(values, positionals);
    } catch (e) {
      if (e instanceof Error) {
        console.log(e.message);
      }
      printHelp();
      process.exit(1);
    }
  })();

  const network = await NetworkConfig.fromArgs(values.config, values.chain);
  const chainId = network.chainId;
  const nodeUrl = network.getNodeUrl();

  const poolAddress = values["pool-addr"] ?? network.dApps.privatePools;
  const poolIdArg = values["pool-id"];
  const poolIdHex =
    poolIdArg && poolIdArg.length
      ? poolIdArg
      : poolAddress === network.dApps.privatePools
        ? Buffer.from(base58Decode(wallet.address(chainId))).toString("hex")
        : "";
  const fullPoolId = new FullPoolId(poolAddress, Buffer.from(poolIdHex, "hex"));

  const oracleUrl =
    values["oracle-url"] ??
    network
      .forPool(fullPoolId)
      .findOracleUrl(
        action instanceof HttpActionWithProof
          ? action.action.patch.tdAddress
          : ANY_TD_ADDRESS,
      );
  if (!oracleUrl) {
    console.log("--oracle-url is required and was not found in config");
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

  const tx = addRequest(
    actionWithProof,
    network.dApps.responses,
    fullPoolId,
    Date.now(),
    0.01 * wvs,
    network.dApps.requests,
    chainId,
    wallet.seed,
  );

  await handleTx(tx, Boolean(values.apply), nodeUrl);

  console.log(
    `Key: ${fullPoolId.address}:${base58Encode(fullPoolId.id)}:${base58Encode(
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
      config: {
        type: "string",
        default: "./config.json",
      },
      chain: {
        type: "string",
        default: "R",
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
     --config <path>     Path to config.json. Default: ./config.json
     --chain <id>        Chain ID. Default: R
     --apply             Actually submit the transaction
 -h, --help              Show this help message and exit`,
    );
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (!positionals[0]) {
    console.log("Key is required");
    printHelp();
    process.exit(1);
  }

  const network = await NetworkConfig.fromArgs(values.config, values.chain);
  const nodeUrl = network.getNodeUrl();
  await handleTx(
    recycleRequest(
      positionals[0],
      network.dApps.requests,
      network.chainId,
      wallet.seed,
    ),
    Boolean(values.apply),
    nodeUrl,
  );
}

async function fulfill(rest: string[]) {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      "oracle-url": {
        type: "string",
      },
      config: {
        type: "string",
        default: "./config.json",
      },
      chain: {
        type: "string",
        default: "R",
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
     --oracle-url <url>  Base URL of the oracle API. Default: from config
     --config <path>     Path to config.json. Default: ./config.json
     --chain <id>        Chain ID. Default: R
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
  const network = await NetworkConfig.fromArgs(values.config, values.chain);
  const nodeUrl = network.getNodeUrl();

  const key = positionals[0];
  const req = await findRequest(key, network.dApps.requests, nodeUrl);
  if (!req) {
    throw new Error("Request is not found");
  }

  const oracleUrl =
    values["oracle-url"] ??
    network.forPool(req.pool).findOracleUrl(req.action.action.patch.tdAddress);
  if (!oracleUrl) {
    console.log("--oracle-url is required and was not found in config");
    printHelp();
    process.exit(1);
  }

  const signerClient = new SignerClient(oracleUrl);
  const res = await signerClient.query(
    req.action,
    base58Decode(wallet.address(network.chainId)),
  );

  await handleTx(
    fulfillRequest(
      res,
      network.dApps.responses,
      req.pool,
      req.txId,
      network.dApps.requests,
      network.chainId,
      wallet.seed,
    ),
    Boolean(values.apply),
    nodeUrl,
  );
}
