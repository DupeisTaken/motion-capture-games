import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkDocs } from "./check-docs.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const git = (args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" });
// On a PR, compare the entire change against its base; local checks also inspect
// unstaged/staged edits. Never pass unchecked event text as a Git revision.
const base = process.env.CI_BASE_SHA;
if (base && !/^0+$/.test(base)) {
  if (!/^[a-f\d]{40}$/i.test(base)) throw new Error("Invalid CI_BASE_SHA");
  git(["diff", "--check", base, "HEAD"]);
} else {
  git(["show", "--format=", "--check", "HEAD"]);
}
git(["diff", "--check"]);
git(["diff", "--cached", "--check"]);
const result = checkDocs(root);
if (result.errors.length) {
  console.error(result.errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Repository checks passed (${result.files} tracked Markdown/report files).`,
  );
}
