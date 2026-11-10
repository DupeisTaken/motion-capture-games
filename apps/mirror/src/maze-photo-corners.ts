import { setMazeText } from "./maze-dom";

const cornerNames = ["Near left", "Near right", "Far right", "Far left"];

/** Local image annotations only; normalized photo points never grant metric input. */
export function mazePhotoCornersMarkup(): string {
  return `<section class="maze-panel"><details id="maze-corners"><summary>03 / Label the play-area corners</summary><p class="maze-hint">Cone colors are optional. Load a local reference photo, then label the four floor corners in the order below. These image labels plan setup; they do not establish metric camera calibration.</p><label for="maze-photo">Reference photo · stays in this page</label><input id="maze-photo" type="file" accept="image/png,image/jpeg,image/webp"><p id="maze-photo-status" class="maze-hint" role="status">No photo loaded. No upload or storage.</p><button id="maze-photo-zone" type="button" class="maze-photo-zone" aria-label="Label next corner on reference photo" hidden><img id="maze-photo-image" alt="Local play-area reference"><svg id="maze-photo-labels" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg></button><div id="maze-photo-keyboard" hidden><p class="maze-hint">Keyboard alternative: set image percentages, then add the next corner.</p><div class="maze-pair"><div><label for="maze-photo-x">Image X · %</label><input id="maze-photo-x" type="number" min="0" max="100" value="50"></div><div><label for="maze-photo-y">Image Y · %</label><input id="maze-photo-y" type="number" min="0" max="100" value="50"></div></div><button id="maze-photo-add" class="maze-button maze-wide">Label next corner</button></div><ol id="maze-photo-corners" aria-label="Reference photo corner labels">${cornerNames.map((name) => `<li>${name}: Not labelled</li>`).join("")}</ol><button id="maze-photo-reset" class="maze-button maze-wide" disabled>Clear labels</button></details></section>`;
}

/** Own the local photo, annotation listeners and decode callbacks as one disposable unit. */
export function mountMazePhotoCorners(root: HTMLElement) {
  const get = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const input = (id: string) => get<HTMLInputElement>(id);
  const listeners = new AbortController();
  function listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    callback: (event: HTMLElementEventMap[K]) => void,
  ) {
    target.addEventListener(type, callback as EventListener, {
      signal: listeners.signal,
    });
  }
  let disposed = false;
  let photoUrl: string | null = null;
  let photoLabels: Array<{ x: number; y: number }> = [];
  for (const id of [
    "maze-photo-zone",
    "maze-photo-x",
    "maze-photo-y",
    "maze-photo-add",
  ])
    get(id).setAttribute("aria-describedby", "maze-photo-status");

  function photoStatus() {
    if (disposed) return;
    setMazeText(
      get("maze-photo-status"),
      photoLabels.length === 4
        ? "All four corners labelled. Image annotations only; metric calibration remains unavailable."
        : `Label ${photoLabels.length + 1}/4: ${cornerNames[photoLabels.length]}. Click the photo or enter percentages.`,
    );
    get<HTMLButtonElement>("maze-photo-add").disabled = photoLabels.length >= 4;
    get<HTMLButtonElement>("maze-photo-reset").disabled = !photoLabels.length;
    get("maze-photo-corners").innerHTML = cornerNames
      .map((name, index) => {
        const point = photoLabels[index];
        return `<li>${name}: ${point ? `X ${point.x.toFixed(1)}%, Y ${point.y.toFixed(1)}%` : "Not labelled"}</li>`;
      })
      .join("");
    get("maze-photo-zone").setAttribute(
      "aria-label",
      photoLabels.length === 4
        ? "Reference photo with all four corners labelled"
        : `Label ${cornerNames[photoLabels.length]} corner on reference photo`,
    );
    setMazeText(
      get("maze-photo-add"),
      photoLabels.length === 4
        ? "All corners labelled"
        : `Label ${cornerNames[photoLabels.length]} corner`,
    );
    get("maze-photo-labels").innerHTML = photoLabels
      .map(
        (p, i) =>
          `<circle cx="${p.x}" cy="${p.y}" r="1.4" fill="#235ac4" stroke="white" stroke-width=".4"/><text x="${Math.min(p.x + 2, 94)}" y="${Math.max(p.y - 2, 4)}" font-size="4" font-weight="700" fill="white" stroke="#24344b" stroke-width=".2">${i + 1}</text>`,
      )
      .join("");
  }
  function addLabel(x: number, y: number) {
    if (disposed) return;
    if (photoLabels.length >= 4) return;
    if (![x, y].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) {
      setMazeText(
        get("maze-photo-status"),
        "Use image percentages from 0 to 100.",
      );
      return;
    }
    if (photoLabels.some((p) => Math.hypot(p.x - x, p.y - y) < 1)) {
      setMazeText(
        get("maze-photo-status"),
        "Choose a distinct point for each corner.",
      );
      return;
    }
    photoLabels.push({ x, y });
    photoStatus();
  }
  listen(input("maze-photo"), "change", () => {
    const file = input("maze-photo").files?.[0];
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 12 * 1024 * 1024
    ) {
      setMazeText(
        get("maze-photo-status"),
        "Choose a PNG, JPEG or WebP image up to 12 MB.",
      );
      return;
    }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(file);
    const loadedUrl = photoUrl;
    photoLabels = [];
    const image = get<HTMLImageElement>("maze-photo-image");
    image.onload = null;
    image.onerror = null;
    get("maze-photo-zone").hidden = true;
    get("maze-photo-keyboard").hidden = true;
    photoStatus();
    setMazeText(get("maze-photo-status"), "Loading local reference photo…");
    image.onload = () => {
      if (disposed || photoUrl !== loadedUrl) return;
      get("maze-photo-zone").hidden = false;
      get("maze-photo-keyboard").hidden = false;
      photoStatus();
    };
    image.onerror = () => {
      if (disposed || photoUrl !== loadedUrl) return;
      get("maze-photo-zone").hidden = true;
      get("maze-photo-keyboard").hidden = true;
      setMazeText(
        get("maze-photo-status"),
        "Image could not be decoded. Choose another photo.",
      );
      URL.revokeObjectURL(loadedUrl);
      photoUrl = null;
    };
    image.src = photoUrl;
  });
  listen(get("maze-photo-zone"), "click", (event) => {
    if (event.detail === 0) {
      get("maze-photo-x").focus();
      return;
    }
    const rect = get("maze-photo-zone").getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    addLabel(
      ((event.clientX - rect.left) / rect.width) * 100,
      ((event.clientY - rect.top) / rect.height) * 100,
    );
  });
  listen(get("maze-photo-add"), "click", () =>
    addLabel(
      input("maze-photo-x").valueAsNumber,
      input("maze-photo-y").valueAsNumber,
    ),
  );
  for (const id of ["maze-photo-x", "maze-photo-y"])
    listen(get(id), "keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      get<HTMLButtonElement>("maze-photo-add").click();
    });
  listen(get("maze-photo-reset"), "click", () => {
    photoLabels = [];
    photoStatus();
  });

  function dispose() {
    if (disposed) return;
    disposed = true;
    listeners.abort();
    const image = get<HTMLImageElement>("maze-photo-image");
    image.onload = null;
    image.onerror = null;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = null;
  }
  return { dispose };
}
