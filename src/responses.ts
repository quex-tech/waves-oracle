import { base58Decode, base58Encode } from "@waves/ts-lib-crypto";
import { accountData } from "@waves/waves-transactions/dist/nodeInteraction.js";
import { DataItem, FullPoolId } from "./lib/models.js";
import { nodeUrl } from "./lib/network.js";
import { parseBinaryEntry } from "./lib/utils.js";
import { responses } from "./lib/wallets.js";

const currentData = await accountData({ address: responses.address }, nodeUrl);

for (const key of Object.keys(currentData)) {
  const [actionId, poolAddress, poolId] = key.split(":").map(base58Decode);
  const fullPoolId = new FullPoolId(
    base58Encode(poolAddress),
    Buffer.from(poolId),
  );
  const dataItem = DataItem.fromBytes(parseBinaryEntry(currentData[key]));
  console.log(`- Action ID:  ${Buffer.from(actionId).toString("hex")}
  Pool:
    Address:  ${fullPoolId.address}
    ID:       ${fullPoolId.formatId()}
  Timestamp:  ${new Date(dataItem.timestamp * 1000).toISOString()}
  Error:      ${dataItem.error}
  Value:      ${dataItem.value.toString("hex")}`);
}
