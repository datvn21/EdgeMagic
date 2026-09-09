import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./ui/app.js";
import { initializeDesktopDatabase } from "./data/desktop-database.js";
import "./shared/styles/index.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

void initializeDesktopDatabase().then(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}).catch((error: unknown) => {
  console.error("EdgeMagic database initialization failed", error);
  root.render(
    <React.StrictMode>
      <DatabaseInitializationError error={error} />
    </React.StrictMode>
  );
});

function DatabaseInitializationError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Unknown database error.";
  return (
    <main className="app-shell edge-right density-comfortable theme-dark" data-state="focus">
      <section className="edgebar edgebar-focus" aria-label="EdgeMagic startup error">
        <div className="module-workspace">
          <h1>EdgeMagic could not start</h1>
          <p>{message}</p>
        </div>
      </section>
    </main>
  );
}
