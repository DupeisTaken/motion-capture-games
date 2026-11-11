import "./app-navigation.css";

export const appDestinations = [
  { path: "/", label: "All games", group: "directory" },
  { path: "/mole.html", label: "Slap a Mole", group: "games" },
  { path: "/dodgeball.html", label: "Dodgeball", group: "games" },
  { path: "/runner.html", label: "Motion Runner", group: "games" },
  { path: "/maze.html", label: "Virtual Maze", group: "games" },
  { path: "/diagnostics.html", label: "Tracking console", group: "tools" },
  { path: "/rig.html", label: "Two-camera workspace", group: "tools" },
] as const;

export interface NavigationOwner {
  navigationBlocker(): string | null;
}

export interface NavigationCheck {
  reason: string | null;
}

/** Retain navigation safety even after Stop cancels a still-unacknowledged Start. */
export class NavigationStartup {
  private pending = 0;
  private uncertain = false;

  get blocker(): string | null {
    if (this.pending)
      return "Source startup is still pending. Stay here until its acknowledgement and any camera release complete.";
    return this.uncertain
      ? "Source ownership is unknown because startup was not acknowledged. Restart the local vision service, then reload this page before switching. This affects all tabs using that service."
      : null;
  }

  begin() {
    this.pending++;
    let acknowledged = false;
    return {
      acknowledge(ok: boolean, body: unknown) {
        acknowledged =
          !ok ||
          (!!body &&
            typeof body === "object" &&
            "epoch" in body &&
            typeof body.epoch === "string" &&
            !!body.epoch);
      },
      finish: () => {
        this.pending--;
        if (!acknowledged) this.uncertain = true;
      },
    };
  }
}

export function sourceNavigationBlocker(
  active: boolean,
  pendingRelease: number,
): string | null {
  if (pendingRelease)
    return "Camera release is not confirmed. Use Retry camera stop and wait for confirmation before switching pages.";
  return active
    ? "A source is active. Choose Stop camera (or Stop in the tracking console), then switch pages. Your current round will end when you leave."
    : null;
}

/** Operator chrome stays outside live stages and never enters participant windows. */
export function mountAppNavigation(
  options: {
    owner?: NavigationOwner;
    path?: string;
    document?: Document;
  } = {},
) {
  const doc = options.document ?? document;
  const host = doc.defaultView!;
  const path = options.path ?? host.location.pathname;
  const current = appDestinations.find(
    (item) => item.path === (path === "/index.html" ? "/" : path),
  );
  const nav = doc.createElement("nav");
  nav.className = "studio-navigation";
  nav.setAttribute("aria-label", "Motion Studio navigation");
  const links = (group: string) =>
    appDestinations
      .filter((item) => item.group === group)
      .map(
        (item) =>
          `<a href="${item.path}"${current === item ? ' aria-current="page"' : ""}>${item.label}</a>`,
      )
      .join("");
  nav.innerHTML = `<div class="studio-nav-bar">${links("directory")}<span class="studio-location">${current?.group === "tools" ? "Operator tool" : current?.group === "games" ? "Game & controls" : "Game directory"}<strong>${current?.label ?? "Motion Studio"}</strong></span><button type="button" aria-expanded="false" aria-controls="studio-destinations">Switch view <span aria-hidden="true">⌄</span></button></div><div id="studio-destinations" class="studio-destinations" hidden><div><h2>Games</h2>${links("games")}</div><div><h2>Operator tools</h2>${links("tools")}<p>Tracking console provides camera diagnostics. Two-camera workspace includes role planning and synthetic rehearsal. Game settings contain input setup.</p></div><p class="studio-nav-note">Switching pages ends the current round and resets unsaved settings. Separate participant windows show only the game.</p></div><div class="studio-navigation-message" role="status" tabindex="-1" hidden></div>`;
  // Hide redundant legacy header links only after the complete replacement mounts.
  const legacy = [
    ...doc.querySelectorAll<HTMLElement>(
      "header.app-header > nav, header.mm-header > nav, header.maze-header > a:not(.brand), header.directory-header > nav, .rig-console-link",
    ),
  ];
  legacy.forEach((item) => (item.hidden = true));
  const header = doc.querySelector("header");
  if (header) header.after(nav);
  else doc.body.prepend(nav);
  const button = nav.querySelector<HTMLButtonElement>("button")!;
  const destinations = nav.querySelector<HTMLElement>("#studio-destinations")!;
  const message = nav.querySelector<HTMLElement>(".studio-navigation-message")!;
  const events = new AbortController();
  function collapse() {
    destinations.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }
  button.addEventListener(
    "click",
    () => {
      const open = destinations.hidden;
      destinations.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
    },
    { signal: events.signal },
  );
  nav.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        collapse();
        message.hidden = true;
        button.focus();
      }
    },
    { signal: events.signal },
  );
  doc.addEventListener(
    "click",
    (event) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (
        !link ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        link.download ||
        (link.target && link.target !== "_self")
      )
        return;
      const target = new URL(link.href, host.location.href);
      if (
        target.origin !== host.location.origin ||
        !appDestinations.some((item) => item.path === target.pathname)
      )
        return;
      if (target.pathname === host.location.pathname) {
        // Current-location links are inert; reloading could discard a source owner.
        if (!target.hash) event.preventDefault();
        return;
      }
      // Optional app-local owners (such as floor calibration) can veto departure
      // without coupling their capture controller to this presentation component.
      const detail: NavigationCheck = { reason: null };
      const check = new CustomEvent<NavigationCheck>(
        "motion-studio:navigation-check",
        {
          bubbles: true,
          cancelable: true,
          detail,
        },
      );
      (doc.querySelector("#app") ?? doc.body).dispatchEvent(check);
      const reason =
        options.owner?.navigationBlocker() ||
        (!check.defaultPrevented
          ? null
          : detail.reason ||
            "An operator source is still busy. Stop it and confirm release before switching pages.");
      if (!reason) return;
      event.preventDefault();
      message.textContent = reason;
      message.hidden = false;
      message.focus();
      message.scrollIntoView({ block: "nearest" });
    },
    { signal: events.signal },
  );
  return {
    dispose() {
      events.abort();
      nav.remove();
      legacy.forEach((item) => (item.hidden = false));
    },
  };
}
