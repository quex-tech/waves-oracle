import { base58Decode } from "@waves/ts-lib-crypto";
import { parseArgs } from "node:util";
import {
  applyOptions,
  configOptions,
  doOrExit,
  formatOptions,
  getCommand,
  handleTx,
  helpOptions,
  parseNumberOption,
} from "./cliUtils.js";
import { Config } from "./lib/config.js";
import { fetchRequests, fulfillRequest } from "./lib/requests.js";
import { SignerClient } from "./lib/signer.js";
import { wvs } from "./lib/utils.js";
import { RootWallet } from "./lib/wallets.js";

const FEE = 0.005 * wvs;

const options = {
  ...configOptions,
  chain: {
    type: "string" as const,
    default: ["R"],
    multiple: true,
    valueLabel: "id",
    description: "Chain ID(s). You can specify muliple --chain options.",
  },
  "min-reward": {
    type: "string",
    default: "0.001",
    valueLabel: "waves",
    description: "Minimum reward in WAVES (excluding tx fee).",
  } as const,
  ...applyOptions,
  ...helpOptions,
};

const { values } = doOrExit(() => parseArgs({ options: options }), printHelp);

function printHelp() {
  console.log(`Usage:
 ${getCommand()} [options]

Fulfills pending oracle requests

${formatOptions(options)}`);
}

if (values.help) {
  printHelp();
  process.exit(0);
}

const minRewardWaves = doOrExit(
  () => parseNumberOption(values["min-reward"], "min-reward"),
  printHelp,
);
if (minRewardWaves < 0) {
  console.log("--min-reward must be >= 0");
  printHelp();
  process.exit(1);
}
const minRewardAmount = Math.round(minRewardWaves * wvs);

const config = await Config.fromFile(values.config);

const wallet = RootWallet.fromEnv();

for (const chainId of values.chain) {
  const network = doOrExit(() => config.forChain(chainId), printHelp);
  const nodeUrl = network.findNodeUrl();
  if (!nodeUrl) {
    continue;
  }

  for (const req of await fetchRequests(network.dApps.requests, nodeUrl)) {
    if (req.reward < FEE + minRewardAmount) {
      continue;
    }

    const now = new Date();
    if (req.after > now || req.before < now) {
      continue;
    }

    const pool = network.forPool(req.pool);
    const oracleUrl = pool.findOracleUrl(req.action.action.patch.tdAddress);
    if (!oracleUrl) {
      continue;
    }

    const signerClient = new SignerClient(oracleUrl);

    const res = await signerClient.query(
      req.action,
      base58Decode(wallet.address(chainId)),
    );

    try {
      await handleTx(
        fulfillRequest(
          res,
          network.dApps.responses,
          req.pool,
          req.txId,
          network.dApps.requests,
          chainId,
          wallet,
        ),
        Boolean(values.apply),
        nodeUrl,
      );
    } catch (e) {
      console.log(e);
      continue;
    }
  }
}
