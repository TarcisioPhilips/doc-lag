import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { createDocLagMcpServer } from "../src/mcp/server.js";
import {
  cleanupFixture,
  createFixtureRepo,
  packageJson,
  type FixtureRepo,
} from "./helpers/fixture.js";

const fixtures: string[] = [];
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const cliEntry = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

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

async function withInMemoryClient(
  workspaceRoot: string,
  fn: (client: Client) => Promise<void>,
): Promise<void> {
  const server = createDocLagMcpServer({ workspaceRoot });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "doc-lag-test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

describe("MCP server in-process round trip", () => {
  it("lists tools with readOnly annotations", async () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "README.md": "x\n",
        },
      }),
    );

    await withInMemoryClient(fixture.repo, async (client) => {
      const tools = await client.listTools();
      const names = tools.tools.map((tool) => tool.name).sort();
      expect(names).toEqual(["explain_finding", "list_rules", "scan_diff"]);
      for (const tool of tools.tools) {
        expect(tool.annotations?.readOnlyHint).toBe(true);
      }
      const byName = Object.fromEntries(tools.tools.map((tool) => [tool.name, tool]));
      // scan_diff may call TypeSafe AI when rank=jev; other tools stay offline.
      expect(byName.scan_diff?.annotations?.openWorldHint).toBe(true);
      expect(byName.explain_finding?.annotations?.openWorldHint).toBe(false);
      expect(byName.list_rules?.annotations?.openWorldHint).toBe(false);
      expect(byName.scan_diff?.description).toMatch(/docs\.missing/);
      expect(byName.scan_diff?.description).toMatch(/docs_sync/);
      const scanSchema = byName.scan_diff?.inputSchema as {
        properties?: Record<string, unknown>;
      };
      expect(scanSchema?.properties).toHaveProperty("docs_sync");
      expect(scanSchema?.properties).toHaveProperty("docs_sync_enforce");
    });
  });

  it("scan_diff → explain_finding → list_rules over in-memory transport", async () => {
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

    await withInMemoryClient(fixture.repo, async (client) => {
      const scanResult = await client.callTool({
        name: "scan_diff",
        arguments: { base: fixture.base, head: fixture.head },
      });
      expect(scanResult.isError).toBeFalsy();
      const scanText = Array.isArray(scanResult.content)
        ? scanResult.content
            .filter((block): block is { type: "text"; text: string } => block.type === "text")
            .map((block) => block.text)
            .join("\n")
        : "";
      expect(scanText).toContain("scripts.missing");

      const structured = scanResult.structuredContent as {
        findings: Array<{ id: string }>;
      };
      expect(structured.findings.length).toBeGreaterThanOrEqual(1);
      const findingId = structured.findings[0]!.id;

      const explained = await client.callTool({
        name: "explain_finding",
        arguments: {
          finding_id: findingId,
          base: fixture.base,
          head: fixture.head,
        },
      });
      expect(explained.isError).toBeFalsy();
      const explainedData = explained.structuredContent as {
        finding: { id: string; evidence: unknown[] };
      };
      expect(explainedData.finding.id).toBe(findingId);
      expect(explainedData.finding.evidence.length).toBeGreaterThan(0);

      const rules = await client.callTool({ name: "list_rules", arguments: {} });
      expect(rules.isError).toBeFalsy();
      const rulesData = rules.structuredContent as {
        rules: Array<{ id: string }>;
        detectors: Array<{ id: string; defaultEnabled: boolean }>;
      };
      expect(rulesData.rules.map((rule) => rule.id)).toContain("links.broken");
      expect(rulesData.rules.map((rule) => rule.id)).toContain("docs.missing");
      expect(rulesData.detectors.some((d) => d.id === "cli.flag" && d.defaultEnabled)).toBe(true);
    });
  });

  it("returns isError for path traversal via MCP tool call", async () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "README.md": "x\n",
        },
      }),
    );

    await withInMemoryClient(fixture.repo, async (client) => {
      const result = await client.callTool({
        name: "scan_diff",
        arguments: {
          cwd: path.join("..", "outside"),
          base: fixture.base,
          head: fixture.head,
        },
      });
      expect(result.isError).toBe(true);
      const text = Array.isArray(result.content)
        ? result.content
            .filter((block): block is { type: "text"; text: string } => block.type === "text")
            .map((block) => block.text)
            .join("\n")
        : "";
      expect(text).toMatch(/escapes repository root/i);
    });
  });
});

describe("MCP server stdio round trip", () => {
  it("list_rules works through StdioClientTransport + doc-lag mcp", async () => {
    const fixture = track(
      createFixtureRepo({
        baseFiles: {
          "package.json": packageJson({}),
          "README.md": "x\n",
        },
      }),
    );

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", cliEntry, "mcp", "--cwd", fixture.repo],
      cwd: projectRoot,
      stderr: "pipe",
    });
    const client = new Client({ name: "doc-lag-stdio-test", version: "0.0.0" });
    await client.connect(transport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.some((tool) => tool.name === "list_rules")).toBe(true);

      const result = await client.callTool({ name: "list_rules", arguments: {} });
      expect(result.isError).toBeFalsy();
      const data = result.structuredContent as {
        rules: Array<{ id: string }>;
        detectors: Array<{ id: string }>;
      };
      expect(data.rules.map((rule) => rule.id)).toEqual([
        "scripts.missing",
        "links.broken",
        "env.stale",
        "docs.missing",
      ]);
      expect(data.detectors.map((d) => d.id)).toContain("mcp.tool");
    } finally {
      await client.close();
    }
  });
});
