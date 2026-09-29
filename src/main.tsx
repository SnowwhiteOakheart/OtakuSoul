import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyColorMode } from "./services/theme";
import { installFrontendLogForwarding } from "./services/frontendLog";

installFrontendLogForwarding();
applyColorMode('system');

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
