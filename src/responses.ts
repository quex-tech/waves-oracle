import { base58Decode } from "@waves/ts-lib-crypto";
import { accountData } from "@waves/waves-transactions/dist/nodeInteraction.js";
import { DataItem } from "./lib/models.js";
import { nodeUrl } from "./lib/network.js";
import { parseBinaryEntry } from "./lib/utils.js";
import { responses } from "./lib/wallets.js";

const currentData = await accountData({ address: responses.address }, nodeUrl);

for (const key of Object.keys(currentData)) {
  const [actionId, pool] = key.split(":");
  const dataItem = DataItem.fromBytes(parseBinaryEntry(currentData[key]));
  console.log(
    "- Action ID:   ",
    Buffer.from(base58Decode(actionId)).toString("hex"),
  );
  console.log("  Pool Address:", pool);
  console.log(
    "  Timestamp:   ",
    new Date(dataItem.timestamp * 1000).toISOString(),
  );
  console.log("  Error:       ", dataItem.error);
  console.log("  Value:       ", dataItem.value.toString("hex"));
}
