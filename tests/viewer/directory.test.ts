// @vitest-environment happy-dom
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const appRoot = resolve("apps/mirror");
const read = (path: string) => readFileSync(resolve(appRoot, path), "utf8");
function parse(path: string) {
  // Templates keep assets inert; real-server checks cover CSS and module loading.
  const template = document.createElement("template");
  template.innerHTML = read(path);
  return template.content;
}
let page: DocumentFragment;

describe("root game directory", () => {
  beforeEach(() => {
    page = parse("index.html");
  });

  it("links every playable HTML entry exactly once", () => {
    const operatorEntries = new Set([
      "index.html",
      "diagnostics.html",
      "rig.html",
    ]);
    const gameEntries = readdirSync(appRoot)
      .filter((name) => name.endsWith(".html") && !operatorEntries.has(name))
      .map((name) => `./${name}`)
      .sort();
    const links = [...page.querySelectorAll<HTMLAnchorElement>(".game-card")];
    expect(links.map((link) => link.getAttribute("href")).sort()).toEqual(
      gameEntries,
    );
    expect(
      links.map(
        (link) =>
          page.getElementById(link.getAttribute("aria-labelledby")!)
            ?.textContent,
      ),
    ).toEqual(["Slap a Mole", "Dodgeball", "Motion Runner", "Virtual Maze"]);
  });

  it("keeps all navigation usable as static links with existing targets", () => {
    for (const link of page.querySelectorAll<HTMLAnchorElement>("a")) {
      const href = link.getAttribute("href")!;
      if (href.startsWith("#")) expect(page.querySelector(href)).not.toBeNull();
      else
        expect(
          existsSync(resolve(appRoot, href === "./" ? "index.html" : href)),
        ).toBe(true);
    }
    expect(
      page.querySelector('.tool-link[href="./diagnostics.html"]'),
    ).not.toBeNull();
    expect(page.querySelector('.tool-link[href="./rig.html"]')).not.toBeNull();
    expect(page.querySelector("main #games[tabindex='-1']")).not.toBeNull();
    expect(page.querySelector("button")).toBeNull();
  });

  it("labels the maze's physical input as pending", () => {
    expect(
      page.querySelector('a[href="./maze.html"] .game-input')?.textContent,
    ).toContain("Synthetic rehearsal");
    expect(
      page.querySelector('a[href="./maze.html"] .game-input')?.textContent,
    ).toContain("physical input pending");
  });

  it("retains the existing diagnostic runtime at its explicit entry", () => {
    page = parse("diagnostics.html");
    expect(page.querySelector("#app")).not.toBeNull();
    expect(page.querySelector("script")?.getAttribute("src")).toBe(
      "/src/main.ts",
    );
    expect(page.querySelector("title")?.textContent).toBe(
      "Motion Studio · Tracking console",
    );
  });
});
