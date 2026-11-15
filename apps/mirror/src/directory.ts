import "./directory.css";

import { mountAppNavigation } from "./app-navigation";
const navigation = mountAppNavigation();
if (import.meta.hot) import.meta.hot.dispose(() => navigation.dispose());
