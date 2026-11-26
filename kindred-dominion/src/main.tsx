import React from "react";
import ReactDOM from "react-dom/client";
const Host = React.lazy(() => import.meta.env.VITE_STUDIO === "0" ? import("./ui/PlayerHost") : import("./ui/GameHost"));
import "./ui/styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <React.Suspense fallback={<p className="notice">Loading Kindred Dominion…</p>}><Host /></React.Suspense>
  </React.StrictMode>,
);
