import { context } from "esbuild";

const watch = process.argv.includes("--watch");

const targets = [
  {
    entryPoints: ["src/server/index.ts"],
    outfile: "dist/server.js",
    platform: "node",
    format: "cjs",
    target: ["node16"],
  },
  {
    entryPoints: ["src/client/index.ts"],
    outfile: "dist/client.js",
    platform: "browser",
    format: "iife",
    target: ["es2021"],
  },
];

for (const target of targets) {
  const ctx = await context({
    bundle: true,
    logLevel: "info",
    sourcemap: false,
    ...target,
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

if (watch) {
  console.log("[FiveMesh SDK] Watching for changes...");
}
