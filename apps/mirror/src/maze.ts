import { mountAppNavigation } from "./app-navigation";
import "./style.css";
import "./maze.css";
import { mountMaze } from "./maze-viewer";

const app = mountMaze(document.querySelector<HTMLDivElement>("#app")!);

const navigation = mountAppNavigation({ owner: app });
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    navigation.dispose();
    app.dispose();
  });
