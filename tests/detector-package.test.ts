import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectPackageSurfaces } from "../src/docs-sync/detectors/package-json.js";
import { scan } from "../src/core/scan.js";
import {
  cleanupFixture,
  createFixtureRepo,
  type FixtureRepo,
} from "./helpers/fixture.js";

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    const repo = fixtures.pop();
    if (repo) cleanupFixture(repo);
  }
});

function track(fixture: FixtureRepo): FixtureRepo {
  fixtures.push(fixture.repo);
  return fixture;
}

describe("detectPackageSurfaces", () => {
  it("extracts object bin keys", () => {
    const content = JSON.stringify(
      {
        name: "demo",
        bin: { "demo-cli": "./cli.js", "demo-mcp": "./mcp.js" },
      },
      null,
      2,
    );
    const surfaces = detectPackageSurfaces("package.json", content);
    expect(surfaces.map((s) => s.name).sort()).toEqual(["demo-cli", "demo-mcp"]);
    expect(surfaces.every((s) => s.kind === "package.bin")).toBe(true);
  });

  it("package-bin-string-form uses unscoped package name", () => {
    const content = JSON.stringify(
      { name: "@acme/tools", bin: "./bin.js" },
      null,
      2,
    );
    const surfaces = detectPackageSurfaces("package.json", content);
    expect(surfaces).toEqual([
      expect.objectContaining({
        kind: "package.bin",
        name: "tools",
        pointer: "/bin",
      }),
    ]);
  });

  it("package-exports-added-opt-in; skipped when private", () => {
    const open = JSON.stringify(
      {
        name: "demo",
        exports: {
          ".": "./index.js",
          "./package.json": "./package.json",
          "./utils": "./utils.js",
        },
      },
      null,
      2,
    );
    const withExports = detectPackageSurfaces("package.json", open, {
      includeExports: true,
    });
    expect(withExports.filter((s) => s.kind === "package.exports").map((s) => s.name)).toEqual([
      "demo/utils",
    ]);

    const priv = JSON.stringify(
      {
        name: "demo",
        private: true,
        exports: { "./utils": "./utils.js" },
      },
      null,
      2,
    );
    expect(
      detectPackageSurfaces("package.json", priv, { includeExports: true }).filter(
        (s) => s.kind === "package.exports",
      ),
    ).toHaveLength(0);
  });
});

describe("package detector integration", () => {
  it("package-bin-added → finding when undocumented", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# pkg\n",
          "package.json": JSON.stringify({ name: "demo", private: true }, null, 2) + "\n",
        },
        headFiles: {
          "package.json":
            JSON.stringify(
              { name: "demo", private: true, bin: { "demo-cli": "./cli.js" } },
              null,
              2,
            ) + "\n",
        },
      }),
    );
    writeFileSync(
      path.join(fixture.repo, "doc-lag.config.json"),
      JSON.stringify({ docsSync: {} }),
    );
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(
      report.findings.some((f) => f.id === "docs.missing:package.bin:demo-cli@package.json"),
    ).toBe(true);
  });

  it("documented bin → 0", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# pkg\n",
          "package.json": JSON.stringify({ name: "demo", private: true }, null, 2) + "\n",
        },
        headFiles: {
          "package.json":
            JSON.stringify(
              { name: "demo", private: true, bin: { "demo-cli": "./cli.js" } },
              null,
              2,
            ) + "\n",
          "README.md": "Run `demo-cli`.\n",
        },
      }),
    );
    writeFileSync(
      path.join(fixture.repo, "doc-lag.config.json"),
      JSON.stringify({ docsSync: {} }),
    );
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(
      report.findings.filter((f) => f.id.includes("package.bin:demo-cli")),
    ).toHaveLength(0);
  });

  it("package-exports requires opt-in detector", () => {
    const basePkg = {
      name: "demo",
      exports: { ".": "./index.js" },
    };
    const headPkg = {
      name: "demo",
      exports: { ".": "./index.js", "./utils": "./utils.js" },
    };
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# pkg\n",
          "package.json": JSON.stringify(basePkg, null, 2) + "\n",
        },
        headFiles: {
          "package.json": JSON.stringify(headPkg, null, 2) + "\n",
        },
      }),
    );

    writeFileSync(
      path.join(fixture.repo, "doc-lag.config.json"),
      JSON.stringify({ docsSync: {} }),
    );
    const off = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(off.findings.filter((f) => f.id.includes("package.exports"))).toHaveLength(0);

    writeFileSync(
      path.join(fixture.repo, "doc-lag.config.json"),
      JSON.stringify({
        docsSync: { detectors: { "package.exports": true } },
      }),
    );
    const on = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(
      on.findings.some((f) => f.id === "docs.missing:package.exports:demo/utils@package.json"),
    ).toBe(true);
  });

  it("ignoreSymbols suppresses a surface", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# pkg\n",
          "package.json": JSON.stringify({ name: "demo", private: true }, null, 2) + "\n",
        },
        headFiles: {
          "package.json":
            JSON.stringify(
              { name: "demo", private: true, bin: { "demo-cli": "./cli.js" } },
              null,
              2,
            ) + "\n",
        },
      }),
    );
    writeFileSync(
      path.join(fixture.repo, "doc-lag.config.json"),
      JSON.stringify({
        docsSync: { ignoreSymbols: ["package.bin:demo-cli"] },
      }),
    );
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(
      report.findings.filter((f) => f.id.includes("package.bin:demo-cli")),
    ).toHaveLength(0);
  });
});
