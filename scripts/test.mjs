import { spawnSync } from "node:child_process";
import { rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "esbuild";

const outputDirectory = await mkdtemp(
  join(tmpdir(), "fivemesh-sdk-tests-"),
);
const outputFile = join(outputDirectory, "logs.test.mjs");

try {
  await build({
    bundle: true,
    entryPoints: ["tests/logs.test.ts"],
    format: "esm",
    logLevel: "silent",
    outfile: outputFile,
    platform: "node",
    target: ["node20"],
  });
  const result = spawnSync(process.execPath, ["--test", outputFile], {
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(outputDirectory, { force: true, recursive: true });
}
