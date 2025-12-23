import { invokeScript } from "@waves/waves-transactions";

import {
  HttpRequest,
  isHttpMethod,
  UnencryptedHttpAction,
  UnencryptedHttpPrivatePatch,
} from "./models.js";
import { SignerClient } from "./signer.js";
import { oracles, responses as responsesWallet, treasury } from "./wallets.js";
import { base58Decode } from "@waves/ts-lib-crypto";
import { handleTx } from "./utils.js";
import { chainId } from "./network.js";
import { keygen } from "@noble/secp256k1";
import { parseArgs } from "node:util";
import fs from "fs";

type Arguments = {
  action: UnencryptedHttpAction | Buffer;
  saveAction: string | null;
  oracleUrl: string;
  pool: string;
  apply: boolean;
};

let args: Arguments;
try {
  const argsOrNot = parseArguments();
  if (!argsOrNot) {
    printHelp();
    process.exit(1);
  }
  args = argsOrNot;
} catch (e) {
  if (e instanceof Error) {
    console.log(e.message);
  }
  printHelp();
  process.exit(1);
}

const signerClient = new SignerClient(args.oracleUrl);

const tdPublicKey = await signerClient.publicKey();
const senderPrivKey = keygen().secretKey;

const actionWithProof = Buffer.isBuffer(args.action)
  ? args.action
  : args.action
      .encrypt(tdPublicKey, await signerClient.address(), senderPrivKey)
      .addProof(tdPublicKey, senderPrivKey);

const encodedAction = (
  Buffer.isBuffer(actionWithProof) ? actionWithProof : actionWithProof.toBytes()
).toString("base64");

if (args.saveAction) {
  fs.writeFileSync(args.saveAction, encodedAction);
}

const res = await signerClient.query(
  actionWithProof,
  base58Decode(treasury.address)
);
console.log(res);
await handleTx(
  invokeScript(
    {
      dApp: responsesWallet.address,
      call: {
        function: "publish",
        args: [
          { type: "binary", value: res.toBytes().toString("base64") },
          { type: "string", value: args.pool },
        ],
      },
      chainId: chainId,
    },
    treasury.seed
  ),
  args.apply
);

function parseArguments(): Arguments | null {
  const { values, positionals } = parseArgs({
    options: {
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
      "output-request": {
        type: "string",
      },
      "from-file": {
        type: "string",
      },
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
    allowPositionals: true,
  });

  if (values.help) {
    return null;
  }

  if (!isHttpMethod(values.request)) {
    throw new Error(`Unsupported HTTP method: ${values.request}`);
  }

  let action: UnencryptedHttpAction | Buffer;
  if (values["from-file"]) {
    action = Buffer.from(
      fs.readFileSync(values["from-file"], { encoding: "utf-8" }),
      "base64"
    );
  } else {
    if (!positionals[0]) {
      throw new Error("URL is reqiured");
    }
    if (!positionals[1]) {
      throw new Error("Schema is reqiured");
    }
    action = new UnencryptedHttpAction(
      HttpRequest.fromParts(
        values.request,
        positionals[0],
        values.header || [],
        values.data || ""
      ),
      UnencryptedHttpPrivatePatch.fromParts(
        values["enc-url-suffix"] || null,
        values["enc-header"] || null,
        values["enc-data"] || null
      ),
      positionals[1],
      values.filter
    );
  }

  if (!values["oracle-url"]) {
    throw new Error("--oracle-url is reqiured");
  }

  return {
    action: action,
    saveAction: values["output-request"] || null,
    oracleUrl: values["oracle-url"],
    pool: values.pool,
    apply: Boolean(values.apply),
  };
}

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
     --pool <address>           Address of the oracle pool script with isInPool method. Default: ${oracles.address}
     --apply                    Actually submit the transaction
 -h, --help                     Show this help message and exit`);
}
