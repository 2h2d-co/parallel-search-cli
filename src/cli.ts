#!/usr/bin/env node
import {
  apiJson,
  CliError,
  formatResponse,
  helpText,
  parseCli,
  requestPreview,
  VERSION,
} from "./core.ts";
import { requestSchema } from "./schema.ts";

async function main(): Promise<void> {
  try {
    const command = parseCli(process.argv.slice(2), process.env);

    if (command.kind === "help") {
      process.stdout.write(`${helpText(command.endpoint)}\n`);
      return;
    }

    if (command.kind === "version") {
      process.stdout.write(`${VERSION}\n`);
      return;
    }

    if (command.kind === "schema") {
      process.stdout.write(`${formatResponse(requestSchema(command.endpoint), "json", false)}\n`);
      return;
    }

    const response = command.options.dryRun
      ? requestPreview(command.options)
      : await apiJson(command.options);
    const format = command.options.dryRun ? "json" : command.options.format;
    process.stdout.write(`${formatResponse(response, format, command.options.compact)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`parallel-search: ${message}\n`);
    process.exitCode = error instanceof CliError ? error.exitCode : 1;
  }
}

await main();
