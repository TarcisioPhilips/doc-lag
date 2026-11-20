import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scan } from "../src/core/scan.js";
import { detectCliCommands } from "../src/docs-sync/detectors/cli-commands.js";
import {
  detectCliFlags,
  parseLongFlagName,
} from "../src/docs-sync/detectors/cli-flags.js";
import { stripJsStyleComments, stripPythonComments } from "../src/docs-sync/detectors/comment-strip.js";
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

function enableDocsSync(repo: string, extra: Record<string, unknown> = {}): void {
  writeFileSync(
    path.join(repo, "doc-lag.config.json"),
    JSON.stringify({ docsSync: { ...extra } }),
  );
}

const COMMANDER_BASE = `import { Command } from "commander";
const program = new Command();
program.option("--verbose", "verbose");
`;

describe("parseLongFlagName / comment strip", () => {
  it("extracts long flags and ignores short-only", () => {
    expect(parseLongFlagName("-v, --verbose")).toEqual(
      expect.objectContaining({ name: "--verbose" }),
    );
    expect(parseLongFlagName("--out <path>")).toEqual(
      expect.objectContaining({ name: "--out" }),
    );
    expect(parseLongFlagName("-x")).toBeNull();
    expect(parseLongFlagName("--no-color")?.mentionNames).toEqual([
      "--no-color",
      "--color",
    ]);
    expect(parseLongFlagName("--shout/--no-shout", { clickSlashPair: true })).toEqual(
      expect.objectContaining({
        name: "--shout",
        mentionNames: ["--shout", "--no-shout"],
      }),
    );
  });

  it("strips comments so flagged strings inside them disappear", () => {
    const js = stripJsStyleComments(
      `import { Command } from "commander";\n// .option("--hidden")\n/* .option("--block") */\nprogram.option("--ok");\n`,
    );
    expect(js).not.toContain("--hidden");
    expect(js).not.toContain("--block");
    expect(js).toContain("--ok");

    const py = stripPythonComments(
      `import argparse\n# parser.add_argument("--hidden")\nparser.add_argument("--ok")\n`,
    );
    expect(py).not.toContain("--hidden");
    expect(py).toContain("--ok");
  });
});

describe("detectCliFlags unit", () => {
  it("detects commander option / requiredOption / new Option", () => {
    const content = `
import { Command, Option } from "commander";
const program = new Command();
program
  .option("-v, --verbose", "verbose")
  .requiredOption("--config <path>", "config")
  .addOption(new Option("--rank <provider>", "rank"));
`;
    const flags = detectCliFlags("src/cli.ts", content).map((s) => s.name).sort();
    expect(flags).toEqual(["--config", "--rank", "--verbose"]);
  });

  it("skips hideHelp / hidden and variable args / no import", () => {
    expect(
      detectCliFlags(
        "src/cli.ts",
        `import { Command } from "commander";
program.option("--secret").hideHelp();
program.option("--also", { hidden: true });
const FLAG = "--var";
program.option(FLAG);
`,
      ).map((s) => s.name),
    ).toEqual([]);

    expect(
      detectCliFlags(
        "src/other.ts",
        `other.option("--x");\n`,
      ),
    ).toHaveLength(0);
  });

  it("detects argparse and click flags with suppress/hidden", () => {
    const argparse = detectCliFlags(
      "cli.py",
      `import argparse
p = argparse.ArgumentParser()
p.add_argument("--verbose")
p.add_argument("--quiet", help=argparse.SUPPRESS)
p.add_argument("-x")
`,
    );
    expect(argparse.map((s) => s.name)).toEqual(["--verbose"]);

    const click = detectCliFlags(
      "cli.py",
      `import click
@click.option("--shout/--no-shout")
@click.option("--hidden-flag", hidden=True)
@click.command()
def main():
    pass
`,
    );
    expect(click.map((s) => s.name)).toEqual(["--shout"]);
    expect(click[0]?.mentionNames).toEqual(["--shout", "--no-shout"]);
  });
});

