import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const script = fileURLToPath(new URL("../scripts/check-avid-documentation-drift.mjs", import.meta.url));
const currentFixture = fileURLToPath(
  new URL("./fixtures/avid-version-matrix-current.html", import.meta.url),
);
const wrongProductFixture = fileURLToPath(
  new URL("./fixtures/avid-version-matrix-wrong-product.html", import.meta.url),
);

describe("Avid documentation drift checker", () => {
  it("reports a current product-scoped Media Composer matrix without writing files", () => {
    const output = execFileSync(process.execPath, [script, "--content-file", currentFixture], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    expect(JSON.parse(output)).toMatchObject({
      source: "local-fixture",
      status: "current",
      expected: [{ product: "Media Composer", latestPatch: "2025.12.2" }],
    });
  });

  it("fails closed when similarly numbered evidence belongs to another Avid product", () => {
    expect(() =>
      execFileSync(process.execPath, [script, "--content-file", wrongProductFixture], {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: "pipe",
      }),
    ).toThrow();
  });
});
