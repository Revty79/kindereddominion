import {assumptions,scenarios,simulateEconomy} from "./economy-model";
console.log(JSON.stringify({assumptions,results:scenarios.map(scenario=>simulateEconomy(scenario))},null,2));
