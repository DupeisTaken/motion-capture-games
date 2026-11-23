import "./studio-tokens.css";
import "./app-navigation.css";
import { hostedRehearsal } from "./build-mode";

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
        // A 2xx error body may still own capture; only a nonblank epoch identifies it.
        acknowledged =
          !ok ||
          (!!body &&
            typeof body === "object" &&
            "epoch" in body &&
            typeof body.epoch === "string" &&
            !!body.epoch.trim());
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
    ? "A source is active. Stop the camera before switching pages."
    : null;
}

/** Unified single-bar product header; stays outside live stages and participant windows. */
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
  // Canonical names stay stable while relative links preserve a Pages project path.
  const name = path.slice(path.lastIndexOf("/") + 1);
  const currentPath = !name || name === "index.html" ? "/" : `/${name}`;
  const available = appDestinations.filter(
    (item) => !hostedRehearsal || item.group !== "tools",
  );
  const current = available.find((item) => item.path === currentPath);
  const href = (item: (typeof appDestinations)[number]) => `.${item.path}`;
  const destinationPaths = new Set(
    available.map((item) => new URL(href(item), host.location.href).pathname),
  );
  const currentDestination = current
    ? new URL(href(current), host.location.href).pathname
    : host.location.pathname;
  const isDirectory = current?.path === "/";
  const nav = doc.createElement("nav");
  nav.className = "studio-navigation";
  nav.dataset.hosted = String(hostedRehearsal);
  nav.dataset.page = isDirectory ? "directory" : (current?.group ?? "other");
  nav.setAttribute("aria-label", "Motion Studio navigation");
  const links = (group: string) =>
    available
      .filter((item) => item.group === group)
      .map(
        (item) =>
          `<a href="${href(item)}"${current === item ? ' aria-current="page"' : ""}>${item.label}</a>`,
      )
      .join("");
  const homeAttrs = isDirectory ? ' aria-current="page"' : "";
  const locationMarkup = isDirectory
    ? ""
    : `<span class="studio-divider" aria-hidden="true">/</span><span class="studio-location"><strong>${current?.label ?? "Motion Studio"}</strong></span>`;
  nav.innerHTML = `<div class="studio-nav-inner"><div class="studio-nav-bar"><a class="studio-home brand mm-brand" href="./" aria-label="All games"${homeAttrs}><b class="studio-mark" aria-hidden="true">✳</b><span class="studio-wordmark">Motion<span>Studio</span></span>${isDirectory ? "" : '<span class="studio-back-cue" aria-hidden="true">· All games</span>'}</a>${locationMarkup}<button type="button" class="studio-switcher" aria-expanded="false" aria-controls="studio-destinations">Switch view <span class="studio-chevron" aria-hidden="true">⌄</span></button></div><div id="studio-destinations" class="studio-destinations" hidden><div class="studio-dest-group"><h2>Games</h2>${links("games")}</div>${hostedRehearsal ? "" : `<div class="studio-dest-group"><h2>Operator tools</h2>${links("tools")}</div>`}<p class="studio-nav-note">Switching pages ends the current round.</p></div><div class="studio-navigation-message" role="status" tabindex="-1" hidden></div></div>`;
  // Hide legacy headers and their inner links once the unified product bar mounts.
  const legacy = [
    ...doc.querySelectorAll<HTMLElement>(
      "header.app-header, header.mm-header, header.maze-header, header.directory-header, header.app-header > nav, header.mm-header > nav, header.maze-header > a:not(.brand), header.directory-header > nav, .rig-console-link",
    ),
  ];
  legacy.forEach((item) => (item.hidden = true));
  const header = doc.querySelector("header");
  if (header) header.before(nav);
  else doc.body.prepend(nav);
  const button = nav.querySelector<HTMLButtonElement>(".studio-switcher")!;
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
  // Close the switcher cleanly when clicking outside it.
  doc.addEventListener(
    "click",
    (event) => {
      if (!destinations.hidden && !nav.contains(event.target as Node))
        collapse();
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
        !destinationPaths.has(target.pathname)
      )
        return;
      if (target.pathname === currentDestination) {
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
