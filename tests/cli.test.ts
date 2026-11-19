import { execFileSync, type SpawnSyncReturns } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runScanCommand } from "../src/cli.js";
import {
  cleanupFixture,
  createFixtureRepo,
  packageJson,
  type FixtureRepo,
} from "./helpers/fixture.js";

const cliEntry = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
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

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(
      process.execPath,
      ["--import", "tsx", cliEntry, ...args],
      { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const result = error as SpawnSyncReturns<string>;
    return {
      status: result.status ?? 1,
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
    };
  }
}

describe("CLI", () => {
  it("prints text findings and exits 1 when --fail-on confirmed", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ "deploy:preview": "vite preview" }),
          "README.md": "Use `npm run deploy:preview`.\n",
        },
        headFiles: {
          "package.json": packageJson({}),
        },
      }),
    );

    const result = runCli([
      "scan",
      "--base",
      fixture.base,
      "--head",
      fixture.head,
      "--cwd",
      fixture.repo,
    ]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("CONFIRMED  README.md:1");
    expect(result.stdout).toContain("npm run deploy:preview");
  });

  it("prints JSON and exits 0 with --fail-on none", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ "deploy:preview": "vite preview" }),
          "README.md": "Use `npm run deploy:preview`.\n",
        },
        headFiles: {
          "package.json": packageJson({}),
        },
      }),
    );

    const result = runCli([
      "scan",
      "--base",
      fixture.base,
      "--head",
      fixture.head,
      "--format",
      "json",
      "--fail-on",
      "none",
      "--cwd",
      fixture.repo,
    ]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as { schemaVersion: string; findings: unknown[] };
    expect(parsed.schemaVersion).toBe("1.0");
    expect(parsed.findings).toHaveLength(1);
  });

  it("exits 2 for an invalid git ref", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ build: "tsc" }),
          "README.md": "Hi.\n",
        },
      }),
    );

    const result = runCli([
      "scan",
      "--base",
      "not-a-real-ref",
      "--head",
      "HEAD",
      "--cwd",
      fixture.repo,
    ]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Invalid git ref");
    expect(result.stdout).toBe("");
  });

  it("exits 2 when required --base is missing", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ build: "tsc" }),
        },
      }),
    );
    const result = runCli(["scan", "--cwd", fixture.repo]);
    expect(result.status).toBe(2);
  });

  it("exits 2 when --rank jev is set without TYPESAFE_API_KEY", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ build: "tsc" }),
          "src/old.ts": "export {};\n",
          "docs/guide.md": "See `src/old.ts`.\n",
        },
        headFiles: {
          "src/old.ts": null,
        },
      }),
    );
    const previous = process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    delete process.env.DOC_LAG_RANK;
    try {
      const result = runCli([
        "scan",
        "--base",
        fixture.base,
        "--head",
        fixture.head,
        "--cwd",
        fixture.repo,
        "--rank",
        "jev",
      ]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("TYPESAFE_API_KEY");
      expect(result.stderr).toContain("Privacy notice");
      expect(result.stderr).not.toMatch(/Authorization:\s*Bearer\s+(?!\[REDACTED\])/);
    } finally {
      if (previous === undefined) {
        delete process.env.TYPESAFE_API_KEY;
      } else {
        process.env.TYPESAFE_API_KEY = previous;
      }
    }
  });

  it("honors --docs-include for MDX paths", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ "deploy:preview": "vite preview" }),
          "README.md": "# App\n",
          "notes/run.mdx": "Use `npm run deploy:preview`.\n",
        },
        headFiles: {
          "package.json": packageJson({}),
        },
      }),
    );

    const result = runCli([
      "scan",
      "--base",
      fixture.base,
      "--head",
      fixture.head,
      "--cwd",
      fixture.repo,
      "--docs-include",
      "notes/**/*.mdx",
    ]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("notes/run.mdx");
    expect(result.stdout).not.toContain("README.md:1");
  });

  it("runScanCommand returns the same exit contract as the CLI", async () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({ lint: "eslint ." }),
          "README.md": "`npm run lint`\n",
        },
        headFiles: {
          "package.json": packageJson({}),
        },
      }),
    );
    const confirmed = await runScanCommand({
      base: fixture.base,
      head: fixture.head,
      format: "text",
      failOn: "confirmed",
      cwd: fixture.repo,
    });
    expect(confirmed.exitCode).toBe(1);
    const ignored = await runScanCommand({
      base: fixture.base,
      head: fixture.head,
      format: "json",
      failOn: "none",
      cwd: fixture.repo,
    });
    expect(ignored.exitCode).toBe(0);
    expect(JSON.parse(ignored.output).findings).toHaveLength(1);
  });
});
