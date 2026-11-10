import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// These scripts also run directly in Node, without a TypeScript build step.
// @ts-expect-error JavaScript tooling intentionally has no generated declarations.
import { checkMarkdown, checkReport } from "../../scripts/check-docs.mjs";
// @ts-expect-error JavaScript tooling intentionally has no generated declarations.
import { verifyBuild } from "../../scripts/verify-build.mjs";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "motion-ci-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("repository documentation gate", () => {
  it("accepts encoded paths, reference links, duplicate headings and local fragments", () => {
    const root = fixture();
    writeFileSync(join(root, "other doc.md"), "# Setup\n# Setup\n");
    const source =
      "# Here\n[local](#here)\n[x](other%20doc.md#setup-1)\n[ref]: <other doc.md#setup>\n";
    writeFileSync(join(root, "README.md"), source);
    expect(checkMarkdown(source, join(root, "README.md"), root)).toEqual([]);
  });
  it("rejects missing files and anchors, ignoring fenced examples and external links", () => {
    const root = fixture();
    const source =
      "# Here\n[x](absent.md)\n[x](#absent)\n```md\n[x](example.md)\n```\n[x](https://example.org)\n";
    writeFileSync(join(root, "README.md"), source);
    const errors = checkMarkdown(source, join(root, "README.md"), root);
    expect(errors).toHaveLength(2);
    expect(errors.join("\n")).toContain("Missing local anchor");
  });
  it("allows source hyperlinks and embedded media, rejecting network rendering dependencies", () => {
    const html =
      '<!doctype html><html lang="en"><title>Report</title><meta name="viewport" content="width=device-width"><a href="https://example.org">source</a><img src="data:image/png;base64,AA=="></html>';
    expect(checkReport(html)).toEqual([]);
    expect(
      checkReport(`${html}<script src="https://example.org/a.js"></script>`),
    ).toHaveLength(1);
    expect(
      checkReport(`${html}<style>@import "https://example.org/a.css";</style>`),
    ).toHaveLength(1);
    expect(
      checkReport(
        `${html}<style>body { background:url(https://example.org/a.png) }</style>`,
      ),
    ).toHaveLength(1);
  });
});

describe("application build gate", () => {
  it("requires every configured entry and all referenced local bundles", () => {
    const root = fixture();
    mkdirSync(join(root, "assets"));
    writeFileSync(
      join(root, "index.html"),
      '<script src="/assets/app.js"></script><link href="/assets/app.css" rel="stylesheet">',
    );
    expect(verifyBuild(["index.html", "mole.html"], root)).toHaveLength(3);
    writeFileSync(join(root, "assets/app.js"), "console.log('synthetic');");
    writeFileSync(join(root, "assets/app.css"), "body{}");
    writeFileSync(
      join(root, "index.html"),
      '<link rel="icon" href="data:,"><script src="/assets/app.js"></script>',
    );
    expect(verifyBuild(["index.html"], root)).toEqual([]);
  });
  it("rejects empty pages and remote scripts", () => {
    const root = fixture();
    writeFileSync(join(root, "index.html"), "<html></html>");
    expect(verifyBuild(["index.html"], root)[0]).toContain(
      "No JavaScript bundle",
    );
    writeFileSync(
      join(root, "index.html"),
      '<script src="https://example.org/app.js"></script>',
    );
    expect(verifyBuild(["index.html"], root)[0]).toContain("remote asset");
  });
});
