import { parseArgs } from "node:util";
import { NetworkConfig } from "./lib/config.js";
import { fetchResponses } from "./lib/responses.js";

const { values } = parseArgs({
  options: {
    config: {
      type: "string",
      default: "./config.json",
    },
    chain: {
      type: "string",
      default: "R",
    },
    help: {
      type: "boolean",
      short: "h",
    },
  },
});

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
