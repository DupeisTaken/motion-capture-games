import "./studio-tokens.css";
import "./pre-game-settings.css";

export function preGameSettingsMarkup(
  gameName: string,
  gameOptions: string,
  videoOptions: string,
): string {
  return `<dialog id="pre-game-settings" class="mm-settings pre-game-settings" aria-labelledby="setup-title" aria-describedby="setup-description">
    <header class="setup-heading"><div><h2 id="setup-title">Set up ${gameName}</h2><p id="setup-description">Choose input and game options.</p></div><button id="close-settings" type="button" class="mm-secondary" aria-label="Close setup">Close</button></header>
    <div class="setup-columns"><section class="setup-section" aria-labelledby="video-settings-title"><h3 id="video-settings-title"><span>1</span> Video & input</h3>${videoOptions}</section><section class="setup-section" aria-labelledby="game-settings-title"><h3 id="game-settings-title"><span>2</span> Game settings</h3>${gameOptions}</section></div>
    <footer class="setup-actions"><p>Saved for your next round.</p><button id="confirm-start" type="button" class="mm-primary">Start round <span>↗</span></button></footer>
  </dialog>`;
}

/** Every setup confirmation shares one dialog; closing never resets play. */
export function createPreGameSettings(
  root: HTMLElement,
  onStart: () => void,
  options: { canStart?: () => boolean } = {},
) {
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
      // Validation may keep setup open and focus the field that needs attention.
      if (options.canStart && !options.canStart()) return;
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
