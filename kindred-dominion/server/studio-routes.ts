import {z} from "zod";
import type {FastifyInstance} from "fastify";
import type {Workspace} from "../src/content/types";
import {validateWorkspace} from "../src/content/transfer";
import {transaction,type DB} from "./db";
import type {Authentication} from "./auth";
import {digest} from "./security";
import {reject} from "./errors";
export function studioRoutes(app:FastifyInstance,pool:DB,auth:Authentication){
  const roles=["developer","administrator"] as ("developer"|"administrator")[];
  function valid(value:unknown):Workspace{try{validateWorkspace(value);}catch{reject(400,"invalid_workspace","Workspace failed the shared import validators. No data was written.");}return value as Workspace;}
  async function current(c:any,id:string,lock=false){const {rows:[r]}=await c.query(`SELECT revision,workspace FROM kd.studio_workspace WHERE player_id=$1 ${lock?"FOR UPDATE":""}`,[id]);return r??{revision:-1,workspace:null};}
  async function store(c:any,id:string,workspace:Workspace,expected:number){
    await c.query("SELECT id FROM kd.player WHERE id=$1 FOR UPDATE",[id]);const previous=await current(c,id,true);
    if(previous.revision!==expected)reject(409,"stale_workspace","Private Studio changed in another session. Reload or export your draft before retrying.");
    if(previous.workspace)await c.query("INSERT INTO kd.studio_workspace_history(player_id,revision,workspace) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[id,previous.revision,previous.workspace]);
    const revision=previous.revision+1;
    await c.query("INSERT INTO kd.studio_workspace(player_id,revision,workspace) VALUES($1,$2,$3) ON CONFLICT(player_id) DO UPDATE SET revision=EXCLUDED.revision,workspace=EXCLUDED.workspace,updated_at=now()",[id,revision,{...workspace,revision}]);
    return {revision,workspace:{...workspace,revision}};
  }
  app.get("/api/developer/workspace",async req=>current(pool,(await auth.actor(req,roles)).id));
  app.put("/api/developer/workspace",{bodyLimit:16*1024*1024},async req=>{const a=await auth.actor(req,roles),b=z.object({revision:z.number().int().min(-1),workspace:z.unknown()}).strict().parse(req.body),workspace=valid(b.workspace);return transaction(pool,c=>store(c,a.id,workspace,b.revision));});
  app.get("/api/developer/versions",async req=>{await auth.actor(req,roles);return {versions:(await pool.query("SELECT id,engine_version,channel,created_at FROM kd.content_version ORDER BY created_at,id")).rows};});
  app.post("/api/developer/import/preview",{bodyLimit:16*1024*1024},async req=>{
    const a=await auth.actor(req,roles),b=z.object({workspace:z.unknown()}).strict().parse(req.body),workspace=valid(b.workspace),existing=await current(pool,a.id),fingerprint=digest(workspace);
    const {rows:[prior]}=await pool.query("SELECT 1 FROM kd.local_import WHERE player_id=$1 AND fingerprint=$2",[a.id,fingerprint]);
    const old=new Map<string,unknown>((existing.workspace?.working.cards??[]).map((c:any)=>[c.id,c]));
    const conflicts=workspace.working.cards.filter(c=>old.has(c.id)&&digest(old.get(c.id))!==digest(c)).map(c=>c.id);
    return {fingerprint,serverRevision:existing.revision,alreadyImported:!!prior,conflicts,hasExistingWorkspace:!!existing.workspace,summary:{workingCards:workspace.working.cards.length,versions:workspace.versions.length,scenarios:workspace.scenarios.length,replays:workspace.replays.length,reports:workspace.reports.length},classification:"untrusted-development",ownershipGranted:false,competitiveStatisticsImported:false,requiresBackupConfirmation:true};
  });
  app.post("/api/developer/import",{bodyLimit:16*1024*1024},async req=>{
    const a=await auth.actor(req,roles),b=z.object({workspace:z.unknown(),fingerprint:z.string().length(64),revision:z.number().int().min(-1),confirmBackup:z.literal(true),confirmConflicts:z.literal(true)}).strict().parse(req.body),workspace=valid(b.workspace);
    if(digest(workspace)!==b.fingerprint)reject(409,"import_changed","Import changed since its preview. Preview it again.");
    return transaction(pool,async c=>{
      await c.query("SELECT id FROM kd.player WHERE id=$1 FOR UPDATE",[a.id]);
      if((await c.query("SELECT 1 FROM kd.local_import WHERE player_id=$1 AND fingerprint=$2",[a.id,b.fingerprint])).rowCount)reject(409,"duplicate_import","This development snapshot was already imported.");
      const result=await store(c,a.id,workspace,b.revision);
      await c.query("INSERT INTO kd.local_import(player_id,fingerprint,summary) VALUES($1,$2,$3)",[a.id,b.fingerprint,{cards:workspace.working.cards.length,versions:workspace.versions.length,replays:workspace.replays.length}]);
      return {...result,classification:"untrusted-development",localDataUntouched:true};
    });
  });
}
