import {readConfig} from "./config";
import {createApi} from "./app";
import {database,readiness} from "./db";
try{
  const config=readConfig(),probe=database(config);try{await readiness(probe,config);}finally{await probe.end();}
  const app=await createApi(config);
  await app.listen({host:config.apiHost,port:config.apiPort});
  console.log(JSON.stringify({event:"backend-listening",host:config.apiHost,port:config.apiPort,environment:config.environment}));
  for(const signal of ["SIGINT","SIGTERM"] as const)process.on(signal,()=>{void app.close().then(()=>process.exit(0));});
}catch{console.error("Backend startup failed. Verify the private environment and database readiness; no credentials printed.");process.exitCode=1;}
