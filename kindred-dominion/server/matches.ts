import crypto from "node:crypto";
import {z} from "zod";
import type {FastifyInstance} from "fastify";
import type {GameState,Action,DiagnosticStep} from "../src/engine/types";
import type {ContentPack} from "../src/content/types";
import {act,createMatch,legalPlays,validateDeck,placementIssue} from "../src/engine/game";
import {placementDestinations,tacticalPreview} from "../src/ui/tactical-preview";
import {PreviewCache} from "./preview-cache";
import {readRecent,saveRecent} from "./presentation";
import {resolutionBatch,resolutionCapture,visiblePosition,type AcceptedResolution,type ResolutionBatch} from "../src/ui/resolution-presentation";
import {chooseComputerAction,computerMulligan} from "../src/engine/ai";
import {powerTable} from "../src/engine/evaluation";
import {scoreGame} from "../src/engine/scoring";
import {newRecord,appendRecord,replayAt,validateRecord,type MatchRecord} from "../src/replay/record";
import {publicEventText,presentationFrames} from "../src/ui/readability";
import {libraryOf} from "../src/content/validation";
import {transaction,type DB} from "./db";
import {activeContent,contentVersion} from "./catalog";
import {validateOwnedDeck,deckUsesSandbox} from "./inventory";
import {captureMatchShop,decorateMatch,deckFormat} from "./shop-formats";
import {getDeck} from "./player-routes";
import {uuid,operationKey,type Authentication} from "./auth";
import {digest,keyed,rateLimit} from "./security";
import {reject} from "./errors";
import type {BackendConfig} from "./config";
import {enrollEconomyMatch,settleMatchReward} from "./economy";
const actionInput=z.discriminatedUnion("type",[
  z.object({type:z.literal("play"),card:z.string().min(1).max(80),row:z.number().int().min(0).max(19),col:z.number().int().min(0).max(19)}).strict(),
  z.object({type:z.literal("mulligan"),cards:z.array(z.string().max(80)).max(5)}).strict(),
  z.object({type:z.literal("pass")}).strict(),z.object({type:z.literal("surrender")}).strict(),
]);
// Never return GameState/MatchRecord, seed/RNG, hidden instance IDs, raw events,
// activation/history blobs, private decks or full-state signatures to a player.
export function publicMatch(row:any,pack:ContentPack,state:GameState=row.state,includeContent=true){
  const library=libraryOf(pack),powers=powerTable(state,library),score=scoreGame(state,library);
  const opponent=pack.decks.find(deck=>deck.cards.length===row.decks[1].length&&deck.cards.every((id,index)=>id===row.decks[1][index]));
  const card=(id:string)=>({id,owner:state.cards[id].owner,definitionId:state.cards[id].definitionId,name:library[state.cards[id].definitionId].name,number:library[state.cards[id].definitionId].collectible?.number??"",placementType:library[state.cards[id].definitionId].type,rank:library[state.cards[id].definitionId].rank,printedPower:library[state.cards[id].definitionId].power,power:powers[id]?.effective??library[state.cards[id].definitionId].power,text:library[state.cards[id].definitionId].text,layers:{permanent:state.cards[id].modifier,aura:powers[id]?.auras.reduce((n,a)=>n+a.amount,0)??0,dynamic:powers[id]?.dynamic??0},protections:powers[id]?[...powers[id].permanentProtections,...powers[id].continuousProtections.map(p=>p.protection)]:[]});
  return {id:row.id,revision:row.revision,status:state.phase,contentVersion:row.version_id,engineVersion:row.engine_version,createdAt:row.created_at,completedAt:row.completed_at,
    ...(includeContent?{content:pack}:{}),opponent:{type:"computer",name:opponent?.name??"Computer opponent",kindred:opponent?.collection??"mixed"},configuration:state.config,active:state.active,turn:state.turn,testingAccess:row.testing_access,cosmetics:row.cosmetics??{},personalCosmetics:row.personalCosmetics??{},rarities:row.rarities??{},
    board:visiblePosition(state,library).board,
    hand:state.players[0].hand.map(card),players:state.players.map(p=>({handCount:p.hand.length,drawCount:p.draw.length,graveyard:p.graveyard.map(card),exile:p.exile.map(card),mulliganDone:p.mulliganDone})),
    legalActions:state.phase==="playing"&&state.active===0?legalPlays(state,library,0).map(a=>a.type==="play"?{type:a.type,card:a.card,row:a.row,col:a.col}:null):[],
    score:{totals:score.totals,rows:score.rows,columns:score.columns,creatures:score.creatures,bonuses:score.breakdown?.bonuses??[0,0]},
    log:state.events.slice(-50).map(e=>({turn:e.turn,type:e.type,text:publicEventText(e)})),result:state.result};
}
export function matchRoutes(app:FastifyInstance,pool:DB,auth:Authentication,serverConfig:BackendConfig){
  const previews=new PreviewCache();
  const opponents=(pack:ContentPack,config:GameState["config"])=>pack.decks.filter(deck=>validateDeck(deck.cards,libraryOf(pack),config).length===0);
  async function own(db:any,id:string,playerId:string,lock=false){const {rows:[r]}=await db.query(`SELECT * FROM kd.match WHERE id=$1 AND player_id=$2 ${lock?"FOR UPDATE":""}`,[id,playerId]);if(!r)reject(404,"match_missing","Match was not found.");return decorateMatch(db,r);}
  async function complete(c:any,row:any,state:GameState){if(state.phase!=="finished")return;
    await settleMatchReward(c,row.id,serverConfig);
    if(row.testing_access)return;
    const kinds=[...new Set((row.decks[0] as string[]).map(id=>row.record.library[id].kindred))];
    await c.query("INSERT INTO kd.match_completion(match_id,player_id,scoring,kindreds,outcome) VALUES($1,$2,$3,$4,$5) ON CONFLICT(match_id) DO NOTHING",[row.id,row.player_id,state.config.scoring,JSON.stringify(kinds),state.result!.winner===0?"win":state.result!.winner===null?"draw":"loss"]);
  }
  app.get("/api/match-options",async req=>{
    const actor=await auth.actor(req),query=z.object({deckId:uuid}).strict().parse(req.query),deck=await getDeck(pool,query.deckId,actor.id),pack=await activeContent(pool);
    if(deck.draft||deck.testingAccess)reject(400,"deck_not_ready","Choose a legal ordinary playing deck.");
    await validateOwnedDeck(pool,actor,deck.cards,pack,deck.config);
    const eligibility=await deckFormat(pool,deck.cards,pack,deck.config,deck.formatId);if(eligibility.errors.length)reject(400,"deck_format_ineligible",eligibility.errors.join(" "));
    return {deckRevision:deck.revision,contentVersion:pack.id,configuration:deck.config,opponents:opponents(pack,deck.config).map(deck=>({id:deck.id,name:deck.name,kindred:deck.collection,count:deck.cards.length}))};
  });
  app.post("/api/matches",async req=>{
    const actor=await auth.actor(req),b=z.object({deckId:uuid,scoring:z.enum(["classic","domination"]).optional(),opponentDeckId:z.string().min(1).max(100).optional(),deckRevision:z.number().int().positive().optional()}).strict().parse(req.body);
    return transaction(pool,async c=>{
      await c.query("SELECT id FROM kd.player WHERE id=$1 FOR UPDATE",[actor.id]);
      const deck=await getDeck(c,b.deckId,actor.id),pack=await activeContent(c),library=libraryOf(pack),config={...deck.config,...(b.scoring?{scoring:b.scoring}:{})};
      if(b.deckRevision!==undefined&&b.deckRevision!==deck.revision)reject(409,"stale_deck","Your battle deck changed. Review the updated match settings before starting.");
      if(deck.draft)reject(400,"draft_deck","Finish and save a legal playing deck before entering a match.");
      await validateOwnedDeck(c,actor,deck.cards,pack,config,deck.testingAccess);
      // Test-only acquisition lots cannot bootstrap ordinary reward progression.
      // Freeze this classification with the match, independent of later trades.
      const sandboxAccount=(await c.query("SELECT sandbox FROM kd.economy_account WHERE player_id=$1",[actor.id])).rows[0]?.sandbox;
      const testingAccess=deck.testingAccess||!!sandboxAccount||await deckUsesSandbox(c,actor.id,deck.cards,pack);
      const candidates=opponents(pack,config);
      if(!candidates.length)reject(400,"opponent_deck_unavailable","No computer deck is legal under this selected configuration.");
      const selected=b.opponentDeckId?candidates.find(deck=>deck.id===b.opponentDeckId):null;
      if(b.opponentDeckId&&!selected)reject(400,"opponent_deck_unavailable","Choose a published computer formation allowed by this deck's rules.");
      const seed=crypto.randomBytes(4).readUInt32LE(),startingPlayer=crypto.randomInt(2) as 0|1,opponent=selected??candidates[crypto.randomInt(candidates.length)];
      const decks:[string[],string[]]=[deck.cards,opponent.cards];let state=createMatch(decks,library,config,seed,startingPlayer),record=newRecord(state,library,decks,pack.id,"Server-authoritative computer match");
      const ai:Action={type:"mulligan",player:1,cards:computerMulligan(state,library,1)};state=act(state,ai,library);record=appendRecord(record,ai,state);
      const id=crypto.randomUUID(),{rows:[row]}=await c.query("INSERT INTO kd.match(id,player_id,opponent_type,version_id,engine_version,config,decks,seed,starting_player,state,record,status,testing_access) VALUES($1,$2,'computer',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",[id,actor.id,pack.id,record.engineVersion,config,JSON.stringify(decks),seed,startingPlayer,state,record,state.phase,testingAccess]);
      await c.query("INSERT INTO kd.match_action(match_id,sequence,request_id,action,signature) VALUES($1,1,'server-initial-mulligan',$2,$3)",[id,ai,record.actions[0].signature]);await captureMatchShop(c,id,actor.id,deck.cards,pack,config,deck.formatId,deck.testingAccess);await enrollEconomyMatch(c,id,serverConfig);if(!deck.testingAccess)await c.query("UPDATE kd.player SET default_deck_id=$2 WHERE id=$1",[actor.id,deck.id]);return publicMatch(await decorateMatch(c,row),pack);
    });
  });
  app.get("/api/matches",async req=>{const a=await auth.actor(req),{rows}=await pool.query("SELECT id,status,version_id,engine_version,config,revision,result,testing_access,created_at,completed_at FROM kd.match WHERE player_id=$1 ORDER BY created_at DESC LIMIT 200",[a.id]);return {matches:rows};});
  app.get<{Params:{id:string}}>("/api/matches/:id",async req=>{const a=await auth.actor(req),row=await own(pool,uuid.parse(req.params.id),a.id);return {...publicMatch(row,await contentVersion(pool,row.version_id)),rewardSummary:(await pool.query("SELECT status,reason,evidence FROM kd.match_reward WHERE match_id=$1 AND player_id=$2",[row.id,a.id])).rows[0]??null};});
  app.get<{Params:{id:string}}>("/api/matches/:id/recent-presentation",async req=>{
    const a=await auth.actor(req),query=z.object({revision:z.coerce.number().int().min(0).optional()}).strict().parse(req.query);
    return readRecent(pool,uuid.parse(req.params.id),a.id,query.revision);
  });
  app.post<{Params:{id:string}}>("/api/matches/:id/placement-options",async req=>{
    const a=await auth.actor(req),b=z.object({revision:z.number().int().min(0),card:z.string().min(1).max(80)}).strict().parse(req.body);
    await rateLimit(pool,"placement-preview:"+keyed(a.id,serverConfig),120,60);
    const row=await own(pool,uuid.parse(req.params.id),a.id);if(row.revision!==b.revision)reject(409,"stale_match","Match changed. Reload before previewing.");
    if(row.state.phase!=="playing"||row.state.active!==0||!row.state.players[0].hand.includes(b.card))reject(400,"illegal_action","Choose a card from your hand on your placement turn.");
    const key=`${a.id}:${row.id}:${row.revision}:${b.card}:options`,cached=previews.get(key);if(cached)return cached;
    const pack=await contentVersion(pool,row.version_id);return previews.put(key,{matchId:row.id,revision:row.revision,card:b.card,destinations:placementDestinations(row.state,libraryOf(pack),0,b.card)});
  });
  app.post<{Params:{id:string}}>("/api/matches/:id/preview",async req=>{
    const a=await auth.actor(req),b=z.object({revision:z.number().int().min(0),action:actionInput}).strict().parse(req.body),row=await own(pool,uuid.parse(req.params.id),a.id);
    await rateLimit(pool,"placement-preview:"+keyed(a.id,serverConfig),120,60);
    if(row.revision!==b.revision)reject(409,"stale_match","Match changed. Reload before previewing.");
    if(b.action.type!=="play")reject(400,"preview_play_only","Select a legal placement for a preview.");
    const key=`${a.id}:${row.id}:${row.revision}:${JSON.stringify(b.action)}`,cached=previews.get(key);if(cached)return cached;
    const pack=await contentVersion(pool,row.version_id),library=libraryOf(pack),issue=placementIssue(row.state,library,0,b.action.card,b.action.row,b.action.col);if(issue)reject(400,"illegal_action",issue.message);
    const p=tacticalPreview(row.state,library,0,b.action.card,b.action.row,b.action.col);
    if(p.fault)reject(400,"illegal_action","This action cannot resolve safely.");return previews.put(key,{...p,matchId:row.id,revision:row.revision});
  });
  app.post<{Params:{id:string}}>("/api/matches/:id/actions",async req=>{
    const actor=await auth.actor(req),id=uuid.parse(req.params.id),b=z.object({revision:z.number().int().min(0),requestId:operationKey,action:actionInput}).strict().parse(req.body);
    return transaction(pool,async c=>{
      const row=await own(c,id,actor.id,true),{rows:[prior]}=await c.query("SELECT 1 FROM kd.match_request WHERE match_id=$1 AND request_id=$2",[id,b.requestId]);
      if(prior)reject(409,"duplicate_action","This action request was already committed.");if(row.revision!==b.revision)reject(409,"stale_match","Match changed in another session. Reload before acting.");
      if(row.status==="finished")reject(409,"match_finished","The match is already complete.");
      const pack=await contentVersion(c,row.version_id),library=libraryOf(pack);let state:GameState=row.state,record:MatchRecord=row.record;
      const before=state,steps:DiagnosticStep[]=[],resolutions:AcceptedResolution[]=[];let presentationTruncated=false;
      const apply=async(action:Action)=>{
        const previous=state,capture=resolutionCapture(state);
        let next:GameState;try{next=act(state,action,library,capture.observer);}catch{reject(400,"illegal_action","The submitted action is not legal for this match state.");}
        if(next.fault)reject(422,"resolution_fault","The action was rolled back because resolution could not complete safely.");
        state=next;record=appendRecord(record,action,next);
        steps.push(...capture.steps);presentationTruncated||=capture.truncated;resolutions.push({action,sequence:record.actions.length,before:previous,after:next,steps:capture.steps});
        await c.query("INSERT INTO kd.match_action(match_id,sequence,request_id,action,signature) VALUES($1,$2,$3,$4,$5)",[id,record.actions.length,b.requestId,action,record.actions.at(-1)!.signature]);
      };
      await apply({...b.action,player:0});
      for(let i=0;state.phase==="playing"&&state.active===1;i++){if(i>=10)reject(422,"computer_limit","Computer resolution exceeded its bound; the request was rolled back.");await apply(chooseComputerAction(state,library));}
      const revision=row.revision+1;const {rows:[updated]}=await c.query("UPDATE kd.match SET state=$3,record=$4,revision=$5,status=$6,result=$7,completed_at=CASE WHEN $6='finished' THEN now() ELSE NULL END WHERE id=$1 AND player_id=$2 RETURNING completed_at",[id,actor.id,state,record,revision,state.phase,state.result]);row.completed_at=updated.completed_at;
      await c.query("INSERT INTO kd.match_request(match_id,request_id,fingerprint,revision) VALUES($1,$2,$3,$4)",[id,b.requestId,digest(b.action),revision]);
      row.record=record;await complete(c,row,state);
      const view=publicMatch({...row,state,revision},pack);
      const frames=presentationFrames(before,state,steps,library).filter(f=>f.changes.length).map(f=>{const view=publicMatch({...row,state:f.state,revision},pack,f.state,false);return {caption:f.caption,changes:f.changes,board:view.board,score:view.score};});
      let resolution:ResolutionBatch;try{resolution=resolutionBatch(id,row.revision,revision,resolutions,library,presentationTruncated);}catch{resolution={schema:1,id:`${id}:${revision}`,matchId:id,fromRevision:row.revision,toRevision:revision,events:[],truncated:true};}
      const recentPresentation=await saveRecent(c,id,revision,resolution,resolutions);
      return {...view,presentation:frames,resolution,recentPresentation,rewardSummary:(await c.query("SELECT status,reason,evidence FROM kd.match_reward WHERE match_id=$1 AND player_id=$2",[id,actor.id])).rows[0]??null};
    });
  });
  app.get<{Params:{id:string}}>("/api/matches/:id/replay",async req=>{
    const a=await auth.actor(req),row=await own(pool,uuid.parse(req.params.id),a.id),pack=await contentVersion(pool,row.version_id);validateRecord(row.record);
    const frames=[];for(let i=0;i<=row.record.actions.length;i++){const {state}=replayAt(row.record,i);frames.push({index:i,actor:i?row.record.actions[i-1].action.player:null,action:i?row.record.actions[i-1].action.type:"initial",view:publicMatch(row,pack,state,false)});}
    return {id:row.id,content:pack,engineVersion:row.engine_version,verified:true,frames};
  });
  app.get<{Params:{id:string}}>("/api/developer/matches/:id/diagnostics",async req=>{const a=await auth.actor(req,["developer","administrator"]),row=await own(pool,uuid.parse(req.params.id),a.id);await pool.query("INSERT INTO kd.audit_event(actor_id,operation,target_id) VALUES($1,'private-match-diagnostics',$2)",[a.id,row.id]);return {record:row.record,warning:"Private developer record includes both hands and the seed. Do not share as an ordinary player replay."};});
}
