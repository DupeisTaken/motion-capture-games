import "./style.css";
import "./maze.css";
import { mountMaze } from "./maze-viewer";

mountMaze(document.querySelector<HTMLDivElement>("#app")!);
