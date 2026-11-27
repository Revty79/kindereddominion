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
import {activityEconomy,currentEconomy,economyEvent} from "./economy";
export const configInput=z.object({scoring:z.enum(["classic","domination"]).default("classic"),mode:z.enum(["standard","free"]).default("standard"),collection:z.enum(["mixed","Nature","Mythical","Arcane","Undead","Constructs"]).default("mixed")}).strict();
const deckInput=z.object({name:z.string().trim().min(1).max(80),cards:z.array(z.string().min(1).max(80)).max(15),config:configInput,draft:z.boolean().default(false),testingAccess:z.boolean().default(false),revision:z.number().int().positive().optional()}).strict();
export async function getDeck(db:any,id:string,playerId:string,lock=false){
  const {rows:[d]}=await db.query(`SELECT * FROM kd.deck WHERE id=$1 AND player_id=$2 AND deleted_at IS NULL ${lock?"FOR UPDATE":""}`,[id,playerId]);
  if(!d)reject(404,"deck_missing","Deck was not found.");const {rows}=await db.query("SELECT card_id FROM kd.deck_card WHERE deck_id=$1 ORDER BY slot",[id]);
  return {id:d.id,name:d.name,cards:rows.map((r:any)=>r.card_id),config:d.config,version:d.version_id,revision:d.revision,draft:d.is_draft,testingAccess:d.testing_access,createdAt:d.created_at,updatedAt:d.updated_at};
}
export function playerRoutes(app:FastifyInstance,pool:DB,auth:Authentication,serverConfig:BackendConfig){
  app.get("/api/catalog",async()=>({content:await activeContent(pool)}));
  app.get("/api/collection",async req=>{
    const actor=await auth.actor(req),content=await activeContent(pool),inventory=await owned(pool,actor.id);
    const quantities=new Map<string,number>();for(const row of inventory)quantities.set(row.card_id,(quantities.get(row.card_id)??0)+row.quantity);
    const completion=content.collections.map(k=>{const cards=content.cards.filter(c=>c.kindred===k.id),missing=cards.filter(c=>!quantities.get(c.collectible!.gameplayId));return {kindred:k.id,unique:cards.length-missing.length,available:cards.length,copies:cards.reduce((n,c)=>n+(quantities.get(c.collectible!.gameplayId)??0),0),missing:missing.map(c=>c.collectible!.number)};});
    const editions=(await pool.query("SELECT id,card_id,edition FROM kd.edition WHERE card_id=ANY($1) ORDER BY card_id,edition",[content.cards.map(c=>c.collectible!.gameplayId)])).rows;
    return {content,inventory,completion,editions,ownership:"permanent",practiceAccess:"Local practice grants unrestricted testing access separately from permanent ownership."};
  });
  app.post("/api/starting-collection",async req=>{const a=await auth.actor(req),b=z.object({kindred:z.enum(["Nature","Mythical","Arcane","Undead","Constructs"]),idempotencyKey:operationKey}).strict().parse(req.body);return startingCollection(pool,a,b.kindred,b.idempotencyKey,async(c,cards)=>{const active=await currentEconomy(c,serverConfig);if(active)await economyEvent(c,a.id,"unique_card",`starter:${b.kindred}`,cards.length,{kindreds:[b.kindred]},active);});});
  app.post("/api/admin/inventory",async req=>{
    const a=await auth.actor(req,["administrator"]),b=z.object({playerId:uuid,idempotencyKey:operationKey,source:z.string().trim().min(3).max(100),changes:z.array(z.object({editionId:z.string().min(1).max(180),quantity:z.number().int().min(-1000).max(1000).refine(n=>n!==0)}).strict()).min(1).max(150)}).strict().parse(req.body);
    return grant(pool,b.playerId,b.idempotencyKey,b.source,b.changes,a);
  });
  app.get("/api/decks",async req=>{const a=await auth.actor(req),pack=await activeContent(pool),{rows}=await pool.query("SELECT id FROM kd.deck WHERE player_id=$1 AND deleted_at IS NULL ORDER BY created_at,id",[a.id]);const decks=[];for(const row of rows){const deck=await getDeck(pool,row.id,a.id),report=await ownedDeckLegality(pool,a,deck.cards,pack,deck.config,deck.testingAccess);decks.push({...deck,legal:!deck.draft&&!deck.testingAccess&&report.errors.length===0,legality:report.errors});}return {decks,defaultDeckId:a.defaultDeckId};});
  app.get<{Params:{id:string}}>("/api/decks/:id",async req=>getDeck(pool,uuid.parse(req.params.id),(await auth.actor(req)).id));
  const save=async(req:any,id?:string,body?:unknown)=>{
    const a=await auth.actor(req),b=deckInput.parse(body??req.body),config={...structuredClone(DEFAULT_CONFIG),...b.config};
    return transaction(pool,async c=>{
      await c.query("SELECT id FROM kd.player WHERE id=$1 FOR UPDATE",[a.id]);
      const previous=id?await getDeck(c,id,a.id,true):null;
      if(previous&&b.revision!==previous.revision)reject(409,"stale_deck","Deck changed in another session. Reload before saving.");
      const pack=await activeContent(c);await validateOwnedDeck(c,a,b.cards,pack,config,b.testingAccess,b.draft);
      const deckId=id??crypto.randomUUID(),revision=previous?previous.revision+1:1;
      if(previous){await c.query("UPDATE kd.deck SET name=$3,version_id=$4,config=$5,revision=$6,testing_access=$7,is_draft=$8,updated_at=now() WHERE id=$1 AND player_id=$2",[deckId,a.id,b.name,pack.id,config,revision,b.testingAccess,b.draft]);await c.query("DELETE FROM kd.deck_card WHERE deck_id=$1",[deckId]);}
      else await c.query("INSERT INTO kd.deck(id,player_id,name,version_id,config,testing_access,is_draft) VALUES($1,$2,$3,$4,$5,$6,$7)",[deckId,a.id,b.name,pack.id,config,b.testingAccess,b.draft]);
      for(let i=0;i<b.cards.length;i++)await c.query("INSERT INTO kd.deck_card(deck_id,slot,card_id) VALUES($1,$2,$3)",[deckId,i,b.cards[i]]);
      await c.query("INSERT INTO kd.deck_history(deck_id,revision,snapshot) VALUES($1,$2,$3)",[deckId,revision,{name:b.name,cards:b.cards,config,version:pack.id,testingAccess:b.testingAccess,draft:b.draft}]);
      if(b.draft)await c.query("UPDATE kd.player SET default_deck_id=NULL WHERE id=$1 AND default_deck_id=$2",[a.id,deckId]);
      if(!b.draft&&!b.testingAccess)await activityEconomy(c,a.id,"deck_saved",`deck:${deckId}:${revision}`,serverConfig);
      return getDeck(c,deckId,a.id);
    });
  };
  app.post("/api/decks",async(req,reply)=>{const d=await save(req);reply.code(201);return d;});
  app.put<{Params:{id:string}}>("/api/decks/:id",async req=>save(req,uuid.parse(req.params.id)));
  app.post<{Params:{id:string}}>("/api/decks/:id/duplicate",async req=>{const a=await auth.actor(req),d=await getDeck(pool,uuid.parse(req.params.id),a.id);return save(req,undefined,{name:`${d.name} copy`.slice(0,80),cards:d.cards,config:{scoring:d.config.scoring,mode:d.config.mode,collection:d.config.collection},testingAccess:d.testingAccess,draft:d.draft});});
  app.post<{Params:{id:string}}>("/api/decks/:id/default",async req=>{const a=await auth.actor(req),id=uuid.parse(req.params.id);return transaction(pool,async c=>{await c.query("SELECT id FROM kd.player WHERE id=$1 FOR UPDATE",[a.id]);const deck=await getDeck(c,id,a.id,true);if(deck.draft||deck.testingAccess)reject(400,"deck_not_ready","Choose a legal ordinary playing deck, not a draft or development deck.");await validateOwnedDeck(c,a,deck.cards,await activeContent(c),deck.config);await c.query("UPDATE kd.player SET default_deck_id=$2 WHERE id=$1",[a.id,id]);return {defaultDeckId:id};});});
  app.delete<{Params:{id:string}}>("/api/decks/:id",async req=>{const a=await auth.actor(req),id=uuid.parse(req.params.id);return transaction(pool,async c=>{await c.query("SELECT id FROM kd.player WHERE id=$1 FOR UPDATE",[a.id]);await getDeck(c,id,a.id,true);await c.query("UPDATE kd.player SET default_deck_id=NULL WHERE id=$1 AND default_deck_id=$2",[a.id,id]);await c.query("UPDATE kd.deck SET deleted_at=now(),revision=revision+1 WHERE id=$1 AND player_id=$2",[id,a.id]);return {deleted:true};});});
  app.get("/api/progression",async req=>{
    const a=await auth.actor(req),{rows}=await pool.query("SELECT scoring,outcome,kindreds FROM kd.match_completion WHERE player_id=$1",[a.id]);
    const stats={matches:rows.length,wins:0,losses:0,draws:0,rulesets:{} as Record<string,number>,kindreds:{} as Record<string,number>};
    for(const row of rows){stats[row.outcome==="win"?"wins":row.outcome==="loss"?"losses":"draws"]++;stats.rulesets[row.scoring]=(stats.rulesets[row.scoring]??0)+1;for(const k of row.kindreds)stats.kindreds[k]=(stats.kindreds[k]??0)+1;}
    return {stats,source:"verified-server-matches",economyEnabled:!!(await currentEconomy(pool,serverConfig))};
  });
}
