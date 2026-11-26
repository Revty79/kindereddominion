import React from "react";
import ReactDOM from "react-dom/client";
const Host = React.lazy(() => import.meta.env.VITE_STUDIO === "0" ? import("./ui/PlayerHost") : import("./ui/GameHost"));
const Account = React.lazy(() => import("./account/AccountPortal"));
import "./ui/styles.css";
function Root(){
  const [account,setAccount]=React.useState(location.hash==="#account");
  React.useEffect(()=>{const open=()=>{setAccount(true);history.replaceState(null,"",location.pathname+location.search+"#account");};window.addEventListener("kindred-open-account",open);return()=>window.removeEventListener("kindred-open-account",open);},[]);
  return <><div hidden={account}><Host/></div>{account&&<Account onClose={()=>{setAccount(false);history.replaceState(null,"",location.pathname+location.search);}}/>}</>;
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <React.Suspense fallback={<p className="notice">Loading Kindred Dominion…</p>}><Root /></React.Suspense>
  </React.StrictMode>,
);
