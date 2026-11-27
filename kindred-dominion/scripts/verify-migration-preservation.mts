import fs from "node:fs/promises";
import crypto from "node:crypto";
import {readConfig} from "../server/config";
import {database,target} from "../server/db";
// Read-only evidence of every existing column, without writing private row data.
const config=readConfig(),pool=database(config),[command,file]=process.argv.slice(2);
if(!["capture","verify"].includes(command)||!file?.startsWith(".local/"))throw Error("Use capture|verify .local/<private receipt>.json");
const quote=(name:string)=>{if(!/^[a-z_][a-z0-9_]*$/.test(name))throw Error("Unexpected schema identifier");return '"'+name+'"';};
try{
  const identity=await target(pool,config);
  const expected=command==="verify"?JSON.parse(await fs.readFile(file,"utf8")):null;
  if(expected&&["host","port","database","username"].some(key=>expected.target[key]!==identity[key]))throw Error("Preservation receipt belongs to a different database target.");
  const tables=expected?.tables??(await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='kd' AND table_type='BASE TABLE' AND table_name NOT IN ('migration_checksum','pgmigrations') ORDER BY table_name")).rows.map(row=>({name:row.table_name}));
  const results=[];
  for(const table of tables){
    const columns=table.columns??(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='kd' AND table_name=$1 ORDER BY ordinal_position",[table.name])).rows.map(row=>row.column_name);
    const rows=(await pool.query(`SELECT ${columns.map(name=>`${quote(name)}::text AS ${quote(name)}`).join(",")} FROM kd.${quote(table.name)}`)).rows.map(row=>JSON.stringify(columns.map(name=>row[name]))).sort();
    const hash=crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
    if(expected&&(table.count!==rows.length||table.sha256!==hash))throw Error(`Existing data changed in ${table.name}; do not claim preservation.`);
    results.push({name:table.name,columns,count:rows.length,sha256:hash});
  }
  const receipt={target:identity,createdAt:new Date().toISOString(),tables:results,allExistingColumnsPreserved:!!expected};
  await fs.writeFile(command==="capture"?file:file+".verified.json",JSON.stringify(receipt,null,2),{mode:0o600});
  console.log(JSON.stringify({operation:command,target:identity,tables:results.length,rows:results.reduce((n,table)=>n+table.count,0),existingColumnsPreserved:!!expected,receipt:file}));
}finally{await pool.end();}
