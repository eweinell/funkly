import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SessionProvider } from "./state/SessionContext";
import { AccessGate } from "./components/access/AccessGate";
import "./styles/tokens.css";
import "./styles/base.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AccessGate>
      <SessionProvider>
        <App />
      </SessionProvider>
    </AccessGate>
  </React.StrictMode>
);
