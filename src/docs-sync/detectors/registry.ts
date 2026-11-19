import type { SurfaceKind } from "../../core/docs-sync-config.js";
import { detectActionSurfaces } from "./action-yml.js";
import { detectPackageSurfaces } from "./package-json.js";
import type { DetectorRegistration, SurfaceDecl } from "./types.js";

/** Detectors implemented in this step (structured files only). */
export const STRUCTURED_DETECTOR_KINDS = [
  "action.input",
  "action.output",
  "package.bin",
  "package.exports",
] as const satisfies readonly SurfaceKind[];

export type StructuredDetectorKind = (typeof STRUCTURED_DETECTOR_KINDS)[number];

/**
 * Registry of implemented detectors. CLI/MCP/env detectors register in later tasks.
 */
export function listRegisteredDetectors(): DetectorRegistration[] {
  return [
    {
      kind: "action.input",
      detect: (path, content) =>
        detectActionSurfaces(path, content).filter((s) => s.kind === "action.input"),
    },
    {
      kind: "action.output",
      detect: (path, content) =>
        detectActionSurfaces(path, content).filter((s) => s.kind === "action.output"),
    },
    {
      kind: "package.bin",
      detect: (path, content) =>
        detectPackageSurfaces(path, content, { includeExports: false }).filter(
          (s) => s.kind === "package.bin",
        ),
    },
    {
      kind: "package.exports",
      detect: (path, content) =>
        detectPackageSurfaces(path, content, { includeExports: true }).filter(
          (s) => s.kind === "package.exports",
        ),
    },
  ];
}

export function runRegisteredDetectors(options: {
  kinds: Iterable<SurfaceKind>;
  path: string;
  content: string;
  warn?: (message: string) => void;
}): SurfaceDecl[] {
  const enabled = new Set(options.kinds);
  const out: SurfaceDecl[] = [];
  // Run structured extractors once per file when any related kind is enabled.
  if (enabled.has("action.input") || enabled.has("action.output")) {
    for (const surface of detectActionSurfaces(options.path, options.content, {
      warn: options.warn,
    })) {
      if (enabled.has(surface.kind)) {
        out.push(surface);
      }
    }
  }
  if (enabled.has("package.bin") || enabled.has("package.exports")) {
    for (const surface of detectPackageSurfaces(options.path, options.content, {
      includeExports: enabled.has("package.exports"),
      warn: options.warn,
    })) {
      if (enabled.has(surface.kind)) {
        out.push(surface);
      }
    }
  }
  return out;
}

export function isStructuredDetectorKind(kind: SurfaceKind): boolean {
  return (STRUCTURED_DETECTOR_KINDS as readonly string[]).includes(kind);
}
