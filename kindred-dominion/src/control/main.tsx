import {createRoot} from "react-dom/client";
import ControlApplication from "./ControlApplication";
import "../ui/styles.css";
import "../player/player.css";
import "./control.css";
createRoot(document.getElementById("root")!).render(<ControlApplication/>);
