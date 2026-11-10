import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function markdownAnchors(source) {
  const counts = new Map();
  return new Set(
    source
      .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "")
      .split("\n")
      .filter((line) => /^#{1,6} /.test(line))
      .map((line) => {
        const slug = line
          .replace(/^#+\s+|\s+#+\s*$/g, "")
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s_-]/gu, "")
          .replace(/\s/g, "-");
        const count = counts.get(slug) ?? 0;
        counts.set(slug, count + 1);
        return count ? `${slug}-${count}` : slug;
      }),
  );
}

// Check local inline links and reference definitions; external availability is
// deliberately excluded so routine CI is independent of third-party websites.
export function checkMarkdown(source, file, root) {
  const errors = [];
  const prose = source
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "")
    .replace(/`[^`\n]*`/g, "");
  const links = [
    ...prose.matchAll(/\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g),
    ...prose.matchAll(/^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm),
  ];
  for (const [, raw] of links) {
    const href = raw.replace(/^<|>$/g, "");
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
    let path;
    let fragment;
    try {
      const [target, anchor = ""] = href.split("#", 2);
      path = resolve(dirname(file), decodeURIComponent(target.split("?")[0]));
      fragment = decodeURIComponent(anchor);
    } catch {
      errors.push(`Invalid link encoding: ${href}`);
      continue;
    }
    if (!href.split("#")[0]) path = file;
    if (!existsSync(path)) {
      errors.push(`Missing local target: ${href}`);
    } else if (fragment && /\.(md|html)$/i.test(path)) {
      const target = readFileSync(path, "utf8");
      const anchors = path.endsWith(".md")
        ? markdownAnchors(target)
        : new Set(
            [...target.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]),
          );
      if (!anchors.has(fragment)) errors.push(`Missing local anchor: ${href}`);
    }
  }
  return errors.map((error) => `${relative(root, file)}: ${error}`);
}

export function checkReport(source) {
  const errors = [];
  for (const [pattern, label] of [
    [/<!doctype html>/i, "HTML doctype"],
    [/<html\b[^>]*\blang=["'][^"']+["']/i, "document language"],
    [/<title>[^<]+<\/title>/i, "document title"],
    [/<meta\b[^>]*name=["']viewport["']/i, "viewport metadata"],
  ]) {
    if (!pattern.test(source)) errors.push(`Missing ${label}`);
  }
  // Reports may link to sources, but rendering must not fetch assets. The
  // supported report format is static HTML with embedded CSS and media.
  for (const match of source.matchAll(
    /<(?:img|script|link|iframe|source|video|audio)\b[^>]*>/gi,
  )) {
    for (const [, attribute, value] of match[0].matchAll(
      /\b(src|href|poster|srcset)=["']([^"']+)["']/gi,
    )) {
      if (!value.startsWith("data:") && !value.startsWith("#")) {
        errors.push(`Report asset must be embedded (${attribute}): ${value}`);
      }
    }
  }
  if (/@import\b|url\(\s*["']?(?!data:|#)[^\s)"']/i.test(source)) {
    errors.push("Report CSS must not load external assets");
  }
  return errors;
}

export function checkDocs(root) {
  const files = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  const errors = [];
  for (const name of files) {
    const file = resolve(root, name);
    if (name.endsWith(".md")) {
      errors.push(...checkMarkdown(readFileSync(file, "utf8"), file, root));
    } else if (name.startsWith("reports/") && name.endsWith(".html")) {
      errors.push(
        ...checkReport(readFileSync(file, "utf8")).map(
          (error) => `${name}: ${error}`,
        ),
      );
    }
  }
  return {
    files: files.filter(
      (f) => f.endsWith(".md") || /^reports\/.*\.html$/.test(f),
    ).length,
    errors,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = checkDocs(fileURLToPath(new URL("..", import.meta.url)));
  if (result.errors.length) {
    console.error(result.errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(
      `Documentation checks passed (${result.files} tracked Markdown/report files).`,
    );
  }
}
