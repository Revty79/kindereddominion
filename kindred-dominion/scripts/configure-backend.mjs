import fs from "node:fs";
import crypto from "node:crypto";
if(!process.stdin.isTTY)throw Error("Run this command in a private interactive terminal.");
const file="server/.env.local";
let contents=fs.existsSync(file)?fs.readFileSync(file,"utf8"):fs.readFileSync("server/.env.example","utf8").replace("SESSION_SECRET=replace-with-generated-secret",`SESSION_SECRET=${crypto.randomBytes(48).toString("base64url")}`);
process.stdin.setRawMode(true);process.stdin.resume();process.stdout.write("DEV database password (hidden input): ");
let value="";
process.stdin.on("data",buffer=>{
  for(const char of buffer.toString()){
    if(char==='\u0003'){process.stdin.setRawMode(false);process.exit(1);}
    if(char==='\r'||char==='\n'){
      if(!value.length){process.stdout.write("\nPassword was empty; file unchanged.\n");process.exit(1);}
      contents=contents.replace(/^PGPASSWORD=.*$/m,`PGPASSWORD=${JSON.stringify(value)}`);
      fs.writeFileSync(file,contents,{mode:0o600});value="";process.stdin.setRawMode(false);
      process.stdout.write("\nSaved private backend configuration. No credentials printed.\n");process.exit(0);
    }
    if(char==='\u007f'||char==='\b')value=value.slice(0,-1);else if(char.charCodeAt(0)>=32)value+=char;
  }
});
