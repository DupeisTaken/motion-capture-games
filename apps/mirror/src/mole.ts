import { mountAppNavigation } from "./app-navigation";
import "./mole.css";
import { mountMoleGame } from "./mole-viewer";

const app = mountMoleGame(document.querySelector<HTMLElement>("#app")!);
const navigation = mountAppNavigation({ owner: app });
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    navigation.dispose();
    app.dispose();
  });
