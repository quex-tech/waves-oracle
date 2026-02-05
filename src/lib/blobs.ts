import { data } from "@waves/waves-transactions";
import { IWallet } from "./wallets.js";

export function saveBlobs(
  blobs: Record<string, Buffer>,
  chainId: string,
  wallet: IWallet,
) {
  return data(
    {
      data: Object.entries(blobs).map((x) => ({
        type: "binary",
        key: x[0],
        value: x[1].toString("base64"),
      })),
      chainId: chainId,
    },
    wallet.seed,
  );
}
