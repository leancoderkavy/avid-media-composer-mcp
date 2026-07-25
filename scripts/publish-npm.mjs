#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import process from "node:process";
import packageJson from "../package.json" with { type: "json" };

const flags = new Set(process.argv.slice(2));
const dryRun = flags.has("--dry-run");
const skipTests = flags.has("--skip-tests");
const nonInteractive = flags.has("--yes") || process.env.CI === "true";

function npmInvocation(args) {
  const npmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  return existsSync(npmCli)
    ? { command: process.execPath, args: [npmCli, ...args], rendered: `npm ${args.join(" ")}` }
    : { command: "npm", args, rendered: `npm ${args.join(" ")}` };
}

function runNpm(args, capture = false, extraEnv = {}) {
  const invocation = npmInvocation(args);
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      shell: false,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      env: { ...process.env, ...extraEnv },
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.stderr?.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(`${invocation.rendered} failed (${code})\n${stderr.trim()}`));
    });
  });
}

async function registryVersion() {
  try {
    const result = await runNpm(
      ["view", `${packageJson.name}@${packageJson.version}`, "version"],
      true,
    );
    return result.stdout || undefined;
  } catch {
    return undefined;
  }
}

async function authenticatedIdentity() {
  if (process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN) return "token-auth";
  try {
    return (await runNpm(["whoami"], true)).stdout || undefined;
  } catch {
    return undefined;
  }
}

async function prompt(question) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await terminal.question(question)).trim();
  } finally {
    terminal.close();
  }
}

async function main() {
  console.log(
    `Preparing ${packageJson.name}@${packageJson.version} for ${dryRun ? "dry run" : "publication"}...`,
  );
  if ((await registryVersion()) && !dryRun) {
    throw new Error(`${packageJson.name}@${packageJson.version} is already published.`);
  }
  const identity = await authenticatedIdentity();
  if (!identity && !dryRun) {
    throw new Error(
      "npm authentication is required. Run npm login --auth-type=web or configure NPM_TOKEN.",
    );
  }
  if (identity) console.log(`npm identity: ${identity}`);

  await runNpm(["run", "build"]);
  if (!skipTests) await runNpm(["run", "test:all"]);
  await runNpm(["pack", "--dry-run"]);
  if (dryRun) {
    console.log(`Dry run passed for ${packageJson.name}@${packageJson.version}.`);
    return;
  }

  if (!nonInteractive) {
    const confirmation = await prompt(
      `Publish ${packageJson.name}@${packageJson.version} as latest? Type yes: `,
    );
    if (confirmation.toLowerCase() !== "yes") throw new Error("Publication cancelled.");
  }

  const args = ["publish", "--access", "public"];
  if (process.env.CI === "true") args.push("--provenance");
  if (process.env.NPM_OTP) args.push(`--otp=${process.env.NPM_OTP}`);
  await runNpm(
    args,
    false,
    process.env.NPM_TOKEN ? { NODE_AUTH_TOKEN: process.env.NPM_TOKEN } : {},
  );
  const latest = await runNpm(["view", packageJson.name, "version"], true);
  if (latest.stdout !== packageJson.version) {
    throw new Error(`Registry verification returned '${latest.stdout}'.`);
  }
  console.log(`Verified ${packageJson.name}@${latest.stdout} on npm.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
