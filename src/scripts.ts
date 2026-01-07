import fs from "fs";
import { nodeUrl } from "./lib/network.js";

export const privatePools = await doCompile(
  fs.readFileSync("./src/ride/private-pools.ride", "utf-8"),
);
export const responses = await doCompile(
  fs.readFileSync("./src/ride/responses.ride", "utf-8"),
);
export const requests = await doCompile(
  fs.readFileSync("./src/ride/requests.ride", "utf-8"),
);
export const quotes = await doCompile(
  fs.readFileSync("./src/ride/quotes.ride", "utf-8"),
);

type CompilationResult = {
  script: string;
  complexity: number;
  verifierComplexity: number;
  callableComplexities: Record<string, number>;
  extraFee: number;
};

async function doCompile(script: string): Promise<string> {
  const res = await fetch(
    new URL("/utils/script/compileCode?compact=true", nodeUrl),
    {
      method: "POST",
      headers: { "Content-Type": "text/plain", Accept: "application/json" },
      body: script,
    },
  );
  if (!res.ok) {
    throw new Error(
      `Failed to compile script: ${res.status} ${res.statusText}`,
    );
  }
  const compilation = (await res.json()) as CompilationResult;
  return compilation.script;
}
