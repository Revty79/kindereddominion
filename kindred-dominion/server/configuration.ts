import crypto from "node:crypto";
import {z} from "zod";
import type {FastifyInstance} from "fastify";
import type {Authentication} from "./auth";
import type {BackendConfig} from "./config";
import {transaction,type DB} from "./db";
import type {Client} from "./economy-assets";
import {DEFAULT_ECONOMY,economySchema} from "./economy-rules";
import {economyDigest} from "./economy-hash";
import {reject} from "./errors";
import {rateLimit} from "./security";

export const domains=["economy","shop","trading","commerce","starters","limited"] as const;
export type Domain=typeof domains[number];
export type PublicationHooks={activated?:(c:Client,document:any,id:string,config:BackendConfig,context:unknown)=>Promise<void>;rewardEntitlements?:boolean;validate?:(c:Client,document:any,config:BackendConfig)=>Promise<unknown>;published?:(c:Client,document:any,id:string,config:BackendConfig,context:unknown)=>Promise<void>};
const validators=new Map<Domain,{parse:(v:unknown)=>any;defaults:unknown;hooks?:PublicationHooks}>([["economy",{parse:v=>economySchema.parse(v),defaults:DEFAULT_ECONOMY}]]);
export function registerConfiguration(domain:Domain,parse:(v:unknown)=>any,defaults:unknown,hooks?:PublicationHooks){validators.set(domain,{parse,defaults,hooks});}
export const economyPermitted=(config:BackendConfig)=>config.environment!=="prod"&&config.economyEnabled;
export function requireEconomy(config:BackendConfig){if(!economyPermitted(config))reject(403,"economy_disabled","Economy operations are disabled by this server's environment configuration.");}
export async function selectedConfiguration(db:DB|Client,domain:Domain){const row=(await db.query("SELECT v.*,s.activated_at FROM kd.configuration_selection s JOIN kd.configuration_version v ON v.id=s.version_id AND v.domain=s.domain WHERE s.domain=$1",[domain])).rows[0]??null;if(row&&economyDigest(row.document)!==row.digest)reject(503,"configuration_integrity","Published configuration integrity verification failed.");return row;}
export function configurationRoutes(app:FastifyInstance,pool:DB,config:BackendConfig,auth:Authentication){
  const administrator=async(req:any)=>{const actor=await auth.actor(req,["administrator"]);if(req.method!=="GET")await rateLimit(pool,"admin-write:"+actor.id,60,60);return actor;};
  const getDomain=(req:any)=>z.enum(domains).parse(req.params.domain);
  const validator=(domain:Domain)=>{const value=validators.get(domain);if(!value)reject(404,"configuration_unavailable","This configuration service is not implemented yet.");return value;};
  app.get<{Params:{domain:string}}>("/api/admin/configuration/:domain",async req=>{await administrator(req);const domain=getDomain(req),current=await selectedConfiguration(pool,domain);return {domain,enabled:economyPermitted(config),active:current,proposal:validator(domain).defaults,drafts:(await pool.query("SELECT * FROM kd.configuration_draft WHERE domain=$1 ORDER BY updated_at DESC LIMIT 50",[domain])).rows,history:(await pool.query("SELECT v.id,v.digest,v.reason,v.created_at,p.username AS created_by FROM kd.configuration_version v LEFT JOIN kd.player p ON p.id=v.created_by WHERE v.domain=$1 ORDER BY v.created_at DESC,v.id LIMIT 100",[domain])).rows};});
  app.post<{Params:{domain:string}}>("/api/admin/configuration/:domain/drafts",async req=>{const actor=await administrator(req);requireEconomy(config);const domain=getDomain(req),body=z.object({document:z.unknown()}).strict().parse(req.body),document=validator(domain).parse(body.document),id=crypto.randomUUID();return transaction(pool,async c=>{await c.query("INSERT INTO kd.configuration_draft(id,domain,document,created_by) VALUES($1,$2,$3,$4)",[id,domain,document,actor.id]);await c.query("INSERT INTO kd.audit_event(actor_id,operation,target_id,details) VALUES($1,'configuration-draft-create',$2,$3)",[actor.id,id,{domain}]);return {id,revision:1,document};});});
  app.put<{Params:{domain:string;id:string}}>("/api/admin/configuration/:domain/drafts/:id",async req=>{const actor=await administrator(req);requireEconomy(config);const domain=getDomain(req),id=z.string().uuid().parse(req.params.id),body=z.object({document:z.unknown(),revision:z.number().int().positive()}).strict().parse(req.body),document=validator(domain).parse(body.document);return transaction(pool,async c=>{const result=await c.query("UPDATE kd.configuration_draft SET document=$4,revision=revision+1,published_version=NULL,updated_at=now() WHERE id=$1 AND domain=$2 AND revision=$3 RETURNING revision",[id,domain,body.revision,document]);if(!result.rowCount)reject(409,"stale_configuration","Draft changed or was removed. Reload it before saving.");await c.query("INSERT INTO kd.audit_event(actor_id,operation,target_id,details) VALUES($1,'configuration-draft-update',$2,$3)",[actor.id,id,{domain,revision:result.rows[0].revision}]);return {id,document,revision:result.rows[0].revision};});});
  const publishInput=z.object({revision:z.number().int().positive(),expectedActiveId:z.string().uuid().nullable(),reason:z.string().trim().min(5).max(160)}).strict();
  app.post<{Params:{domain:string;id:string}}>("/api/admin/configuration/:domain/drafts/:id/publish",async req=>{const actor=await administrator(req);requireEconomy(config);const domain=getDomain(req),id=z.string().uuid().parse(req.params.id),body=publishInput.parse(req.body);return transaction(pool,async c=>{
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))",["kindred-configuration:"+domain]);
    const draft=(await c.query("SELECT * FROM kd.configuration_draft WHERE id=$1 AND domain=$2 FOR UPDATE",[id,domain])).rows[0];if(!draft||draft.revision!==body.revision)reject(409,"stale_configuration","Draft changed. Reload before publishing.");
    if(draft.published_version)return {id:draft.published_version,replayed:true};
    const current=await selectedConfiguration(c,domain);if((current?.id??null)!==body.expectedActiveId)reject(409,"stale_publication","The active configuration changed. Review it before publication.");
    const document=validator(domain).parse(draft.document);
    if(domain==="economy"){
      const bundles=[...[...document.accountLevels,...document.masteryLevels,...document.objectives.filter((o:any)=>o.enabled)].map((x:any)=>x.reward),...Object.values(document.bundles)] as any[];
      if(bundles.some((b:any)=>b.entitlements.length)&&!validator(domain).hooks?.rewardEntitlements)reject(400,"reward_type_inactive","Booster/cosmetic/title reward activation requires its verified ownership service.");
      const published=(await c.query("SELECT c.id,c.kindred FROM kd.card_identity c JOIN kd.card_revision r ON r.card_id=c.id JOIN kd.content_selection s ON s.version_id=r.version_id WHERE NOT c.retired")).rows;
      const masteryTargets=[...document.objectives.filter((o:any)=>o.enabled&&o.reward.mastery).map((o:any)=>o.kindred),...document.promotions.filter((p:any)=>p.enabled&&document.bundles[p.bundleId].mastery).map((p:any)=>p.kindred)];
      if(masteryTargets.some((kindred:string)=>!published.some((card:any)=>card.kindred===kindred)))reject(400,"mastery_kindred_unavailable","Mastery rewards require an explicitly published Kindred.");
      if(bundles.some((b:any)=>b.cards.some((card:any)=>card.cardId&&!published.some((p:any)=>p.id===card.cardId))))reject(400,"reward_card_unavailable","Rewards must reference published permanent card identities.");
      if(bundles.some((b:any)=>b.cards.some((card:any)=>card.kindred&&!published.some((p:any)=>p.kindred===card.kindred))))reject(400,"reward_kindred_unavailable","Rewards must use a currently published Kindred.");
    }
    const context=await validator(domain).hooks?.validate?.(c,document,config);
    const version=crypto.randomUUID();await c.query("INSERT INTO kd.configuration_version(id,domain,document,digest,created_by,reason) VALUES($1,$2,$3,$4,$5,$6)",[version,domain,document,economyDigest(document),actor.id,body.reason]);
    await validator(domain).hooks?.published?.(c,document,version,config,context);await validator(domain).hooks?.activated?.(c,document,version,config,context);
    await c.query("INSERT INTO kd.configuration_selection(domain,version_id) VALUES($1,$2) ON CONFLICT(domain) DO UPDATE SET version_id=EXCLUDED.version_id,activated_at=now()",[domain,version]);
    await c.query("UPDATE kd.configuration_draft SET published_version=$2 WHERE id=$1",[id,version]);
    await c.query("INSERT INTO kd.configuration_publication(domain,version_id,previous_id,actor_id,reason,operation) VALUES($1,$2,$3,$4,$5,'publish')",[domain,version,current?.id??null,actor.id,body.reason]);
    await c.query("INSERT INTO kd.audit_event(actor_id,operation,target_id,details) VALUES($1,'configuration-publish',$2,$3)",[actor.id,version,{domain,previous:current?.id??null,reason:body.reason}]);return {id:version,replayed:false};
  });});
  app.post<{Params:{domain:string}}>("/api/admin/configuration/:domain/rollback",async req=>{const actor=await administrator(req);requireEconomy(config);const domain=getDomain(req),body=z.object({versionId:z.string().uuid(),expectedActiveId:z.string().uuid(),reason:z.string().trim().min(5).max(160)}).strict().parse(req.body);return transaction(pool,async c=>{await c.query("SELECT pg_advisory_xact_lock(hashtext($1))",["kindred-configuration:"+domain]);const current=await selectedConfiguration(c,domain),version=(await c.query("SELECT * FROM kd.configuration_version WHERE id=$1 AND domain=$2",[body.versionId,domain])).rows[0];if(!version)reject(404,"version_missing","Published configuration was not found.");if(current?.id!==body.expectedActiveId)reject(409,"stale_publication","Active configuration changed.");if(economyDigest(version.document)!==version.digest)reject(503,"configuration_integrity","Historical configuration integrity verification failed.");validator(domain).parse(version.document);const context=await validator(domain).hooks?.validate?.(c,version.document,config);await validator(domain).hooks?.activated?.(c,version.document,version.id,config,context);await c.query("UPDATE kd.configuration_selection SET version_id=$2,activated_at=now() WHERE domain=$1",[domain,version.id]);await c.query("INSERT INTO kd.configuration_publication(domain,version_id,previous_id,actor_id,reason,operation) VALUES($1,$2,$3,$4,$5,'rollback')",[domain,version.id,current.id,actor.id,body.reason]);await c.query("INSERT INTO kd.audit_event(actor_id,operation,target_id,details) VALUES($1,'configuration-rollback',$2,$3)",[actor.id,version.id,{domain,previous:current.id,reason:body.reason}]);return {id:version.id};});});
}
