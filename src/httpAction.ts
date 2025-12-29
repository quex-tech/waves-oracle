import {
  HttpActionWithProof,
  HttpRequest,
  isHttpMethod,
  UnencryptedHttpAction,
  UnencryptedHttpPrivatePatch,
} from "./models.js";
import { parseArgs } from "node:util";
import fs from "fs";
import { asOptionalStringArg, asStringArg } from "./utils.js";

export function parseHttpAction(args: string[]) {
  const { values, positionals } = parseArgs({
    args: args,
    options: {
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
    },
    strict: false,
  });

  const request = asStringArg(values.request);
  if (!isHttpMethod(request)) {
    throw new Error(`Unsupported HTTP method: ${values.request}`);
  }

  if (values["from-file"]) {
    return HttpActionWithProof.fromBytes(
      Buffer.from(
        fs.readFileSync(asStringArg(values["from-file"]), {
          encoding: "utf-8",
        }),
        "base64"
      )
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
      request,
      positionals[0],
      (values.header || []).map(asStringArg),
      asOptionalStringArg(values.data) || ""
    ),
    UnencryptedHttpPrivatePatch.fromParts(
      asOptionalStringArg(values["enc-url-suffix"]) || null,
      values["enc-header"]?.map(asStringArg) || null,
      asOptionalStringArg(values["enc-data"]) || null
    ),
    positionals[1],
    asStringArg(values.filter)
  );
}
