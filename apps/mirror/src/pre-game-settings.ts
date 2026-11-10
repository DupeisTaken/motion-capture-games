import "./pre-game-settings.css";

export function preGameSettingsMarkup(
  gameName: string,
  gameOptions: string,
  videoOptions: string,
): string {
  return `<dialog id="pre-game-settings" class="mm-settings pre-game-settings" aria-labelledby="setup-title" aria-describedby="setup-description">
    <header class="setup-heading"><div><p class="eyebrow">BEFORE YOU PLAY</p><h2 id="setup-title">Set up ${gameName}</h2><p id="setup-description">Check your video and game options before each round.</p></div><button id="close-settings" class="mm-secondary" aria-label="Close setup">Close</button></header>
    <div class="setup-columns"><section class="setup-section" aria-labelledby="video-settings-title"><h3 id="video-settings-title"><span>01</span> Video & input</h3>${videoOptions}</section><section class="setup-section" aria-labelledby="game-settings-title"><h3 id="game-settings-title"><span>02</span> Game settings</h3>${gameOptions}</section></div>
    <footer class="setup-actions"><p>Your choices stay selected for the next round. Start waits for ready input.</p><button id="confirm-start" class="mm-primary">Start round <span>↗</span></button></footer>
  </dialog>`;
}

/** Every new-round entry point shares one confirmation; opening never resets play. */
export function createPreGameSettings(root: HTMLElement, onStart: () => void) {
  const dialog = root.querySelector<HTMLDialogElement>("#pre-game-settings")!;
  const confirm = root.querySelector<HTMLButtonElement>("#confirm-start")!;
  const close = root.querySelector<HTMLButtonElement>("#close-settings")!;
  const opener = root.querySelector<HTMLButtonElement>("#open-settings")!;
  const listeners = new AbortController();
  let returnFocus: HTMLElement | null = null;
  function hide() {
    dialog.close();
    if (returnFocus?.isConnected && !returnFocus.matches(":disabled"))
      returnFocus.focus();
  }
  close.addEventListener("click", hide, { signal: listeners.signal });
  dialog.addEventListener(
    "cancel",
    (event) => {
      event.preventDefault();
      hide();
    },
    { signal: listeners.signal },
  );
  confirm.addEventListener(
    "click",
    () => {
      if (!dialog.open || confirm.disabled) return;
      hide();
      onStart();
    },
    { signal: listeners.signal },
  );
  return {
    open(trigger: HTMLElement = opener) {
      if (dialog.open || confirm.disabled) return;
      returnFocus = trigger;
      dialog.showModal();
      // A deliberate initial focus avoids starting a round with an accidental Enter.
      close.focus();
    },
    setLocked(locked: boolean) {
      opener.disabled = locked;
      confirm.disabled = locked;
    },
    dispose() {
      listeners.abort();
      if (dialog.open) dialog.close();
    },
  };
}
