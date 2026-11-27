import fs from "node:fs/promises";
import {integratedEconomyModel} from "./v15-model";
const result=integratedEconomyModel();await fs.writeFile("docs/V1.5G-SIMULATION.json",JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify({modelOnly:true,actualRevenue:0,profiles:result.profiles.map(({id,completionDay,paidPacks,giftPacks,uniqueCards,conserved})=>({id,completionDay,paidPacks,giftPacks,uniqueCards,conserved})),report:"docs/V1.5G-SIMULATION.json"}));
