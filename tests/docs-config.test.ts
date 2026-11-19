import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverConfigPath,
  loadConfigFile,
  parseDocLagConfig,
  parseGlobList,
  resolveDocsDiscoveryOptions,
  DEFAULT_DOCS_EXCLUDE,
  DEFAULT_DOCS_INCLUDE,
} from "../src/core/docs-config.js";
import { ScanError } from "../src/errors.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function tempCwd(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "doc-lag-config-"));
  tempDirs.push(dir);
  return dir;
}

describe("parseDocLagConfig", () => {
  it("accepts empty docs and partial docs", () => {
    expect(parseDocLagConfig({}, "x")).toEqual({});
    expect(
      parseDocLagConfig({ docs: { include: ["README.md"] } }, "x"),
    ).toEqual({ docs: { include: ["README.md"] } });
  });

  it("rejects invalid shapes", () => {
    expect(() => parseDocLagConfig([], "x")).toThrow(ScanError);
    expect(() => parseDocLagConfig({ docs: [] }, "x")).toThrow(/docs/);
    expect(() => parseDocLagConfig({ docs: { include: [1] } }, "x")).toThrow(/include/);
  });
});

describe("resolveDocsDiscoveryOptions", () => {
  it("returns built-in defaults with no config", () => {
    const cwd = tempCwd();
    const resolved = resolveDocsDiscoveryOptions(cwd);
    expect(resolved.include).toEqual([...DEFAULT_DOCS_INCLUDE]);
    expect(resolved.exclude).toEqual([...DEFAULT_DOCS_EXCLUDE]);
  });

  it("loads doc-lag.config.json and replaces keys", () => {
    const cwd = tempCwd();
    writeFileSync(
      path.join(cwd, "doc-lag.config.json"),
      JSON.stringify({ docs: { include: ["README.md", "notes/**/*.md"] } }),
      "utf8",
    );
    const resolved = resolveDocsDiscoveryOptions(cwd);
    expect(resolved.include).toEqual(["README.md", "notes/**/*.md"]);
    expect(resolved.exclude).toEqual([...DEFAULT_DOCS_EXCLUDE]);
  });

  it("prefers doc-lag.config.json over .doc-lag.json with a warning", () => {
    const cwd = tempCwd();
    writeFileSync(path.join(cwd, "doc-lag.config.json"), JSON.stringify({ docs: { include: ["a.md"] } }));
    writeFileSync(path.join(cwd, ".doc-lag.json"), JSON.stringify({ docs: { include: ["b.md"] } }));
    const warnings: string[] = [];
    const resolved = resolveDocsDiscoveryOptions(cwd, {
      warn: (message) => warnings.push(message),
    });
    expect(resolved.include).toEqual(["a.md"]);
    expect(warnings.some((w) => w.includes("both"))).toBe(true);
  });

  it("loads .doc-lag.json when primary is absent", () => {
    const cwd = tempCwd();
    writeFileSync(
      path.join(cwd, ".doc-lag.json"),
      JSON.stringify({ docs: { exclude: ["**/tmp/**"] } }),
    );
    const resolved = resolveDocsDiscoveryOptions(cwd);
    expect(resolved.include).toEqual([...DEFAULT_DOCS_INCLUDE]);
    expect(resolved.exclude).toEqual(["**/tmp/**"]);
  });

  it("lets CLI overrides replace config include", () => {
    const cwd = tempCwd();
    writeFileSync(
      path.join(cwd, "doc-lag.config.json"),
      JSON.stringify({ docs: { include: ["docs/**/*.md"] } }),
    );
    const resolved = resolveDocsDiscoveryOptions(cwd, {
      include: ["packages/*/README.md"],
    });
    expect(resolved.include).toEqual(["packages/*/README.md"]);
  });

  it("errors on missing explicit config path", () => {
    const cwd = tempCwd();
    expect(() =>
      resolveDocsDiscoveryOptions(cwd, { configPath: "missing.json" }),
    ).toThrow(/not found/);
  });

  it("errors on invalid JSON", () => {
    const cwd = tempCwd();
    writeFileSync(path.join(cwd, "doc-lag.config.json"), "{nope", "utf8");
    expect(() => resolveDocsDiscoveryOptions(cwd)).toThrow(/Invalid JSON/);
  });

  it("errors when include resolves empty", () => {
    const cwd = tempCwd();
    expect(() => resolveDocsDiscoveryOptions(cwd, { include: [] })).toThrow(/empty/);
  });

  it("loads nested config via configPath", () => {
    const cwd = tempCwd();
    mkdirSync(path.join(cwd, "cfg"), { recursive: true });
    const configPath = path.join(cwd, "cfg", "custom.json");
    writeFileSync(configPath, JSON.stringify({ docs: { include: ["only.md"] } }));
    const resolved = resolveDocsDiscoveryOptions(cwd, { configPath: "cfg/custom.json" });
    expect(resolved.include).toEqual(["only.md"]);
    expect(loadConfigFile(configPath).docs?.include).toEqual(["only.md"]);
    expect(discoverConfigPath(cwd)).toBeUndefined();
  });
});

describe("parseGlobList", () => {
  it("splits on commas and newlines", () => {
    expect(parseGlobList("a.md, b.md")).toEqual(["a.md", "b.md"]);
    expect(parseGlobList("a.md\nb.md")).toEqual(["a.md", "b.md"]);
    expect(parseGlobList("")).toBeUndefined();
    expect(parseGlobList(undefined)).toBeUndefined();
  });
});
