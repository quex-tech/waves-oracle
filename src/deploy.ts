import { parseArgs } from "node:util";
import { handleTx } from "./cliUtils.js";
import { NetworkConfig } from "./lib/config.js";
import { deployDApps } from "./lib/deploy.js";
import { wallet } from "./lib/wallets.js";

const { values } = parseArgs({
  options: {
    chain: {
      type: "string",
      default: "R",
    },
    config: {
      type: "string",
      default: "./config.json",
    },
    apply: {
      type: "boolean",
    },
    "src-path": {
      type: "string",
      default: "./src/ride",
    },
    help: {
      type: "boolean",
      short: "h",
    },
  },
});

if (values.help) {
  console.log(
    `Usage: ${process.argv[0]} ${process.argv[1]} [options]
     --chain <id>        Chain ID (default: R)
     --config <path>     Path to config file (default: ./config.json)
     --src-path <path>   Path to ride sources (default: ./src/ride)
     --apply             Actually submit the transactions
 -h, --help              Show this help message and exit`,
  );
  process.exit(0);
}

const network = await NetworkConfig.fromArgs(values.config, values.chain);
const chainId = network.chainId;
const nodeUrl = network.getNodeUrl();
const srcDirPath = values["src-path"];

const apply = Boolean(values.apply);
const { dApps, txs } = await deployDApps(
  wallet,
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
    "  ",
  ),
);
