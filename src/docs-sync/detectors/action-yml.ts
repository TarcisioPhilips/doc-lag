import { isMap, isScalar, LineCounter, parseDocument } from "yaml";
import type { SurfaceDecl } from "./types.js";

function isActionYmlPath(filePath: string): boolean {
  const base = filePath.split("/").pop() ?? "";
  return base === "action.yml" || base === "action.yaml";
}

function jsonPointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function lineForNode(
  lineCounter: LineCounter,
  node: { range?: [number, number, number] | null } | null | undefined,
): number {
  if (!node?.range) {
    return 1;
  }
  return lineCounter.linePos(node.range[0]).line;
}

function isHiddenInput(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const body = value as Record<string, unknown>;
  if (typeof body.deprecationMessage === "string" && body.deprecationMessage.length > 0) {
    return true;
  }
  if (typeof body.description === "string" && body.description.startsWith("[internal]")) {
    return true;
  }
  return false;
}

/**
 * Extract GitHub Action inputs/outputs from action.yml / action.yaml.
 * Invalid YAML → empty list (caller may warn).
 */
export function detectActionSurfaces(
  filePath: string,
  content: string,
  options: { warn?: (message: string) => void } = {},
): SurfaceDecl[] {
  if (!isActionYmlPath(filePath)) {
    return [];
  }

  const lineCounter = new LineCounter();
  let doc;
  try {
    doc = parseDocument(content, { lineCounter, uniqueKeys: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.warn?.(`doc-lag: unable to parse ${filePath} as YAML (${message}); skipping action detectors`);
    return [];
  }
  if (doc.errors.length > 0) {
    options.warn?.(
      `doc-lag: invalid YAML in ${filePath}; skipping action detectors`,
    );
    return [];
  }

  const root = doc.contents;
  if (!isMap(root)) {
    return [];
  }

  const results: SurfaceDecl[] = [];

  for (const section of ["inputs", "outputs"] as const) {
    const kind = section === "inputs" ? "action.input" : "action.output";
    const sectionNode = root.get(section, true);
    if (!isMap(sectionNode)) {
      continue;
    }
    for (const item of sectionNode.items) {
      if (!isScalar(item.key)) {
        continue;
      }
      const name = String(item.key.value ?? "").trim();
      if (!name) {
        continue;
      }
      if (section === "inputs") {
        const valueNode = item.value;
        const raw =
          valueNode &&
          typeof valueNode === "object" &&
          "toJSON" in valueNode &&
          typeof (valueNode as { toJSON: unknown }).toJSON === "function"
            ? (valueNode as { toJSON: () => unknown }).toJSON()
            : undefined;
        if (isHiddenInput(raw)) {
          continue;
        }
      }
      const line = lineForNode(lineCounter, item.key);
      results.push({
        kind,
        name,
        path: filePath,
        line,
        pointer: `/${section}/${jsonPointerSegment(name)}`,
        literal: `${name}:`,
      });
    }
  }

  return results;
}
