import React from "react";
import {createRoot} from "react-dom/client";
import PlayerApplication from "./player/PlayerApplication";
import "./ui/styles.css";
createRoot(document.getElementById("root")!).render(<React.StrictMode><PlayerApplication/></React.StrictMode>);
