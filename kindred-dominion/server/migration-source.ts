import crypto from "node:crypto";
export function migrationSourceHash(bytes:Buffer){
 if(bytes.includes(13)||bytes.subarray(0,3).equals(Buffer.from([239,187,191])))throw Error("Migration sources require exact UTF-8 Git bytes with LF line endings and no BOM. Restore the committed source before any database writes.");
 return crypto.createHash("sha256").update(bytes).digest("hex");
}
