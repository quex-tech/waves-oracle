import type { SignedTransaction, Transaction, WithId } from "@waves/ts-types";
import { broadcast, waitForTx } from "@waves/waves-transactions";
import fs from "fs";
import path from "node:path";
import {
  HttpActionWithProof,
  HttpRequest,
  isHttpMethod,
  UnencryptedHttpAction,
  UnencryptedHttpPrivatePatch,
} from "./lib/models.js";

export async function handleTx(
  tx: SignedTransaction<Transaction> & WithId,
  apply: boolean,
  nodeUrl: string,
) {
  console.log("Transaction:", tx);
  if (!apply) {
    console.log("Add --apply to submit the transaction.");
    return;
  }

  await broadcast(tx, nodeUrl);
  console.log("Transaction submitted.");
  console.log("Waiting for confirmation...");
  await waitForTx(tx.id, { apiBase: nodeUrl });
  console.log("Transaction confirmed.");
}

export function getCommand() {
  const scriptArg = process.argv[1] ?? "";
  if (!scriptArg) {
    return "node script.js";
  }
  const scriptPath = path.relative(process.cwd(), scriptArg);
  if (
    scriptPath &&
    !scriptPath.startsWith("..") &&
    !path.isAbsolute(scriptPath)
  ) {
    return `node ${scriptPath}`;
  }
  return `node ${scriptArg}`;
}

type CliOptionSpec = {
  type: "string" | "boolean";
  description: string;
  default?: string | boolean | string[] | boolean[];
  short?: string;
  multiple?: boolean;
  valueLabel?: string;
};

type CliOptionsSpec = Record<string, CliOptionSpec>;

export function doOrExit<R>(fn: () => R, beforeExit: () => void) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof Error) {
      console.log(err.message);
    }
    beforeExit();
    process.exit(1);
  }
}

export function parseNumberOption(value: string, name: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid --${name} value: ${value}`);
  }
  return parsed;
}

export function formatOptions(specs: CliOptionsSpec) {
  const entries = Object.entries(specs).map(([name, spec]) => {
    const label =
      spec.type === "boolean" ? "" : ` <${spec.valueLabel ?? name}>`;
    const longName = `--${name}${label}`;
    const left = spec.short
      ? `  -${spec.short}, ${longName}`
      : `      ${longName}`;
    const desc =
      spec.default !== undefined
        ? `${spec.description} (default: ${formatDefault(spec.default)})`
        : spec.description;
    return { left, desc };
  });
  const maxLeft = entries.reduce(
    (max, entry) => Math.max(max, entry.left.length),
    0,
  );
  return `Options:
${entries.map((entry) => `${entry.left.padEnd(maxLeft + 2)}${entry.desc}`).join("\n")}`;
}

function formatDefault(def: string | boolean | string[] | boolean[]): string {
  if (Array.isArray(def)) {
    return def.map(formatDefault).join(", ");
  }
  return String(def).includes(" ") ? `"${def}"` : String(def);
}

export const configOptions = {
  config: {
    type: "string",
    default: "./config.json",
    valueLabel: "path",
    description: "Path to config.json",
  },
} as const;

export const chainOptions = {
  chain: {
    type: "string",
    default: "R",
    valueLabel: "id",
    description: "Chain ID",
  },
} as const;

export const applyOptions = {
  apply: {
    type: "boolean",
    description: "Actually submit the transactions",
  },
} as const;

export const helpOptions = {
  help: {
    type: "boolean",
    short: "h",
    description: "Show this help message and exit",
  },
} as const;

export const poolOptions = {
  "pool-addr": {
    type: "string",
    valueLabel: "address",
    description: "Address of the oracle pool script with isInPool method.",
  },
  "pool-id": {
    type: "string",
    valueLabel: "address",
    description: "Pool ID in hex.",
  },
} as const;

export const oracleUrlOptions = {
  "oracle-url": {
    type: "string",
    valueLabel: "url",
    description: "Base URL of the oracle API.",
  },
} as const;

export const httpActionOptions = {
  request: {
    type: "string",
    default: "GET",
    short: "X",
    valueLabel: "method",
    description: "Specify request method to use.",
  },
  header: {
    type: "string",
    multiple: true,
    short: "H",
    valueLabel: "header",
    description:
      'Pass custom header(s) to server. Example: "Content-Type: application/json"',
  },
  data: {
    type: "string",
    short: "d",
    valueLabel: "data",
    description: "HTTP POST data",
  },
  "enc-url-suffix": {
    type: "string",
    valueLabel: "suffix",
    description:
      "URL suffix to append and send encrypted. Examples: /sec, ?sec=1&enc=2, /sec?enc=a",
  },
  "enc-header": {
    type: "string",
    multiple: true,
    valueLabel: "header",
    description: "Pass custom header(s) to server encrypted",
  },
  "enc-data": {
    type: "string",
    valueLabel: "data",
    description: "HTTP POST data to send encrypted",
  },
  filter: {
    type: "string",
    short: "f",
    default: ".",
    valueLabel: "filter",
    description: "jq filter to transform response body.",
  },
  "from-file": {
    type: "string",
    valueLabel: "path",
    description: "Use request from file",
  },
  "output-request": {
    type: "string",
    valueLabel: "path",
    description: "Save base64-encoded request into a file",
  },
} as const;

type ParsedHttpActionValues = {
  request: string;
  header?: string[];
  data?: string;
  "enc-url-suffix"?: string;
  "enc-header"?: string[];
  "enc-data"?: string;
  filter: string;
  "from-file"?: string;
};

export function parseHttpAction(
  values: ParsedHttpActionValues,
  positionals: string[],
) {
  if (!isHttpMethod(values.request)) {
    throw new Error(`Unsupported HTTP method: ${values.request}`);
  }

  if (values["from-file"]) {
    return HttpActionWithProof.fromBytes(
      Buffer.from(
        fs.readFileSync(values["from-file"], {
          encoding: "utf-8",
        }),
        "base64",
      ),
    );
  }

  if (!positionals[0]) {
    throw new Error("URL is reqiured");
  }

  if (!positionals[1]) {
    throw new Error("Schema is reqiured");
  }

  return new UnencryptedHttpAction(
    HttpRequest.fromParts(
      values.request,
      positionals[0],
      values.header || [],
      values.data || "",
    ),
    UnencryptedHttpPrivatePatch.fromParts(
      values["enc-url-suffix"] || null,
      values["enc-header"] || null,
      values["enc-data"] || null,
    ),
    positionals[1],
    values.filter,
  );
}
