import fs from "fs";
import rideJs from "@waves/ride-js";

export const oracles = doCompile("./src/ride/oracles.ride");
export const responses = doCompile("./src/ride/responses.ride");

function doCompile(path: string): string {
  const compilation = rideJs.compile(
    fs.readFileSync(path, "utf-8"),
    undefined,
    true,
    true
  );
  if ("error" in compilation) {
    throw new Error(`Ride compilation failed: ${compilation.error}`);
  }

  return compilation.result.base64;
}
