import crypto from "node:crypto";
import {z} from "zod";
import type {FastifyInstance} from "fastify";
import type {Authentication} from "./auth";
import {uuid,operationKey} from "./auth";
import {transaction,type DB} from "./db";
import {activeContent} from "./catalog";
import {owned,startingCollection,grant,validateOwnedDeck,ownedDeckLegality} from "./inventory";
import {DEFAULT_CONFIG} from "../src/engine/config";
import {reject} from "./errors";
import type {BackendConfig} from "./config";
import {collectionAppearance,deckFormat} from "./shop-formats";
import {activityEconomy,currentEconomy,economyEvent} from "./economy";
import {starterOffer} from "./starters";
export {configInput} from "./deck-schema";
import {deckInput,documentOf} from "./deck-schema";
import {deckWorkspaceRoutes} from "./deck-workspaces";
export async function getDeck(db:any,id:string,playerId:string,lock=false){
  const {rows:[d]}=await db.query(`SELECT * FROM kd.deck WHERE id=$1 AND player_id=$2 AND deleted_at IS NULL ${lock?"FOR UPDATE":""}`,[id,playerId]);
  if(!d)reject(404,"deck_missing","Deck was not found.");const {rows}=await db.query("SELECT card_id FROM kd.deck_card WHERE deck_id=$1 ORDER BY slot",[id]);
  const format=(await db.query("SELECT format_id FROM kd.deck_eligibility WHERE deck_id=$1",[id])).rows[0];
  return {formatId:format?.format_id??null,id:d.id,name:d.name,cards:rows.map((r:any)=>r.card_id),config:d.config,version:d.version_id,revision:d.revision,draft:d.is_draft,testingAccess:d.testing_access,createdAt:d.created_at,updatedAt:d.updated_at};
}
export function playerRoutes(app:FastifyInstance,pool:DB,auth:Authentication,serverConfig:BackendConfig){
  deckWorkspaceRoutes(app,pool,auth,serverConfig,getDeck);
  app.get("/api/catalog",async()=>({content:await activeContent(pool)}));
  app.get("/api/collection",async req=>{
    const actor=await auth.actor(req),content=await activeContent(pool),inventory=await owned(pool,actor.id);
    const quantities=new Map<string,number>();for(const row of inventory)quantities.set(row.card_id,(quantities.get(row.card_id)??0)+row.quantity);
    const completion=content.collections.map(k=>{const cards=content.cards.filter(c=>c.kindred===k.id),missing=cards.filter(c=>!quantities.get(c.collectible!.gameplayId));return {kindred:k.id,unique:cards.length-missing.length,available:cards.length,copies:cards.reduce((n,c)=>n+(quantities.get(c.collectible!.gameplayId)??0),0),missing:missing.map(c=>c.collectible!.number)};});
    const editions=(await pool.query("SELECT id,card_id,edition FROM kd.edition WHERE card_id=ANY($1) ORDER BY card_id,edition",[content.cards.map(c=>c.collectible!.gameplayId)])).rows;
    return {starter:await starterOffer(pool,serverConfig),...await collectionAppearance(pool,actor.id),content,inventory,completion,editions,ownership:"permanent",practiceAccess:"Local practice grants unrestricted testing access separately from permanent ownership."};
  });
  app.post("/api/starting-collection",async req=>{const a=await auth.actor(req),b=z.object({kindred:z.enum(["Nature","Mythical","Arcane","Undead","Constructs"]),idempotencyKey:operationKey}).strict().parse(req.body);return startingCollection(pool,a,b.kindred,b.idempotencyKey,async(c,cards)=>{const active=await currentEconomy(c,serverConfig);if(active)await economyEvent(c,a.id,"unique_card",`starter:${b.kindred}`,cards.length,{kindreds:[b.kindred]},active);},serverConfig);});
  app.post("/api/admin/inventory",async req=>{
    const a=await auth.actor(req,["administrator"]),b=z.object({playerId:uuid,idempotencyKey:operationKey,source:z.string().trim().min(3).max(100),changes:z.array(z.object({editionId:z.string().min(1).max(180),quantity:z.number().int().min(-1000).max(1000).refine(n=>n!==0)}).strict()).min(1).max(150)}).strict().parse(req.body);
    return grant(pool,b.playerId,b.idempotencyKey,b.source,b.changes,a);
  });
  app.get("/api/decks",async req=>{
    const a=await auth.actor(req);
    return transaction(pool,async c=>{
      await c.query("SELECT id FROM kd.player WHERE id=$1 FOR SHARE",[a.id]);
      const pack=await activeContent(c),{rows}=await c.query("SELECT id FROM kd.deck WHERE player_id=$1 AND deleted_at IS NULL ORDER BY created_at,id",[a.id]);
      const pending=(await c.query("SELECT deck_id,revision,base_revision,updated_at,document->>'name' AS name,jsonb_array_length(document->'cards') AS count FROM kd.deck_workspace WHERE player_id=$1 AND document<>'null'::jsonb",[a.id])).rows;
      const decks=[];
      for(const row of rows){const deck=await getDeck(c,row.id,a.id),report=await ownedDeckLegality(c,a,deck.cards,pack,deck.config,deck.testingAccess),eligibility=await deckFormat(c,deck.cards,pack,deck.config,deck.formatId),errors=[...new Set([...report.errors,...eligibility.errors])];decks.push({...deck,workspace:pending.find(w=>w.deck_id===deck.id)??null,legal:!deck.draft&&!deck.testingAccess&&errors.length===0,legality:errors});}
      const selected=(await c.query("SELECT default_deck_id FROM kd.player WHERE id=$1",[a.id])).rows[0];
      return {decks,defaultDeckId:selected.default_deck_id};
    });
  });
  app.get<{Params:{id:string}}>("/api/decks/:id",async req=>{const a=await auth.actor(req),id=uuid.parse(req.params.id);return transaction(pool,async c=>{await c.query("SELECT id FROM kd.player WHERE id=$1 FOR SHARE",[a.id]);return getDeck(c,id,a.id);});});
  const save=async(req:any,id?:string,duplicateId?:string)=>{
    const a=await auth.actor(req);
    return transaction(pool,async c=>{
      await c.query("SELECT id FROM kd.player WHERE id=$1 FOR UPDATE",[a.id]);
      const pack=await activeContent(c);let input=req.body;
      if(duplicateId){
        const options=z.object({revision:z.number().int().positive().optional()}).strict().parse(req.body??{}),source=await getDeck(c,duplicateId,a.id,true);
        if(options.revision!==undefined&&options.revision!==source.revision)reject(409,"stale_deck","The source deck changed. Refresh before duplicating.");
        const report=await ownedDeckLegality(c,a,source.cards,pack,source.config,source.testingAccess),format=await deckFormat(c,source.cards,pack,source.config,source.formatId);
        input={...documentOf(source),name:`${source.name} copy`.slice(0,80),draft:source.draft||!!report.errors.length||!!format.errors.length};
      }
      const b=deckInput.parse(input),config={...structuredClone(DEFAULT_CONFIG),...b.config},previous=id?await getDeck(c,id,a.id,true):null;
      if(previous&&b.revision!==previous.revision)reject(409,"stale_deck","Deck changed in another session. Reload before saving.");
      const workspace=id?(await c.query("SELECT revision,base_revision,document FROM kd.deck_workspace WHERE deck_id=$1 AND player_id=$2 FOR UPDATE",[id,a.id])).rows[0]:null;
      if(workspace&&workspace.document!==null&&b.workspaceRevision!==workspace.revision||b.workspaceRevision!==undefined&&b.workspaceRevision!==(workspace?.revision??0))reject(409,"stale_workspace","Working edits changed. Review them before saving this deck.");
      if(workspace&&workspace.base_revision!==previous!.revision)reject(409,"stale_deck","The working copy is based on an older deck revision.");
      await validateOwnedDeck(c,a,b.cards,pack,config,b.testingAccess,b.draft);
      const formatId=b.formatId===undefined?previous?.formatId??null:b.formatId,eligibility=await deckFormat(c,b.cards,pack,config,formatId);
      if(!b.draft&&!b.testingAccess&&eligibility.errors.length)reject(400,"deck_format_ineligible",eligibility.errors.join(" "));
      const deckId=id??crypto.randomUUID(),revision=previous?previous.revision+1:1;
      if(previous){await c.query("UPDATE kd.deck SET name=$3,version_id=$4,config=$5,revision=$6,testing_access=$7,is_draft=$8,updated_at=now() WHERE id=$1 AND player_id=$2",[deckId,a.id,b.name,pack.id,config,revision,b.testingAccess,b.draft]);await c.query("DELETE FROM kd.deck_card WHERE deck_id=$1",[deckId]);}
      else await c.query("INSERT INTO kd.deck(id,player_id,name,version_id,config,testing_access,is_draft) VALUES($1,$2,$3,$4,$5,$6,$7)",[deckId,a.id,b.name,pack.id,config,b.testingAccess,b.draft]);
      if(formatId&&eligibility.shopVersion)await c.query("INSERT INTO kd.deck_eligibility(deck_id,format_id,config_version) VALUES($1,$2,$3) ON CONFLICT(deck_id) DO UPDATE SET format_id=$2,config_version=$3,updated_at=now()",[deckId,formatId,eligibility.shopVersion]);else await c.query("DELETE FROM kd.deck_eligibility WHERE deck_id=$1",[deckId]);
      for(let i=0;i<b.cards.length;i++)await c.query("INSERT INTO kd.deck_card(deck_id,slot,card_id) VALUES($1,$2,$3)",[deckId,i,b.cards[i]]);
      await c.query("INSERT INTO kd.deck_history(deck_id,revision,snapshot) VALUES($1,$2,$3)",[deckId,revision,{name:b.name,cards:b.cards,formatId,config,version:pack.id,testingAccess:b.testingAccess,draft:b.draft}]);
      if(workspace)await c.query("DELETE FROM kd.deck_workspace WHERE deck_id=$1",[deckId]);
      if(b.draft)await c.query("UPDATE kd.player SET default_deck_id=NULL WHERE id=$1 AND default_deck_id=$2",[a.id,deckId]);
      if(!b.draft&&!b.testingAccess)await activityEconomy(c,a.id,"deck_saved",`deck:${deckId}:${revision}`,serverConfig);
      return getDeck(c,deckId,a.id);
    });
  };
  app.post("/api/decks",async(req,reply)=>{const d=await save(req);reply.code(201);return d;});
  app.put<{Params:{id:string}}>("/api/decks/:id",async req=>save(req,uuid.parse(req.params.id)));
  app.post<{Params:{id:string}}>("/api/decks/:id/duplicate",async req=>save(req,undefined,uuid.parse(req.params.id)));
  app.post<{Params:{id:string}}>("/api/decks/:id/default",async req=>{const a=await auth.actor(req),id=uuid.parse(req.params.id);return transaction(pool,async c=>{await c.query("SELECT id FROM kd.player WHERE id=$1 FOR UPDATE",[a.id]);const deck=await getDeck(c,id,a.id,true);if(deck.draft||deck.testingAccess)reject(400,"deck_not_ready","Choose a legal ordinary playing deck, not a draft or development deck.");const pack=await activeContent(c);await validateOwnedDeck(c,a,deck.cards,pack,deck.config);const eligibility=await deckFormat(c,deck.cards,pack,deck.config,deck.formatId);if(eligibility.errors.length)reject(400,"deck_format_ineligible",eligibility.errors.join(" "));await c.query("UPDATE kd.player SET default_deck_id=$2 WHERE id=$1",[a.id,id]);return {defaultDeckId:id};});});
  app.delete<{Params:{id:string}}>("/api/decks/:id",async req=>{const a=await auth.actor(req),id=uuid.parse(req.params.id),b=z.object({revision:z.number().int().positive().optional(),workspaceRevision:z.number().int().min(0).optional()}).strict().parse(req.body??{});return transaction(pool,async c=>{await c.query("SELECT id FROM kd.player WHERE id=$1 FOR UPDATE",[a.id]);const deck=await getDeck(c,id,a.id,true),workspace=(await c.query("SELECT revision,document FROM kd.deck_workspace WHERE deck_id=$1",[id])).rows[0];if(b.revision!==undefined&&b.revision!==deck.revision||workspace&&workspace.document!==null&&b.workspaceRevision!==workspace.revision)reject(409,"stale_deck","Deck or working edits changed. Refresh before confirming deletion.");await c.query("UPDATE kd.player SET default_deck_id=NULL WHERE id=$1 AND default_deck_id=$2",[a.id,id]);await c.query("UPDATE kd.deck SET deleted_at=now(),revision=revision+1 WHERE id=$1 AND player_id=$2",[id,a.id]);return {deleted:true};});});
  app.get("/api/progression",async req=>{
    const a=await auth.actor(req),{rows}=await pool.query("SELECT scoring,outcome,kindreds FROM kd.match_completion WHERE player_id=$1",[a.id]);
    const stats={matches:rows.length,wins:0,losses:0,draws:0,rulesets:{} as Record<string,number>,kindreds:{} as Record<string,number>};
    for(const row of rows){stats[row.outcome==="win"?"wins":row.outcome==="loss"?"losses":"draws"]++;stats.rulesets[row.scoring]=(stats.rulesets[row.scoring]??0)+1;for(const k of row.kindreds)stats.kindreds[k]=(stats.kindreds[k]??0)+1;}
    return {stats,source:"verified-server-matches",economyEnabled:!!(await currentEconomy(pool,serverConfig))};
  });
}
