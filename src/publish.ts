import { keygen } from "@noble/secp256k1";
import { base58Decode } from "@waves/ts-lib-crypto";
import fs from "fs";
import { parseArgs } from "node:util";
import { httpActionOptions, parseHttpAction } from "./httpAction.js";
import { NetworkConfig } from "./lib/config.js";
import {
  ANY_TD_ADDRESS,
  FullPoolId,
  HttpActionWithProof,
} from "./lib/models.js";
import { publishResponse } from "./lib/responses.js";
import { SignerClient } from "./lib/signer.js";
import { handleTx } from "./lib/utils.js";
import { wallet } from "./lib/wallets.js";

const { values, positionals } = parseArgs({
  options: {
    "output-request": {
      type: "string",
    },
    "oracle-url": {
      type: "string",
    },
    "pool-addr": {
      type: "string",
    },
    "pool-id": {
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

if (values["output-request"]) {
  const encodedAction = actionWithProof.toBytes().toString("base64");
  fs.writeFileSync(values["output-request"], encodedAction);
}

const res = await signerClient.query(
  actionWithProof,
  base58Decode(wallet.address(chainId)),
);
console.log(res);

await handleTx(
  publishResponse(
    res,
    fullPoolId,
    network.dApps.responses,
    chainId,
    wallet.seed,
  ),
  Boolean(values.apply),
  nodeUrl,
);

function printHelp() {
  console.log(`Usage:
 ${process.argv[0]} ${process.argv[1]} [options...] <url> <schema>
 ${process.argv[0]} ${process.argv[1]} --from-file <path> [options...]
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
     --pool-addr <address>      Address of the oracle pool script with isInPool method. Default: private pool from config
     --pool-id <address>        Pool ID in hex. Default: wallet address when using private pool
     --config <path>            Path to config.json. Default: ./config.json
     --chain <id>               Chain ID. Default: R
     --apply                    Actually submit the transaction
 -h, --help                     Show this help message and exit`);
}
