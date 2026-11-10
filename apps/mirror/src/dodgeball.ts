import "./dodgeball.css";
import { mountDodgeballGame } from "./dodgeball-viewer";

const app = mountDodgeballGame(document.querySelector<HTMLElement>("#app")!);
if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