describe("detectCliCommands unit", () => {
  it("detects commander commands and skips underscore / hidden", () => {
    const content = `
import { Command } from "commander";
const program = new Command();
program.command("deploy [env]");
program.command("_internal");
program.command("secret").hideHelp();
`;
    expect(detectCliCommands("src/cli.ts", content).map((s) => s.name)).toEqual([
      "deploy",
    ]);
  });

  it("detects argparse add_parser names", () => {
    const content = `
import argparse
parser = argparse.ArgumentParser()
sub = parser.add_subparsers()
sub.add_parser("sync")
sub.add_parser("status")
`;
    expect(detectCliCommands("cli.py", content).map((s) => s.name).sort()).toEqual([
      "status",
      "sync",
    ]);
  });
});

describe("cli detector integration", () => {
  it("cli-flag-commander-added-undocumented → 1 finding", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "Use `--verbose`.\n",
          "src/cli.ts": COMMANDER_BASE,
        },
        headFiles: {
          "src/cli.ts": `${COMMANDER_BASE}program.option("--foo", "foo");\n`,
        },
      }),
    );
    enableDocsSync(fixture.repo);
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings.map((f) => f.id)).toContain(
      "docs.missing:cli.flag:--foo@src/cli.ts",
    );
  });

  it("cli-flag-commander-added-documented-readme → 0", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "Use `--verbose`.\n",
          "src/cli.ts": COMMANDER_BASE,
        },
        headFiles: {
          "src/cli.ts": `${COMMANDER_BASE}program.option("--foo", "foo");\n`,
          "README.md": "Use `--verbose` and `--foo`.\n",
        },
      }),
    );
    enableDocsSync(fixture.repo);
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings.filter((f) => f.id.includes("cli.flag:--foo"))).toHaveLength(0);
  });

  it("cli-flag-commander-hidden → 0", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# cli\n",
          "src/cli.ts": COMMANDER_BASE,
        },
        headFiles: {
          "src/cli.ts": `${COMMANDER_BASE}program.option("--secret", "x").hideHelp();\n`,
        },
      }),
    );
    enableDocsSync(fixture.repo);
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings.filter((f) => f.id.includes("--secret"))).toHaveLength(0);
  });

  it("cli-flag-commander-negated-documented-positive → 0", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "Toggle `--color`.\n",
          "src/cli.ts": COMMANDER_BASE,
        },
        headFiles: {
          "src/cli.ts": `${COMMANDER_BASE}program.option("--no-color", "disable color");\n`,
        },
      }),
    );
    enableDocsSync(fixture.repo);
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings.filter((f) => f.id.includes("--no-color"))).toHaveLength(0);
  });

  it("cli-flag-short-only / variable-arg / in-comment / no-commander-import → 0", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# cli\n",
          "src/cli.ts": COMMANDER_BASE,
          "src/other.ts": `export function option(x: string) {}\n`,
        },
        headFiles: {
          "src/cli.ts": `${COMMANDER_BASE}
program.option("-x", "short only");
const FLAG = "--var";
program.option(FLAG);
// program.option("--commented");
`,
          "src/other.ts": `export function option(x: string) {}
option("--x");
`,
        },
      }),
    );
    enableDocsSync(fixture.repo);
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    const cliFlags = report.findings.filter((f) => f.ruleId === "docs.missing" && f.id.includes("cli.flag"));
    expect(cliFlags).toHaveLength(0);
  });

  it("cli-flag-moved-between-files → 0", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# cli\n",
          "src/a.ts": `import { Command } from "commander";
new Command().option("--shared", "x");
`,
          "src/b.ts": `import { Command } from "commander";
new Command();
`,
        },
        headFiles: {
          "src/a.ts": `import { Command } from "commander";
new Command();
`,
          "src/b.ts": `import { Command } from "commander";
new Command().option("--shared", "x");
`,
        },
      }),
    );
    enableDocsSync(fixture.repo);
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings.filter((f) => f.id.includes("--shared"))).toHaveLength(0);
  });

  it("cli-flag-renamed → 1 for --new", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "Use `--old`.\n",
          "src/cli.ts": `import { Command } from "commander";
new Command().option("--old", "old");
`,
        },
        headFiles: {
          "src/cli.ts": `import { Command } from "commander";
new Command().option("--new", "new");
`,
        },
      }),
    );
    enableDocsSync(fixture.repo);
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings.map((f) => f.id)).toContain(
      "docs.missing:cli.flag:--new@src/cli.ts",
    );
    expect(report.findings.filter((f) => f.id.includes("--old"))).toHaveLength(0);
  });

  it("cli-flag-argparse-added / suppressed", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# py\n",
          "cli.py": `import argparse
p = argparse.ArgumentParser()
`,
        },
        headFiles: {
          "cli.py": `import argparse
p = argparse.ArgumentParser()
p.add_argument("--verbose")
p.add_argument("--quiet", help=argparse.SUPPRESS)
`,
        },
      }),
    );
    enableDocsSync(fixture.repo);
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.findings.map((f) => f.id)).toContain(
      "docs.missing:cli.flag:--verbose@cli.py",
    );
    expect(report.findings.filter((f) => f.id.includes("--quiet"))).toHaveLength(0);
  });

  it("cli-flag-click-added / slash-pair / hidden", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# py\n",
          "cli.py": `import click
@click.command()
def main():
    pass
`,
        },
        headFiles: {
          "cli.py": `import click
@click.option("--shout/--no-shout")
@click.option("--hidden-flag", hidden=True)
@click.option("--plain")
@click.command()
def main():
    pass
`,
          "README.md": "Supports `--no-shout`.\n",
        },
      }),
    );
    enableDocsSync(fixture.repo);
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    const ids = report.findings.map((f) => f.id);
    expect(ids).toContain("docs.missing:cli.flag:--plain@cli.py");
    expect(ids.filter((id) => id.includes("--shout"))).toHaveLength(0);
    expect(ids.filter((id) => id.includes("--hidden-flag"))).toHaveLength(0);
  });

  it("cli-command-commander-added / argparse-subparser", () => {
    const ts = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# cli\n",
          "src/cli.ts": `import { Command } from "commander";
new Command();
`,
        },
        headFiles: {
          "src/cli.ts": `import { Command } from "commander";
new Command().command("deploy [env]");
`,
        },
      }),
    );
    enableDocsSync(ts.repo);
    const tsReport = scan({ cwd: ts.repo, base: ts.base, head: ts.head });
    expect(tsReport.findings.map((f) => f.id)).toContain(
      "docs.missing:cli.command:deploy@src/cli.ts",
    );

    const py = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# py\n",
          "cli.py": `import argparse
p = argparse.ArgumentParser()
p.add_subparsers()
`,
        },
        headFiles: {
          "cli.py": `import argparse
p = argparse.ArgumentParser()
sub = p.add_subparsers()
sub.add_parser("sync")
`,
        },
      }),
    );
    enableDocsSync(py.repo);
    const pyReport = scan({ cwd: py.repo, base: py.base, head: py.head });
    expect(pyReport.findings.map((f) => f.id)).toContain(
      "docs.missing:cli.command:sync@cli.py",
    );
  });

  it("docsSync off → byte-identical (no docsSync field)", () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "README.md": "# cli\n",
          "src/cli.ts": COMMANDER_BASE,
        },
        headFiles: {
          "src/cli.ts": `${COMMANDER_BASE}program.option("--foo");\n`,
        },
      }),
    );
    const report = scan({ cwd: fixture.repo, base: fixture.base, head: fixture.head });
    expect(report.docsSync).toBeUndefined();
    expect(report.findings.filter((f) => f.ruleId === "docs.missing")).toHaveLength(0);
  });
});
