import {describe,it,expect} from "vitest";
import crypto from "node:crypto";
import {migrationSourceHash} from "../server/migration-source";
describe("Portable immutable migration sources",()=>{
 it("hashes the exact committed LF bytes without silently rewriting applied sources",()=>{const bytes=Buffer.from("exports.up=pgm=>pgm.sql('SELECT 1');\n");expect(migrationSourceHash(bytes)).toBe(crypto.createHash("sha256").update(bytes).digest("hex"));});
 it("rejects Windows line-ending conversion and BOM before a migration can be applied",()=>{for(const bytes of [Buffer.from("SELECT 1;\r\n"),Buffer.from("SELECT 1;\r"),Buffer.concat([Buffer.from([239,187,191]),Buffer.from("SELECT 1;\n")])])expect(()=>migrationSourceHash(bytes)).toThrow(/Restore the committed source before any database writes/);});
});
