import { accountData } from "@waves/waves-transactions/dist/nodeInteraction.js";
import { responses } from "./wallets.js";
import { nodeUrl } from "./network.js";
import { base58Decode } from "@waves/ts-lib-crypto";
import { DataItem } from "./models.js";
import { parseBinaryEntry } from "./utils.js";

const currentData = await accountData({ address: responses.address }, nodeUrl);

for (const key of Object.keys(currentData)) {
  const [actionId, pool] = key.split(":");
  const dataItem = DataItem.fromBytes(parseBinaryEntry(currentData[key]));
  console.log(
    "- Action ID:   ",
    Buffer.from(base58Decode(actionId)).toString("hex")
  );
  console.log("  Pool Address:", pool);
  console.log(
    "  Timestamp:   ",
    new Date(dataItem.timestamp * 1000).toISOString()
  );
  console.log("  Error:       ", dataItem.error);
  console.log("  Value:       ", dataItem.value.toString("hex"));
}
