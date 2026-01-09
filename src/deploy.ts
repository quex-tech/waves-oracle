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
} from "./cliUtils.js";
import { NetworkConfig } from "./lib/config.js";
import { deployDApps } from "./lib/deploy.js";
import { RootWallet } from "./lib/wallets.js";

const options = {
  ...configOptions,
  ...chainOptions,
  "src-path": {
    type: "string",
    default: "./src/ride",
    valueLabel: "path",
    description: "Path to ride sources",
  },
  ...applyOptions,
  ...helpOptions,
} as const;

const { values } = doOrExit(() => parseArgs({ options: options }), printHelp);

function printHelp() {
  console.log(`Usage:
 ${getCommand()} [options]

Deploys Ride scripts to wallets derived from the root wallet

${formatOptions(options)}`);
}

if (values.help) {
  printHelp();
  process.exit(0);
}

const network = await NetworkConfig.fromArgs(values.config, values.chain);
const chainId = network.chainId;
const nodeUrl = network.getNodeUrl();
const srcDirPath = values["src-path"];

const apply = Boolean(values.apply);
const { dApps, txs } = await deployDApps(
  RootWallet.fromEnv(),
  chainId,
  nodeUrl,
  srcDirPath,
);
for (const tx of txs) {
  await handleTx(tx, apply, nodeUrl);
}

console.log(
  JSON.stringify(
    {
      [chainId]: {
        dApps: dApps,
      },
    },
    undefined,
    2,
  ),
);
