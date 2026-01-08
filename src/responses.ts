import { nodeUrl } from "./lib/network.js";
import { fetchResponses } from "./lib/responses.js";
import { responses } from "./lib/wallets.js";

for (const res of await fetchResponses(responses.address, nodeUrl)) {
  console.log(`- Action ID:  ${res.actionId.toString("hex")}
  Pool:
    Address:  ${res.pool.address}
    ID:       ${res.pool.formatId()}
  Timestamp:  ${new Date(res.dataItem.timestamp * 1000).toISOString()}
  Error:      ${res.dataItem.error}
  Value:      ${res.dataItem.value.toString("hex")}`);
}
