import { randomSeed } from "@waves/ts-lib-crypto";
import { parseArgs } from "node:util";
import {
  chainOptions,
  doOrExit,
  formatOptions,
  getCommand,
  helpOptions,
} from "./cliUtils.js";
import { RootWallet } from "./lib/wallets.js";

const [command, ...rest] = process.argv.slice(2);

function printRootHelp() {
  console.log(`Usage:
 ${getCommand()} <command>

Manages the root wallet

Positional arguments:
  command
    show                Print root wallet address
    generate            Generate a new seed`);
}

switch (command) {
  case "show":
    show(rest);
    break;
  case "generate":
    generate(rest);
    break;
  case "-h":
  case "--help":
  case undefined:
    printRootHelp();
    break;
  default:
    printRootHelp();
    break;
}

function show(rest: string[]) {
  const options = {
    ...chainOptions,
    ...helpOptions,
  } as const;

  const { values } = doOrExit(
    () =>
      parseArgs({
        args: rest,
        options: options,
      }),
    printHelp,
  );

  function printHelp() {
    console.log(`Usage:
 ${getCommand()} show [options]

Prints the root wallet address

${formatOptions(options)}`);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  console.log(RootWallet.fromEnv().address(values.chain));
}

function generate(rest: string[]) {
  const options = {
    ...helpOptions,
  } as const;

  const { values } = doOrExit(
    () =>
      parseArgs({
        args: rest,
        options: options,
      }),
    printHelp,
  );

  function printHelp() {
    console.log(`Usage:
 ${getCommand()} generate [options]

Generates a new seed

${formatOptions(options)}`);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  console.log(`SEED="${randomSeed()}"`);
}
