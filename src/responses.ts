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

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

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
  const poolName = network.findDAppName(res.pool.address);
  console.log(`- Action ID:    ${res.actionId.toString("hex")}
  Pool:
    Address:    ${res.pool.address}${poolName ? ` (${poolName})` : ""}
    ID:         ${res.pool.formatId()}
  Timestamp:    ${new Date(res.dataItem.timestamp * 1000).toISOString()}
  Error:        ${res.dataItem.error}
  Value:        ${res.dataItem.value.toString("hex")}${prettyPrintValue(res.dataItem.value)}`);
}

function prettyPrintValue(value: Buffer): string {
  if (value.length < 8) {
    return "";
  }

  if (value.length === 8) {
    return `\n  IntegerValue: ${value.readBigInt64BE(0).toString()}`;
  }

  const stringLength = value.readBigInt64BE(0);
  if (stringLength < 0n || stringLength > BigInt(value.length - 8)) {
    return "";
  }

  const stringLengthNumber = Number(stringLength);
  if (stringLengthNumber + 8 === value.length) {
    try {
      const decoded = utf8Decoder.decode(value.subarray(8));
      return `\n  StringValue:  ${decoded}`;
    } catch {
      return "";
    }
  }

  return "";
}
