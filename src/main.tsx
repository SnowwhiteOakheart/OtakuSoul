import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyColorMode } from "./services/theme";
import { installFrontendLogForwarding } from "./services/frontendLog";
import { isPetWindow } from "./services/desktopPet";

installFrontendLogForwarding();
applyColorMode('system');
// The desktop pet's window is transparent: no page background behind the avatar.
if (isPetWindow()) document.documentElement.classList.add('pet-window');

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
