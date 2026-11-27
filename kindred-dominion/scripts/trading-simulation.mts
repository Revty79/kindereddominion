import fs from "node:fs/promises";
import {tradingSimulation} from "./trading-model";
const result=tradingSimulation();await fs.writeFile("docs/V1.5E-SIMULATION.json",JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify({modelOnly:true,sourceIdentities:result.markets.balanced.sourceIdentities,markets:Object.fromEntries(Object.entries(result.markets).map(([k,v])=>[k,{players:v.players,trades:v.trades,earned:v.earnedCopies,remaining:v.remainingCopies,conserved:v.conserved,maxNewRewardIdentities:v.maximumNewRewardIdentitiesPerPlayer}])),report:"docs/V1.5E-SIMULATION.json"}));
