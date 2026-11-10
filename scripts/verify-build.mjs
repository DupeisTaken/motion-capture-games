import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function verifyBuild(inputs, outDir) {
  const errors = [];
  for (const input of inputs) {
    const output = resolve(outDir, basename(input));
    if (!existsSync(output)) {
      errors.push(`Missing built entry: ${output}`);
      continue;
    }
    const html = readFileSync(output, "utf8");
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)];
    if (!scripts.length) errors.push(`No JavaScript bundle in ${output}`);
    for (const [, href] of [
      ...scripts,
      ...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["']/g),
    ]) {
      // Vite preserves embedded favicons; these need no separate artifact file.
      if (href.startsWith("data:") || href.startsWith("#")) continue;
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) {
        errors.push(`Build depends on remote asset: ${href}`);
        continue;
      }
      const asset = resolve(
        href.startsWith("/") ? outDir : dirname(output),
        href.replace(/^\//, "").split(/[?#]/)[0],
      );
      if (!existsSync(asset)) errors.push(`Missing built asset: ${href}`);
    }
  }
  return errors;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { resolveConfig } = await import("vite");
  const config = await resolveConfig({}, "build");
  const input = config.build.rollupOptions.input;
  const inputs =
    typeof input === "string" ? [input] : Object.values(input ?? {});
  if (!inputs.length)
    throw new Error("Declare all application entries in vite.config.ts");
  const errors = verifyBuild(inputs, resolve(config.root, config.build.outDir));
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(
      `Build artifact checks passed (${inputs.length} application entries).`,
    );
  }
}
