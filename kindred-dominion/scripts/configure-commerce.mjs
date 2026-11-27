import fs from "node:fs";
import path from "node:path";
const file=path.resolve(process.env.KINDRED_ENV_FILE??"server/.env.local");
const names={COMMERCE_MODE:"disabled",STRIPE_SECRET_KEY:"",STRIPE_PUBLISHABLE_KEY:"",STRIPE_WEBHOOK_SECRET:"",STRIPE_ACCOUNT_ID:"",STRIPE_CATALOG_SECRET_KEY:""};
let value=fs.existsSync(file)?fs.readFileSync(file,"utf8"):fs.readFileSync("server/.env.example","utf8");
for(const [name,initial]of Object.entries(names))if(!new RegExp("^"+name+"=","m").test(value))value+="\n"+name+"="+initial;
fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value.replace(/\s*$/,"")+"\n",{mode:0o600});
console.log(JSON.stringify({privateFile:file,credentialVariables:Object.keys(names).filter(k=>k!=="COMMERCE_MODE"),preservedExistingValues:true,checkoutActivated:false,instruction:"Enter sandbox credentials privately in this ignored file. Never paste keys into chat or terminal commands."}));
