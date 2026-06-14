#!/usr/bin/env node
import { apiJson, CliError, formatResponse, helpText, parseCli, VERSION } from "./core.ts";

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

    const response = await apiJson(command.options);
    process.stdout.write(
      `${formatResponse(response, command.options.format, command.options.compact)}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`parallel-search: ${message}\n`);
    process.exitCode = error instanceof CliError ? error.exitCode : 1;
  }
}

await main();
