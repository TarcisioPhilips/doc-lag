import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isEntryPoint } from "../src/is-entry.js";

describe("isEntryPoint", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "doc-lag-entry-"));
  const real = path.join(dir, "cli.js");
  writeFileSync(real, "");
  const link = path.join(dir, "doc-lag");
  symlinkSync(real, link);
  const url = pathToFileURL(real).href;

  it("matches when started directly", () => {
    expect(isEntryPoint(real, url)).toBe(true);
  });

  it("matches when started through an npm bin symlink", () => {
    expect(isEntryPoint(link, url)).toBe(true);
  });

  it("does not match another script or a missing argv", () => {
    expect(isEntryPoint(path.join(dir, "other.js"), url)).toBe(false);
    expect(isEntryPoint(undefined, url)).toBe(false);
  });
});
