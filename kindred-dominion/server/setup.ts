import {z,ZodError} from "zod";
import type {FastifyInstance} from "fastify";
import type {Authentication} from "./auth";
import type {BackendConfig} from "./config";
import type {DB} from "./db";
import {readiness} from "./db";
import {migrationStatus} from "./migrations";
import {configurationValidator,selectedConfiguration,validateConfiguration,domains,economyPermitted,requireEconomy,type Domain} from "./configuration";
import {ApiError,reject} from "./errors";
import {rateLimit} from "./security";
import {activeContent} from "./catalog";
import {ownerContent} from "../src/content/owner";
import {starterRecipeDigest} from "./starters";
import {setupDependencies,setupDomains,setupLabels,setupOrder,setupIssue} from "./setup-rules";

export async function previewConfiguration(pool:DB,config:BackendConfig,domain:Domain,raw:unknown){
 const c=await pool.connect();let recipeDigest:string|null=null;
 try{
  await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  // Existing hooks may provision immutable identities/recipes while checking.
  // Always roll them back, including a successful preview.
  const document=configurationValidator(domain).parse(raw);
  recipeDigest=domain==="starters"?starterRecipeDigest(document):null;
  await validateConfiguration(c,domain,document,config);
  return {valid:true,issues:[] as ReturnType<typeof setupIssue>[],recipeDigest};
 }catch(e){
  if(e instanceof ApiError)return {valid:false,issues:[setupIssue(e.code,e.message,domain)],recipeDigest};
  if(e instanceof ZodError)return {valid:false,issues:[setupIssue("invalid_input","The proposed document has missing, invalid or unsupported fields. Correct it before publication.",domain)],recipeDigest:null};
  throw e;
 }finally{try{await c.query("ROLLBACK");}finally{c.release();}}
}
type Status="complete"|"incomplete"|"disabled"|"blocked"|"optional";
type Item={id:string;label:string;status:Status;message:string;target:string;optional:boolean};
export async function setupReadiness(pool:DB,config:BackendConfig){
 const items:Item[]=[],add=(id:string,label:string,status:Status,message:string,target=id)=>items.push({id,label,status,message,target,optional:["limited","commerce","cosmetics","stripe"].includes(id)});
 let migration:{applied:number;pending:number;valid:boolean}={applied:0,pending:0,valid:false};
 try{const s=await migrationStatus(pool,config);migration={applied:s.applied,pending:s.pending.length,valid:!s.pending.length};}catch{/* No target identity, paths or private diagnostics in the interface. */}
 add("database","Database and migrations",migration.valid?"complete":"blocked",migration.valid?`${migration.applied} committed migrations verified; database environment guard matches.`:"Database identity, migration checksums or pending migrations require the trusted operator. Use kindred-status and the documented backup/update process.","overview");
 const base={environment:config.environment,environmentLabel:config.environment==="integration"?"Isolated DEV test instance":config.environment==="dev"?"Local DEV":config.environment==="test"?"Hosted TEST":"PRODUCTION — activation restricted",economyAllowed:economyPermitted(config),commerceMode:config.commerceMode,livePaymentsEnabled:false,hostedDeploymentPerformed:false,migration,items};
 if(!migration.valid){for(const [id,label] of [["content","Published founding content"],["administrator","Administrator account"],...setupDomains.map(d=>[d,setupLabels[d]]),["currencies","Currency configuration"],["objectives","Challenges and achievements"],["cosmetics","Cosmetic products"],["stripe","Stripe sandbox configuration"],["application","Application and server"]])add(id,label,"blocked","Resolve the trusted operator database/migration check before inspecting dependent readiness.","overview");return {...base,domains:[],plan:{order:[],cycle:[],notice:null},next:null};}
 let contentReady=false;
 try{const pack=await activeContent(pool),expected=ownerContent().cards;contentReady=expected.every(card=>pack.cards.some(c=>c.id===card.id&&c.collectible?.number===card.collectible?.number));add("content","Published founding content",contentReady?"complete":"blocked",contentReady?"All 150 permanent founding identities are present in selected executable content.":"The selected content is missing required founding identities. Use the approved content publishing pipeline.","content");}catch{add("content","Published founding content","blocked","No verified executable content is selected. Seed/import approved repository content through the trusted operator.","content");}
 const admins=Number((await pool.query("SELECT count(*) n FROM kd.player WHERE role='administrator' AND status='active'")).rows[0].n);
 add("administrator","Administrator account",admins?"complete":"blocked",admins?"A trusted active administrator is present. Account promotion remains operator-only.":"Create/promote the initial account with the trusted operator CLI; no web provisioning is available.","players");
 const states=new Map<Domain,any>(),documents:Record<string,any>={};
 for(const domain of setupDomains){const active=await selectedConfiguration(pool,domain);states.set(domain,active);documents[domain]=active?.document??configurationValidator(domain).defaults;}
 const activeIds=new Set([...states].filter(([,v])=>!!v).map(([d])=>d));
 const draftRows=(await pool.query("SELECT id,domain,revision,document->>'label' AS label,published_version,updated_at FROM kd.configuration_draft ORDER BY updated_at DESC,id LIMIT 200")).rows;
 const details=[];
 for(const domain of setupDomains){
  const active=states.get(domain),document=documents[domain],dependencies=setupDependencies(domain,document).map(e=>({...e,ready:e.target==="content"?contentReady:activeIds.has(e.target)})),missing=dependencies.filter(e=>!e.ready);
  const preview=active?await previewConfiguration(pool,config,domain,document):null;
  const enabled=domain==="starters"?document.newPlayersEnabled||document.backfillEnabled:domain==="limited"?document.editions.some((e:any)=>e.enabled&&e.status==="published"):!!document.enabled;
  let status:Status=!economyPermitted(config)?"disabled":missing.length||preview&&!preview.valid?"blocked":!active?"incomplete":enabled?"complete":"disabled";
  if(economyPermitted(config)&&!missing.length&&preview?.valid&&domain==="limited"&&active&&!document.editions.length)status="optional";
  if(economyPermitted(config)&&!missing.length&&preview?.valid&&domain==="commerce"&&active&&!enabled)status="optional";
  const message=!economyPermitted(config)?"Configuration changes are disabled by the server environment.":missing.length?missing.map(e=>e.reason).join(" "):preview&&!preview.valid?preview.issues.map(e=>e.message).join(" "):!active?"No version published. Review a provisional template or resume a private draft.":enabled?"Published configuration recognized; no republication is required.":domain==="limited"?"Infrastructure is ready; actual limited releases remain optional and owner-approved.":domain==="commerce"?"Sandbox commerce is optional and disabled. This does not block ordinary play.":"A published version is intentionally paused. Enable it only after reviewing its settings.";
  add(domain,setupLabels[domain],status,message);
  details.push({domain,label:setupLabels[domain],status,activeId:active?.id??null,activatedAt:active?.activated_at??null,dependencies,issues:preview?.issues??[],drafts:draftRows.filter(d=>d.domain===domain),recipeDigest:domain==="starters"?starterRecipeDigest(document):null,ownerApprovalRecorded:domain==="starters"?document.hostedApproval?.digest===starterRecipeDigest(document):null});
 }
 const economy=states.get("economy")?.document,shop=states.get("shop")?.document;
 add("currencies","Currency configuration",!economy?"incomplete":economy.currencies.some((c:any)=>c.active)?"complete":"disabled",economy?"Currency definitions are part of the published economy; balances and ledgers are preserved.":"Review currencies in Economy before enabling dependent products.","economy");
 add("objectives","Challenges and achievements",!economy?"incomplete":economy.enabled&&economy.objectives.some((o:any)=>o.enabled)?"complete":"disabled","Challenges and achievements share the economy publication and its reward dependencies.","economy");
 add("cosmetics","Cosmetic products",!shop?"incomplete":shop.cosmetics.some((c:any)=>c.enabled&&c.status==="published")?"complete":"optional","Publish approved artwork and supported cosmetic identities before dependent shop products. Optional cosmetics do not block ordinary play.","shop");
 const configured=!!config.stripe.secretKey&&!!config.stripe.accountId&&!!config.stripe.webhookSecret;
 add("stripe","Stripe sandbox configuration",config.commerceMode==="disabled"?"disabled":config.commerceMode==="simulation"?"optional":configured?"complete":"blocked",config.commerceMode==="disabled"?"Commerce mode is disabled. Keep credentials in the ignored server environment file; no secret values are exposed here.":config.commerceMode==="simulation"?"Provider simulation only; this is not genuine Stripe verification.":configured?"Required sandbox settings are present. Genuine connection, webhook and payment acceptance remain separate operator checks.":"Sandbox activation requires private test credentials, the expected account and webhook signing configuration.","commerce");
 let serverReady=false;try{await readiness(pool,config);serverReady=true;}catch{}
 add("application","Application and server",serverReady&&contentReady?"complete":"blocked","This checks local backend/database readiness. Hosted deployment, TLS, external reachability and genuine payment verification remain operator acceptance.","overview");
 const plan=setupOrder(documents,activeIds);
 return {...base,domains:details,plan,next:plan.order.find(d=>!states.get(d))??null};
}
export function setupRoutes(app:FastifyInstance,pool:DB,config:BackendConfig,auth:Authentication){
 app.get("/api/admin/setup",async req=>{await auth.actor(req,["administrator"]);return setupReadiness(pool,config);});
 app.post<{Params:{domain:string}}>("/api/admin/setup/:domain/validate",async req=>{
  const actor=await auth.actor(req,["administrator"]);requireEconomy(config);await rateLimit(pool,"admin-write:"+actor.id,60,60);
  const domain=z.enum(domains).parse(req.params.domain),body=z.object({id:z.string().uuid(),revision:z.number().int().positive(),expectedActiveId:z.string().uuid().nullable()}).strict().parse(req.body);
  const draft=(await pool.query("SELECT document,revision FROM kd.configuration_draft WHERE id=$1 AND domain=$2",[body.id,domain])).rows[0];if(!draft||draft.revision!==body.revision)reject(409,"stale_configuration","The saved draft changed. Reload it before previewing.");
  const active=await selectedConfiguration(pool,domain);if((active?.id??null)!==body.expectedActiveId)reject(409,"stale_publication","The active configuration changed. Reload and review it before previewing.");
  const changedFields=Object.keys(draft.document).filter(key=>JSON.stringify(draft.document[key])!==JSON.stringify(active?.document[key]));
  const result=await previewConfiguration(pool,config,domain,draft.document),dependencies=setupDependencies(domain,draft.document);
  // The guide also orders runtime prerequisites (for example Trading's
  // economy account service). Existing independent manual controls retain
  // their original publication rules; the guide never weakens those rules.
  for(const edge of dependencies)if(edge.target!=="content"&&!await selectedConfiguration(pool,edge.target)&&!result.issues.some(i=>i.target===edge.target))result.issues.push({code:"configuration_dependency_required",message:edge.reason,target:edge.target});
  return {...result,valid:result.valid&&!result.issues.length,id:body.id,revision:body.revision,activeId:active?.id??null,changedFields,dependencies};
 });
}
