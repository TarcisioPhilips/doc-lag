import path from "node:path";
import { describe, expect, it } from "vitest";
import { constrainToRoot, isInsideRoot } from "../src/core/paths.js";
import { ScanError } from "../src/errors.js";

describe("constrainToRoot", () => {
  const root = path.resolve("/tmp/doc-lag-root");

  it("allows . and nested relative paths", () => {
    expect(constrainToRoot(".", root)).toBe(root);
    expect(constrainToRoot("docs", root)).toBe(path.join(root, "docs"));
  });

  it("rejects .. traversal and outside absolute paths", () => {
    expect(() => constrainToRoot("..", root)).toThrow(ScanError);
    expect(() => constrainToRoot("../other", root)).toThrow(ScanError);
    expect(() => constrainToRoot("/etc", root)).toThrow(ScanError);
  });

  it("rejects null bytes", () => {
    expect(() => constrainToRoot("foo\0bar", root)).toThrow(/null byte/);
  });

  it("isInsideRoot matches constrain semantics", () => {
    expect(isInsideRoot(root, root)).toBe(true);
    expect(isInsideRoot(path.join(root, "a"), root)).toBe(true);
    expect(isInsideRoot(path.resolve(root, ".."), root)).toBe(false);
  });
});
