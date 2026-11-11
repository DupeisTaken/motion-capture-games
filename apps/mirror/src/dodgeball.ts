import { mountAppNavigation } from "./app-navigation";
import "./dodgeball.css";
import { mountDodgeballGame } from "./dodgeball-viewer";

const app = mountDodgeballGame(document.querySelector<HTMLElement>("#app")!);
const navigation = mountAppNavigation({ owner: app });
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    navigation.dispose();
    app.dispose();
  });
