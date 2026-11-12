import type { MazeConfig } from "../../../games/virtual-maze/src/index";
import type { MazeOrientationSource } from "../../../packages/motion/src/maze-input";
import { mazeCameraGuideMarkup } from "./maze-camera-guide";
import { setMazeText } from "./maze-dom";
import { mazePhotoCornersMarkup } from "./maze-photo-corners";
import { preGameSettingsMarkup } from "./pre-game-settings";
import { mazeCalibrationMarkup } from "./maze-calibration";
import "./maze-setup.css";

export interface MazeSetupDraft {
  config: MazeConfig;
  orientationSource: MazeOrientationSource;
}

export function mazeSetupMarkup(): string {
  const gameOptions = `<form id="maze-config" class="maze-settings-form" aria-label="Maze generation">
    <div class="maze-pair"><div><label for="maze-width">Width · m</label><input id="maze-width" type="number" min="5" max="10" step="0.01" value="8" required></div><div><label for="maze-depth">Depth · m</label><input id="maze-depth" type="number" min="5" max="10" step="0.01" value="8" required></div></div><p class="maze-hint">Each side from 5 to 10 meters. Use the predetermined dimensions of your floor plan.</p>
    <label for="maze-difficulty">Difficulty</label><select id="maze-difficulty" required><option value="easy">Easy · wider passages</option><option value="medium" selected>Medium · more decisions</option><option value="hard">Hard · finer maze</option></select>
    <label class="maze-switch"><input id="maze-loops" type="checkbox" checked>Internal loops</label><p class="maze-hint">With loops enabled, an interior goal defeats both tested left-hand and right-hand wall followers.</p>
    <label for="maze-seed">Layout seed</label><input id="maze-seed" type="text" value="quiet-path-01" maxlength="80" required><button type="button" id="maze-shuffle" class="maze-button maze-wide">New random seed</button>
    <label for="maze-orientation">Direction source</label><select id="maze-orientation" required><option value="torso">Torso</option><option value="head">Head</option></select><p class="maze-hint">Head direction is not eye gaze. Missing selected direction pauses the cue. Changes apply only after Start round.</p>
    <p id="maze-config-status" class="maze-hint" role="status">Confirm Start round to generate this maze and reset the player.</p></form>`;
  const videoOptions = `<label for="maze-source">Input source</label><select id="maze-source" required><option value="synthetic">Synthetic rehearsal · no cameras</option><option value="physical" disabled>Physical two-camera input · unavailable</option></select>
    <p class="maze-hint">Rounds use synthetic input. Live floor calibration below opens a camera only after Start camera. Physical play still needs validated body position, identity, timing and facing direction.</p>
    ${mazeCalibrationMarkup()}${mazeCameraGuideMarkup()}${mazePhotoCornersMarkup()}`;
  return preGameSettingsMarkup("Virtual Maze", gameOptions, videoOptions);
}

/** Native form validity is checked before the shared dialog can close or reset play. */
export function validateMazeSetup(root: HTMLElement): boolean {
  const form = root.querySelector<HTMLFormElement>("#maze-config")!;
  const status = root.querySelector<HTMLElement>("#maze-config-status")!;
  if (!form.checkValidity()) {
    setMazeText(
      status,
      "Check the highlighted setting. Dimensions must be 5–10 m and a layout seed is required.",
    );
    status.classList.add("maze-error");
    form.reportValidity();
    Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        "input, select",
      ),
    )
      .find((field) => !field.validity.valid)
      ?.focus();
    return false;
  }
  const source = root.querySelector<HTMLSelectElement>("#maze-source")!;
  if (source.value !== "synthetic") {
    setMazeText(
      status,
      "Physical input is unavailable. Select synthetic rehearsal to start.",
    );
    status.classList.add("maze-error");
    source.focus();
    return false;
  }
  return true;
}

export function readMazeSetup(root: HTMLElement): MazeSetupDraft {
  const input = (id: string) => root.querySelector<HTMLInputElement>(`#${id}`)!;
  const select = (id: string) =>
    root.querySelector<HTMLSelectElement>(`#${id}`)!;
  return {
    config: {
      widthM: input("maze-width").valueAsNumber,
      depthM: input("maze-depth").valueAsNumber,
      difficulty: select("maze-difficulty").value as MazeConfig["difficulty"],
      seed: input("maze-seed").value,
      loops: input("maze-loops").checked,
    },
    orientationSource: select("maze-orientation")
      .value as MazeOrientationSource,
  };
}
