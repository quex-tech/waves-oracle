import { keygen } from "@noble/secp256k1";
import { base58Decode, base58Encode } from "@waves/ts-lib-crypto";
import fs from "fs";
import { parseArgs } from "node:util";
import {
  applyOptions,
  chainOptions,
  configOptions,
  doOrExit,
  formatOptions,
  getCommand,
  handleTx,
  helpOptions,
  httpActionOptions,
  oracleUrlOptions,
  parseHttpAction,
  parseNumberOption,
  poolOptions,
} from "./cliUtils.js";
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
import { RootWallet } from "./lib/wallets.js";

const [command, ...rest] = process.argv.slice(2);

function printRootHelp() {
  console.log(`Usage:
 ${getCommand()} <command>

Manages pending oracle requests stored on-chain

Positional arguments:
  command
    list                List pending oracle requests
    add                 Add a request
    recycle             Recycle an expired request
    fulfill             Fulfill a request`);
}

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
  case "-h":
  case "--help":
  case undefined:
    printRootHelp();
    break;
  default:
    printRootHelp();
    break;
}

async function list(rest: string[]) {
  const options = {
    ...configOptions,
    ...chainOptions,
    ...helpOptions,
  } as const;

  const { values } = doOrExit(
    () =>
      parseArgs({
        args: rest,
        options: options,
      }),
    printHelp,
  );

  function printHelp() {
    console.log(`Usage:
 ${getCommand()} list [options]

Lists pending oracle requests stored on-chain

${formatOptions(options)}`);
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
  const options = {
    ...configOptions,
    ...chainOptions,
    ...httpActionOptions,
    ...oracleUrlOptions,
    ...poolOptions,
    ...({
      delay: {
        type: "string",
        default: "0",
        valueLabel: "minutes",
        description: "Delay in minutes before request range starts.",
      },
      ttl: {
        type: "string",
        default: "60",
        valueLabel: "minutes",
        description:
          "TTL of the request in minutes. After it expires, author can reclaim funds.",
      },
      reward: {
        type: "string",
        default: "0.01",
        valueLabel: "waves",
        description:
          "Reward in WAVES (suggested >= 0.005 to cover invoke fee).",
      },
    } as const),
    ...applyOptions,
    ...helpOptions,
  } as const;

  const { values, positionals } = doOrExit(
    () =>
      parseArgs({
        args: rest,
        options: options,
        allowPositionals: true,
      }),
    printHelp,
  );

  function printHelp() {
    console.log(`Usage:
 ${getCommand()} add [options] <url> <schema>
 ${getCommand()} add --from-file <path> [options]

Adds an oracle request on-chain

Positional arguments:
  schema                         Schema to encode response body. Examples: "int", "(string,(int,bool[]))"

${formatOptions(options)}`);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const action = doOrExit(
    () => parseHttpAction(values, positionals),
    printHelp,
  );

  const network = await NetworkConfig.fromArgs(values.config, values.chain);
  const chainId = network.chainId;
  const nodeUrl = network.getNodeUrl();

  const poolAddress = values["pool-addr"] ?? network.dApps.privatePools;
  const poolIdArg = values["pool-id"];
  const poolIdHex =
    poolIdArg && poolIdArg.length
      ? poolIdArg
      : poolAddress === network.dApps.privatePools
        ? Buffer.from(
            base58Decode(RootWallet.fromEnv().address(chainId)),
          ).toString("hex")
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

  const delayMinutes = doOrExit(
    () => parseNumberOption(values.delay, "delay"),
    printHelp,
  );
  if (delayMinutes < 0) {
    console.log("--delay must be >= 0");
    printHelp();
    process.exit(1);
  }

  const ttlMinutes = doOrExit(
    () => parseNumberOption(values.ttl, "ttl"),
    printHelp,
  );
  if (ttlMinutes <= 0) {
    console.log("--ttl must be > 0");
    printHelp();
    process.exit(1);
  }

  const rewardWaves = doOrExit(
    () => parseNumberOption(values.reward, "reward"),
    printHelp,
  );
  if (rewardWaves < 0) {
    console.log("--reward must be >= 0");
    printHelp();
    process.exit(1);
  }

  const afterUnixSec = Math.floor(Date.now() / 1000 + delayMinutes * 60);
  const beforeUnixSec = afterUnixSec + Math.floor(ttlMinutes * 60);
  if (beforeUnixSec <= afterUnixSec) {
    console.log("--ttl results in an invalid time range");
    printHelp();
    process.exit(1);
  }
  const rewardAmount = Math.round(rewardWaves * wvs);

  const actionWithProof =
    action instanceof HttpActionWithProof
      ? action
      : action
          .encrypt(tdPublicKey, await signerClient.address(), senderPrivKey)
          .addProof(tdPublicKey, senderPrivKey);

  if (values["output-request"]) {
    const encodedAction = actionWithProof.toBytes().toString("base64");
    fs.writeFileSync(values["output-request"], encodedAction);
  }

  const tx = addRequest(
    actionWithProof,
    network.dApps.responses,
    fullPoolId,
    afterUnixSec,
    beforeUnixSec,
    rewardAmount,
    network.dApps.requests,
    chainId,
    RootWallet.fromEnv(),
  );

  await handleTx(tx, Boolean(values.apply), nodeUrl);

  console.log(
    `Key: ${fullPoolId.address}:${base58Encode(fullPoolId.id)}:${base58Encode(
      actionWithProof.action.getActionId(),
    )}:${tx.id}`,
  );
}

async function recycle(rest: string[]) {
  const options = {
    ...configOptions,
    ...chainOptions,
    ...applyOptions,
    ...helpOptions,
  } as const;

  const { values, positionals } = doOrExit(
    () =>
      parseArgs({
        args: rest,
        options: options,
        allowPositionals: true,
      }),
    printHelp,
  );

  function printHelp() {
    console.log(`Usage:
 ${getCommand()} recycle [options] <key>

Recycles an expired oracle request

Positional arguments:
  key                   Request key to recycle

${formatOptions(options)}`);
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
      RootWallet.fromEnv(),
    ),
    Boolean(values.apply),
    nodeUrl,
  );
}

async function fulfill(rest: string[]) {
  const options = {
    ...configOptions,
    ...chainOptions,
    ...oracleUrlOptions,
    ...applyOptions,
    ...helpOptions,
  } as const;

  const { values, positionals } = doOrExit(
    () =>
      parseArgs({
        args: rest,
        options: options,
        allowPositionals: true,
      }),
    printHelp,
  );

  function printHelp() {
    console.log(`Usage:
 ${getCommand()} fulfill [options] <key>

Fulfills a pending oracle request

Positional arguments:
  key                     Request key to fulfill

${formatOptions(options)}`);
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
  const wallet = RootWallet.fromEnv();
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
      wallet,
    ),
    Boolean(values.apply),
    nodeUrl,
  );
}
