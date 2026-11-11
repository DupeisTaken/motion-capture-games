import "./game-display.css";

interface DisplayOptions {
  title: string;
  windowLabel?: string;
  placeholderMessage?: string;
  returnButtonLabel?: string;
  onStateChange?: (open: boolean) => void;
  onVisibilityChange?: () => void;
}

/** Move the live stage, never a second camera or game, to an optional play window. */
export function createGameDisplay(stage: HTMLElement, options: DisplayOptions) {
  const host = stage.ownerDocument.defaultView!;
  const home = stage.ownerDocument;
  let popup: Window | null = null;
  let placeholder: HTMLElement | null = null;
  let previousFocus: HTMLElement | null = null;
  let disposed = false;
  let ticker: (() => void) | null = null;
  let interval = 50;
  let timer: number | null = null;
  let timerWindow: Window = host;

  function moveTicker() {
    if (timer !== null) timerWindow.clearInterval(timer);
    timerWindow = popup && !popup.closed ? popup : host;
    timer = ticker ? timerWindow.setInterval(ticker, interval) : null;
  }
  function restore(closeWindow = true) {
    if (!popup) return;
    const old = popup;
    popup = null;
    placeholder?.replaceWith(stage);
    placeholder = null;
    stage.classList.remove("game-display-stage");
    moveTicker();
    if (closeWindow && !old.closed) old.close();
    previousFocus?.focus();
    options.onStateChange?.(false);
    options.onVisibilityChange?.();
  }
  const ownerClosing = () => restore();
  host.addEventListener("pagehide", ownerClosing);

  return {
    get isOpen() {
      return !!popup && !popup.closed;
    },
    get visible() {
      return !!popup && !popup.closed && !popup.document.hidden;
    },
    open(): boolean {
      if (disposed) return false;
      if (popup && !popup.closed) {
        popup.focus();
        return true;
      }
      const next = host.open("", "_blank", "popup=yes,width=1280,height=800");
      if (!next) return false;
      popup = next;
      previousFocus = home.activeElement as HTMLElement | null;
      const doc = next.document;
      // A standards-mode document and early viewport avoid legacy blank-window scaling.
      doc.open();
      doc.write(
        '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>',
      );
      doc.close();
      doc.title = `${options.title} · ${options.windowLabel ?? "Game display"}`;
      doc.documentElement.lang = home.documentElement.lang || "en";
      const base = doc.createElement("base");
      base.href = home.baseURI;
      doc.head.append(base);
      // Vite injects styles during development; production supplies stylesheet links.
      home
        .querySelectorAll('style, link[rel="stylesheet"]')
        .forEach((style) => {
          doc.head.append(style.cloneNode(true));
        });
      doc.body.className = `${home.body.className} game-display-window`;
      const toolbar = doc.createElement("header");
      toolbar.className = "game-display-toolbar";
      const title = doc.createElement("strong");
      title.textContent = options.title;
      const full = doc.createElement("button");
      full.textContent = "Full screen";
      full.addEventListener("click", () => {
        const unavailable = () => {
          full.textContent = "Use window maximize";
        };
        if (doc.fullscreenElement) void doc.exitFullscreen().catch(unavailable);
        else if (typeof stage.requestFullscreen === "function")
          void stage.requestFullscreen().catch(unavailable);
        else unavailable();
      });
      const back = doc.createElement("button");
      back.textContent = "Return to controls";
      back.addEventListener("click", () => restore());
      toolbar.append(title, full, back);
      placeholder = home.createElement("div");
      placeholder.className = "game-display-placeholder";
      const note = home.createElement("p");
      note.textContent =
        options.placeholderMessage ??
        "Your game is in its own window. Camera and round controls stay here.";
      const bringBack = home.createElement("button");
      bringBack.textContent = options.returnButtonLabel ?? "Return game here";
      bringBack.addEventListener("click", () => restore());
      placeholder.append(note, bringBack);
      stage.before(placeholder);
      stage.classList.add("game-display-stage");
      doc.body.replaceChildren(toolbar, stage);
      next.addEventListener("pagehide", () => {
        if (popup === next) restore(false);
      });
      doc.addEventListener("visibilitychange", () =>
        options.onVisibilityChange?.(),
      );
      doc.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !doc.fullscreenElement) restore();
      });
      moveTicker();
      stage.focus();
      options.onStateChange?.(true);
      options.onVisibilityChange?.();
      return true;
    },
    close() {
      restore();
    },
    startTicker(tick: () => void, intervalMs = 50): () => void {
      ticker = tick;
      interval = intervalMs;
      moveTicker();
      return () => {
        ticker = null;
        moveTicker();
      };
    },
    dispose() {
      disposed = true;
      ticker = null;
      restore();
      moveTicker();
      host.removeEventListener("pagehide", ownerClosing);
    },
  };
}
