import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

void test("writes output atomically and refuses to replace existing files", () => {
  const directory = mkdtempSync(join(tmpdir(), "parallel-search-cli-test-"));
  const output = join(directory, "preview.json");

  try {
    const first = runCliSync([
      "search",
      "--query",
      "Parallel Search API",
      "--dry-run",
      "--compact",
      "--output",
      output,
    ]);
    assert.equal(first.status, 0, first.stderr);
    assert.deepEqual(JSON.parse(first.stdout), {
      bytes: Buffer.byteLength(readFileSync(output, "utf8")),
      output,
      type: "output",
    });
    assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), {
      endpoint: "search",
      method: "POST",
      request: { search_queries: ["Parallel Search API"] },
      timeout_ms: 60_000,
      url: "https://api.parallel.ai/v1/search",
    });
    assert.equal(statSync(output).mode & 0o777, 0o600);

    const second = runCliSync([
      "search",
      "--query",
      "Parallel Search API",
      "--dry-run",
      "--output",
      output,
    ]);
    assert.equal(second.status, 7);
    assert.match(second.stderr, /Output file already exists/);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

void test("returns stable usage and authentication errors as JSON", () => {
  const usage = runCliSync(["search", "--query", "--mode", "basic", "--json-errors"]);
  assert.equal(usage.status, 2);
  assert.deepEqual(JSON.parse(usage.stderr), {
    error: {
      kind: "usage",
      message: '--query requires a value; use --query=<value> when the value starts with "-"',
    },
    type: "error",
  });

  const auth = runCliSync(["search", "--query", "Parallel Search API", "--json-errors"]);
  assert.equal(auth.status, 3);
  assert.equal(JSON.parse(auth.stderr).error.kind, "auth");
});

void test("extract strict mode preserves the response and reports partial failures", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        errors: [
          {
            content: "Source returned an error",
            error_type: "fetch_error",
            http_status_code: 500,
            url: "https://example.com/failure",
          },
        ],
        extract_id: "extract_test",
        results: [],
        session_id: "session_test",
      }),
    );
  });
  const baseUrl = await listen(server);

  try {
    const result = await runCli([
      "extract",
      "https://example.com/failure",
      "--base-url",
      baseUrl,
      "--api-key",
      "test-key",
      "--fail-on-errors",
      "--json-errors",
      "--compact",
    ]);
    assert.equal(result.status, 6, result.stderr);
    assert.equal(JSON.parse(result.stdout).extract_id, "extract_test");
    const error = JSON.parse(result.stderr);
    assert.equal(error.error.kind, "partial");
    assert.equal(error.error.detail.length, 1);
  } finally {
    await close(server);
  }
});

void test("returns a stable timeout exit code", async () => {
  const server = createServer(() => {
    // Intentionally leave the response open until the client timeout aborts the request.
  });
  const baseUrl = await listen(server);

  try {
    const result = await runCli([
      "search",
      "--query",
      "Parallel Search API",
      "--base-url",
      baseUrl,
      "--api-key",
      "test-key",
      "--timeout",
      "20",
      "--json-errors",
    ]);
    assert.equal(result.status, 5, result.stderr);
    assert.equal(JSON.parse(result.stderr).error.kind, "timeout");
  } finally {
    await close(server);
  }
});

void test("surfaces nested API errors with status and reference ID", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(422, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: {
          detail: { field: "search_queries" },
          message: "Request validation error",
          ref_id: "search_test",
        },
        type: "error",
      }),
    );
  });
  const baseUrl = await listen(server);

  try {
    const result = await runCli([
      "search",
      "--query",
      "Parallel Search API",
      "--base-url",
      baseUrl,
      "--api-key",
      "test-key",
      "--json-errors",
    ]);
    assert.equal(result.status, 4, result.stderr);
    const error = JSON.parse(result.stderr);
    assert.deepEqual(error, {
      error: {
        detail: { field: "search_queries" },
        kind: "api",
        message: "422 Unprocessable Entity: Request validation error",
        ref_id: "search_test",
        status: 422,
      },
      type: "error",
    });
  } finally {
    await close(server);
  }
});

function runCliSync(args: string[]): { status: number | null; stderr: string; stdout: string } {
  const env = { ...process.env };
  delete env["PARALLEL_API_KEY"];
  delete env["PARALLEL_BASE_URL"];
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    env,
  });
  if (result.error) {
    throw result.error;
  }

  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

function runCli(
  args: string[],
): Promise<{ status: number | null; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status) => {
      resolve({ status, stderr, stdout });
    });
  });
}

function listen(server: ReturnType<typeof createServer>): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Could not determine test server address"));
        return;
      }

      resolve(`http://127.0.0.1:${address.port}/v1`);
    });
  });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
