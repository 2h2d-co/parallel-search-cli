import { randomUUID } from "node:crypto";
import { chmodSync, linkSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { Buffer } from "node:buffer";
import { CliError } from "./core.ts";

export type OutputReceipt = {
  bytes: number;
  output: string;
};

export function writeOutputFile(path: string, content: string): OutputReceipt {
  const output = resolve(path);
  const directory = dirname(output);
  const temporary = resolve(directory, `.${basename(output)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    chmodSync(temporary, 0o600);
    linkSync(temporary, output);
  } catch (error) {
    const code = nodeErrorCode(error);
    const message =
      code === "EEXIST"
        ? `Output file already exists: ${output}`
        : `Could not write output file: ${error instanceof Error ? error.message : String(error)}`;
    throw new CliError(message, { kind: "output" });
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary file was already removed or was never created.
    }
  }

  return {
    bytes: Buffer.byteLength(content),
    output,
  };
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  return typeof error.code === "string" ? error.code : undefined;
}
