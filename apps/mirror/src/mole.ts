import "./mole.css";
import { mountMoleGame } from "./mole-viewer";

const app = mountMoleGame(document.querySelector<HTMLElement>("#app")!);
if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
