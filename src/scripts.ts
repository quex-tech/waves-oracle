import fs from "fs";
import rideJs from "@waves/ride-js";
import { responses as responsesWallet } from "./wallets.js";

export const oracles = doCompile(
  fs.readFileSync("./src/ride/oracles.ride", "utf-8")
);
export const responses = doCompile(
  fs.readFileSync("./src/ride/responses.ride", "utf-8")
);
export const requests = doCompile(
  fs
    .readFileSync("./src/ride/requests.ride", "utf-8")
    .replaceAll("ResponsesgQSB1AcUHHFzRUjMpx7j35YsQv", responsesWallet.address)
);

function doCompile(script: string): string {
  const compilation = rideJs.compile(script, undefined, true, true);
  if ("error" in compilation) {
    throw new Error(`Ride compilation failed: ${compilation.error}`);
  }

  return compilation.result.base64;
}
