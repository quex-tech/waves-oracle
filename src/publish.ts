import { keygen } from "@noble/secp256k1";
import { base58Decode } from "@waves/ts-lib-crypto";
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
  poolOptions,
} from "./cliUtils.js";
import { NetworkConfig } from "./lib/config.js";
import {
  ANY_TD_ADDRESS,
  FullPoolId,
  HttpActionWithProof,
} from "./lib/models.js";
import { publishResponse } from "./lib/responses.js";
import { SignerClient } from "./lib/signer.js";
import { RootWallet } from "./lib/wallets.js";

const options = {
  ...configOptions,
  ...chainOptions,
  ...httpActionOptions,
  ...oracleUrlOptions,
  ...poolOptions,
  ...applyOptions,
  ...helpOptions,
} as const;

const { values, positionals } = doOrExit(
  () =>
    parseArgs({
      options: options,
      allowPositionals: true,
    }),
  printHelp,
);

if (values.help) {
  printHelp();
  process.exit(0);
}

const action = doOrExit(() => parseHttpAction(values, positionals), printHelp);

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
  base58Decode(RootWallet.fromEnv().address(chainId)),
);
console.log(res);

await handleTx(
  publishResponse(
    res,
    fullPoolId,
    network.dApps.responses,
    chainId,
    RootWallet.fromEnv(),
  ),
  Boolean(values.apply),
  nodeUrl,
);

function printHelp() {
  console.log(`Usage:
 ${getCommand()} [options...] <url> <schema>
 ${getCommand()} --from-file <path> [options...]

Publishes an oracle response on-chain

Positional arguments:
  schema                         Schema to encode response body. Examples: "int", "(string,(int,bool[]))"

${formatOptions(options)}`);
}
