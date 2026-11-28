import fs from "node:fs";
import {importRegression,regressionResult} from "../src/sandbox/laboratory";
const file=process.argv[2];if(!file)throw Error("Provide a private exported scenario regression JSON file.");
if(fs.statSync(file).size>16*1024*1024)throw Error("Scenario fixture exceeds the private workspace size boundary.");
const scenario=importRegression(JSON.parse(fs.readFileSync(file,"utf8"))),result=regressionResult(scenario);
console.log(JSON.stringify({scenario:scenario.id,ruleset:scenario.laboratory?.ruleset?{id:scenario.laboratory.ruleset.id,revision:scenario.laboratory.ruleset.revision}:null,contentVersion:scenario.content.id,...result}));
if(!result.passed)process.exitCode=1;
