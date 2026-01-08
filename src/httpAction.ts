import fs from "fs";
import {
  HttpActionWithProof,
  HttpRequest,
  isHttpMethod,
  UnencryptedHttpAction,
  UnencryptedHttpPrivatePatch,
} from "./lib/models.js";

export const httpActionOptions = {
  request: {
    type: "string",
    default: "GET",
    short: "X",
  },
  header: {
    type: "string",
    multiple: true,
    short: "H",
  },
  data: {
    type: "string",
    short: "d",
  },
  "enc-url-suffix": {
    type: "string",
  },
  "enc-header": {
    type: "string",
    multiple: true,
  },
  "enc-data": {
    type: "string",
  },
  filter: {
    type: "string",
    short: "f",
    default: ".",
  },
  "from-file": {
    type: "string",
  },
} as const;

type ParsedValues = {
  request: string;
  header?: string[];
  data?: string;
  "enc-url-suffix"?: string;
  "enc-header"?: string[];
  "enc-data"?: string;
  filter: string;
  "from-file"?: string;
};

export function parseHttpAction(values: ParsedValues, positionals: string[]) {
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
