import { mountAppNavigation } from "./app-navigation";
import "./runner.css";
import { mountRunnerGame } from "./runner-viewer";

const app = mountRunnerGame(document.querySelector<HTMLElement>("#app")!);
const navigation = mountAppNavigation({ owner: app });
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    navigation.dispose();
    app.dispose();
  });
