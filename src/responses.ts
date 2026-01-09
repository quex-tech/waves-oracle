import { parseArgs } from "node:util";
import {
  chainOptions,
  configOptions,
  doOrExit,
  formatOptions,
  getCommand,
  helpOptions,
} from "./cliUtils.js";
import { NetworkConfig } from "./lib/config.js";
import { fetchResponses } from "./lib/responses.js";

const options = {
  ...configOptions,
  ...chainOptions,
  ...helpOptions,
} as const;

const { values } = doOrExit(() => parseArgs({ options: options }), printHelp);

function printHelp() {
  console.log(`Usage:
 ${getCommand()} [options]

Lists oracle responses stored on-chain

${formatOptions(options)}`);
}

if (values.help) {
  printHelp();
  process.exit(0);
}

const network = await NetworkConfig.fromArgs(values.config, values.chain);

for (const res of await fetchResponses(
  network.dApps.responses,
  network.getNodeUrl(),
)) {
  console.log(`- Action ID:  ${res.actionId.toString("hex")}
  Pool:
    Address:  ${res.pool.address}
    ID:       ${res.pool.formatId()}
  Timestamp:  ${new Date(res.dataItem.timestamp * 1000).toISOString()}
  Error:      ${res.dataItem.error}
  Value:      ${res.dataItem.value.toString("hex")}`);
}
