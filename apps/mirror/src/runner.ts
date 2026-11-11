import "./runner.css";
import { mountRunnerGame } from "./runner-viewer";

const app = mountRunnerGame(document.querySelector<HTMLElement>("#app")!);
if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
