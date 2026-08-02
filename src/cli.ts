#!/usr/bin/env node
import {
  apiJson,
  CliError,
  errorFormatFromArgv,
  extractResponseErrors,
  formatCliError,
  formatResponse,
  helpText,
  parseCli,
  requestPreview,
  VERSION,
} from "./core.ts";
import { writeOutputFile } from "./output.ts";
import { requestSchema } from "./schema.ts";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const errorFormat = errorFormatFromArgv(argv);

  try {
    const command = parseCli(argv, process.env);

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
    const content = `${formatResponse(response, format, command.options.compact)}\n`;

    if (command.options.outputPath === undefined) {
      process.stdout.write(content);
    } else {
      const receipt = writeOutputFile(command.options.outputPath, content);
      process.stdout.write(`${JSON.stringify({ ...receipt, type: "output" })}\n`);
    }

    const extractErrors = extractResponseErrors(response);
    if (!command.options.dryRun && command.options.failOnErrors && extractErrors.length > 0) {
      throw new CliError(
        `Extract completed with ${extractErrors.length} URL error${extractErrors.length === 1 ? "" : "s"}`,
        { detail: extractErrors, kind: "partial" },
      );
    }
  } catch (error) {
    const cliError =
      error instanceof CliError
        ? error
        : new CliError(error instanceof Error ? error.message : String(error), {
            kind: "internal",
          });
    const formatted = formatCliError(cliError, errorFormat);
    process.stderr.write(
      errorFormat === "json" ? `${formatted}\n` : `parallel-search: ${formatted}\n`,
    );
    process.exitCode = cliError.exitCode;
  }
}

await main();
