import { renderApp } from "./ui/app";
import "./ui/styles.css";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app root");
}

renderApp(root);
