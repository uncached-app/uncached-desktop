import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n";
import App from "./App";
import "./index.css";

window.addEventListener("contextmenu", (event) => event.preventDefault());

if (import.meta.env.PROD) {
  window.addEventListener("keydown", (event) => {
    const blockedShortcut =
      event.key === "F12" ||
      (event.ctrlKey && event.shiftKey && ["I", "J", "C"].includes(event.key.toUpperCase())) ||
      (event.ctrlKey && event.key.toUpperCase() === "U");

    if (blockedShortcut) event.preventDefault();
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
