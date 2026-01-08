import { keygen } from "@noble/secp256k1";
import { base58Decode } from "@waves/ts-lib-crypto";
import fs from "fs";
import { parseArgs } from "node:util";
import { parseHttpAction } from "./httpAction.js";
import { FullPoolId, HttpActionWithProof } from "./lib/models.js";
import { publishResponse } from "./lib/responses.js";
import { SignerClient } from "./lib/signer.js";
import { asStringArg, handleTx } from "./lib/utils.js";
import {
  privatePools,
  responses as responsesWallet,
  treasury,
} from "./lib/wallets.js";

const { values } = parseArgs({
  options: {
    "output-request": {
      type: "string",
    },
    "oracle-url": {
      type: "string",
      default: process.env["ORACLE_URL"],
    },
    "pool-addr": {
      type: "string"
    },
    "pool-id": {
      type: "string",
      default: "",
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
  strict: false,
});

if (values.help) {
  printHelp();
  process.exit(0);
}

const action = (function () {
  try {
    return parseHttpAction(process.argv.slice(2));
  } catch (e) {
    if (e instanceof Error) {
      console.log(e.message);
    }
    printHelp();
    process.exit(1);
  }
})();

const signerClient = new SignerClient(asStringArg(values["oracle-url"] || ""));

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
  fs.writeFileSync(asStringArg(values["output-request"]), encodedAction);
}
const chainId = asStringArg(values.chain);
const res = await signerClient.query(
  actionWithProof,
  base58Decode(treasury.address(chainId)),
);
console.log(res);

const fullPoolId = new FullPoolId(
  asStringArg(values["pool-addr"] ?? privatePools.address(chainId)),
  Buffer.from(asStringArg(values["pool-id"]), "hex"),
);

await handleTx(
  publishResponse(
    res,
    fullPoolId,
    responsesWallet.address(chainId),
    chainId,
    treasury.seed,
  ),
  Boolean(values.apply),
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
     --oracle-url <url>         Base URL of the oracle API
     --pool-addr <address>      Address of the oracle pool script with isInPool method
     --pool-id <address>        Pool ID in hex. Default: empty (pool is defined by the address)
     --chain <id>               Chain ID. Default: R
     --apply                    Actually submit the transaction
 -h, --help                     Show this help message and exit`);
}
