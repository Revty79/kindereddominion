import {z} from "zod";
import type {FastifyInstance} from "fastify";
import type {Authentication} from "./auth";
import {uuid} from "./auth";
import {transaction,type DB} from "./db";
import type {BackendConfig} from "./config";
import {activeContent} from "./catalog";
import {selectedConfiguration} from "./configuration";
import {shopSchema} from "./shop-rules";
import {selectedStarters} from "./starters";
import {documentOf,workspaceDocument} from "./deck-schema";
import {economyDigest} from "./economy-hash";
import {reject} from "./errors";

type DeckReader=(db:any,id:string,playerId:string,lock?:boolean)=>Promise<any>;
export function deckWorkspaceRoutes(app:FastifyInstance,pool:DB,auth:Authentication,config:BackendConfig,getDeck:DeckReader){
  app.get("/api/deck-builder",async req=>{
    await auth.actor(req);
    const pack=await activeContent(pool),selected=await selectedConfiguration(pool,"shop"),rules=selected?shopSchema.parse(selected.document):null;
    const visible=new Set(pack.cards.map(c=>c.id));
    const policy=await selectedStarters(pool,config);
    // Inactive, unapproved V1.6A proposals never replace official recommendations.
    const usePolicy=policy?.rules.newPlayersEnabled||policy?.rules.backfillEnabled;
    const recommended=pack.decks.map(d=>({...d,source:"Official published formation",configVersion:null as string|null}));
    if(usePolicy&&policy)for(const d of policy.rules.definitions){
      const at=recommended.findIndex(r=>r.collection===d.kindred);
      const replacement={...recommended[at],id:"starter-recipe-"+d.kindred.toLowerCase(),collection:d.kindred,cards:d.recommended.cards,name:d.recommended.name,source:"Active starter recipe "+policy.rules.recipeVersion,configVersion:policy.id};
      if(at>=0)recommended[at]=replacement;
      for(const [index,alternative]of d.alternatives.entries())recommended.push({...replacement,...alternative,id:replacement.id+"-alternative-"+(index+1)});
    }
    return {contentVersion:pack.id,recommendations:recommended,eligibility:{version:selected?.id??null,defaultFormat:rules?.defaultFormat??null,formats:rules?.formats.filter(f=>f.enabled)??[],collections:rules?.collections.filter(c=>c.status!=="draft").map(c=>({id:c.id,name:c.name,status:c.status,cards:c.cards.filter(id=>visible.has(id))}))??[],rarities:rules?Object.fromEntries(Object.entries(rules.rarities).filter(([id])=>visible.has(id))):{},retired:(await pool.query("SELECT id FROM kd.card_identity WHERE retired AND id=ANY($1)",[[...visible]])).rows.map(r=>r.id)}};
  });
  app.get<{Params:{id:string}}>("/api/decks/:id/workspace",async req=>{
    const a=await auth.actor(req),id=uuid.parse(req.params.id);
    return transaction(pool,async c=>{
      await c.query("SELECT id FROM kd.player WHERE id=$1 FOR SHARE",[a.id]);
      const deck=await getDeck(c,id,a.id),w=(await c.query("SELECT * FROM kd.deck_workspace WHERE deck_id=$1 AND player_id=$2",[id,a.id])).rows[0];
      return {deck,revision:w?.revision??0,baseRevision:w?.base_revision??deck.revision,document:w?.document??documentOf(deck),updatedAt:w?.updated_at??deck.updatedAt,stale:!!w&&w.base_revision!==deck.revision};
    });
  });
  app.put<{Params:{id:string}}>("/api/decks/:id/workspace",async req=>{
    const a=await auth.actor(req),id=uuid.parse(req.params.id),b=z.object({revision:z.number().int().min(0),baseRevision:z.number().int().positive(),document:workspaceDocument}).strict().parse(req.body);
    if(b.document.testingAccess&&a.role==="player")reject(403,"testing_forbidden","Unrestricted testing requires an authorized developer role.");
    return transaction(pool,async c=>{
      await c.query("SELECT id FROM kd.player WHERE id=$1 FOR UPDATE",[a.id]);
      const deck=await getDeck(c,id,a.id,true),w=(await c.query("SELECT * FROM kd.deck_workspace WHERE deck_id=$1 AND player_id=$2 FOR UPDATE",[id,a.id])).rows[0];
      if(deck.revision!==b.baseRevision||w&&w.base_revision!==b.baseRevision)reject(409,"stale_deck","The saved deck changed. Keep your edits and review the current server copy.");
      if((w?.revision??0)!==b.revision){
        if(w&&economyDigest(w.document)===economyDigest(b.document))return {revision:w.revision,baseRevision:w.base_revision,replayed:true};
        reject(409,"stale_workspace","Another session saved different working edits. Your local edits are retained for review.");
      }
      const revision=(w?.revision??0)+1;
      await c.query("INSERT INTO kd.deck_workspace(deck_id,player_id,base_revision,revision,document) VALUES($1,$2,$3,$4,$5) ON CONFLICT(deck_id) DO UPDATE SET revision=$4,document=$5,updated_at=now()",[id,a.id,b.baseRevision,revision,b.document]);
      return {revision,baseRevision:b.baseRevision,replayed:false};
    });
  });
  app.delete<{Params:{id:string}}>("/api/decks/:id/workspace",async req=>{
    const a=await auth.actor(req),id=uuid.parse(req.params.id),b=z.object({revision:z.number().int().min(0)}).strict().parse(req.body);
    return transaction(pool,async c=>{
      await c.query("SELECT id FROM kd.player WHERE id=$1 FOR UPDATE",[a.id]);const deck=await getDeck(c,id,a.id,true);
      const w=(await c.query("SELECT revision,document FROM kd.deck_workspace WHERE deck_id=$1 AND player_id=$2 FOR UPDATE",[id,a.id])).rows[0];
      if(w&&w.document===null)return {discarded:false,revision:w.revision};
      if((w?.revision??0)!==b.revision)reject(409,"stale_workspace","Working edits changed. Review the latest server copy before discarding.");
      // A JSON-null tombstone retains the counter: discard/recreate cannot reuse a stale revision.
      if(w)await c.query("UPDATE kd.deck_workspace SET document='null'::jsonb,revision=revision+1,base_revision=$3,updated_at=now() WHERE deck_id=$1 AND player_id=$2",[id,a.id,deck.revision]);
      return {discarded:!!w,revision:w?w.revision+1:0};
    });
  });
}
