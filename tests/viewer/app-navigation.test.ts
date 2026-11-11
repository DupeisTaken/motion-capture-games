// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appDestinations,
  mountAppNavigation,
  NavigationStartup,
  sourceNavigationBlocker,
} from "../../apps/mirror/src/app-navigation";

let mounted: ReturnType<typeof mountAppNavigation> | undefined;
afterEach(() => {
  mounted?.dispose();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function setup(blocker: () => string | null = () => null) {
  window.history.replaceState(null, "", "/runner.html");
  document.body.innerHTML =
    '<header class="mm-header"><a href="/">Brand</a><nav><a href="/runner.html">Old links</a></nav></header><main id="game-stage"></main>';
  mounted = mountAppNavigation({
    path: "/runner.html",
    owner: { navigationBlocker: blocker },
  });
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(
    () => {},
  );
  return document.querySelector<HTMLElement>(".studio-navigation")!;
}
describe("operator navigation", () => {
  it("offers every route outside the participant stage, with one current location", () => {
    const nav = setup();
    expect(
      [...nav.querySelectorAll("a")].map((a) => a.getAttribute("href")).sort(),
    ).toEqual(appDestinations.map((a) => a.path).sort());
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe(
      "Motion Runner",
    );
    expect(nav.querySelector("#game-stage")).toBeNull();
    expect(document.querySelector<HTMLElement>("header nav")!.hidden).toBe(
      true,
    );
  });
  it("opens with a native button and closes with Escape, returning keyboard focus", () => {
    const nav = setup();
    const button = nav.querySelector("button")!;
    const menu = nav.querySelector<HTMLElement>("#studio-destinations")!;
    expect(menu.hidden).toBe(true);
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(menu.hidden).toBe(false);
    nav.querySelector<HTMLAnchorElement>('a[href="/maze.html"]')!.focus();
    nav.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
  });
  it("keeps blocked navigation on the owner page with accessible recovery; permits modified clicks", () => {
    const nav = setup(() => "Retry camera stop before switching.");
    const link = nav.querySelector('a[href="/maze.html"]')!;
    const activate = (ctrlKey = false) =>
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey }),
      );
    expect(activate()).toBe(false);
    const message = nav.querySelector<HTMLElement>('[role="status"]')!;
    expect(message.hidden).toBe(false);
    expect(message.textContent).toContain("Retry");
    expect(document.activeElement).toBe(message);
    expect(activate(true)).toBe(true);
    // Legacy brands must not bypass source ownership checks.
    expect(
      document
        .querySelector("header a")!
        .dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        ),
    ).toBe(false);
  });
  it("allows navigation after the owner's release state recovers and removes its handlers on disposal", () => {
    let reason: string | null = "Stop camera";
    const nav = setup(() => reason);
    const click = () =>
      nav
        .querySelector('a[href="/maze.html"]')!
        .dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
    expect(click()).toBe(false);
    reason = null;
    expect(click()).toBe(true);
    mounted!.dispose();
    expect(document.querySelector<HTMLElement>("header nav")!.hidden).toBe(
      false,
    );
  });
});
describe("source navigation safety", () => {
  it("honors an independent calibration-style owner's veto and recovery", () => {
    const nav = setup();
    let busy = true;
    const listener = (event: Event) => {
      if (!busy) return;
      const check = event as CustomEvent<{ reason: string | null }>;
      check.detail.reason =
        "Calibration release unconfirmed. Retry camera stop.";
      check.preventDefault();
    };
    document.body.addEventListener("motion-studio:navigation-check", listener);
    const click = () =>
      nav
        .querySelector('a[href="/maze.html"]')!
        .dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
    expect(click()).toBe(false);
    expect(nav.querySelector('[role="status"]')!.textContent).toContain(
      "Calibration release unconfirmed",
    );
    busy = false;
    expect(click()).toBe(true);
    document.body.removeEventListener(
      "motion-studio:navigation-check",
      listener,
    );
  });
  it("retains startup until a late acknowledgement is processed, independently of local Stop", () => {
    const startup = new NavigationStartup();
    const attempt = startup.begin();
    expect(startup.blocker).toContain("pending");
    attempt.acknowledge(true, { epoch: "synthetic-owner" });
    expect(startup.blocker).toContain("pending");
    attempt.finish();
    expect(startup.blocker).toBeNull();
    expect(sourceNavigationBlocker(false, 1)).toContain("Retry camera stop");
    expect(sourceNavigationBlocker(true, 0)).toContain("source is active");
    expect(sourceNavigationBlocker(false, 0)).toBeNull();
  });
  it("blocks unknown delivery or missing epoch, but treats explicit rejected starts as acknowledged", () => {
    for (const body of [null, { state: "running" }]) {
      const startup = new NavigationStartup();
      const attempt = startup.begin();
      if (body) attempt.acknowledge(true, body);
      attempt.finish();
      expect(startup.blocker).toContain("ownership is unknown");
    }
    const startup = new NavigationStartup();
    const attempt = startup.begin();
    attempt.acknowledge(false, { detail: "Camera unavailable" });
    attempt.finish();
    expect(startup.blocker).toBeNull();
  });
});
