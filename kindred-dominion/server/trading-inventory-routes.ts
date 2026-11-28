import {inventoryBreakdown,playerTradeReason} from "./trading-presentation";
import {z} from "zod";
import type {FastifyInstance} from "fastify";
import type {DB} from "./db";
import {transaction} from "./db";
import type {Authentication} from "./auth";
import type {BackendConfig} from "./config";
import {activeContent} from "./catalog";
import {selectedConfiguration} from "./configuration";
import {shopSchema} from "./shop-rules";
import {tradingPolicy,tradingEligibility,releaseExpiredReservations,tradeableLots} from "./trading-inventory";
export function tradingInventoryRoutes(app:FastifyInstance,pool:DB,config:BackendConfig,auth:Authentication){
 app.get("/api/trading/inventory",async req=>{const actor=await auth.actor(req),query=z.object({page:z.coerce.number().int().min(0).max(10000).default(0),q:z.string().max(80).default("")}).strict().parse(req.query);return transaction(pool,async c=>{const policy=await tradingPolicy(c,config,false);await releaseExpiredReservations(c,actor.id);const eligibility=await tradingEligibility(c,actor.id,policy.rules),pack=await activeContent(c),lots=await tradeableLots(c,actor.id,policy.rules),shop=await selectedConfiguration(c,"shop"),rarities=shop?shopSchema.parse(shop.document).rarities:{},search=query.q.toLowerCase(),quantities=new Map<string,number>((await c.query("SELECT e.card_id,sum(i.quantity)::int quantity FROM kd.inventory i JOIN kd.edition e ON e.id=i.edition_id WHERE i.player_id=$1 GROUP BY e.card_id",[actor.id])).rows.map(r=>[r.card_id,r.quantity])),exactReserved=new Set<string>((await c.query("SELECT x.current_lot FROM kd.limited_component x JOIN kd.limited_hold h ON h.instance_id=x.instance_id WHERE h.owner_id=$1 AND h.released_at IS NULL AND h.expires_at>now() AND x.current_lot IS NOT NULL",[actor.id])).rows.map(r=>r.current_lot)),cards=pack.cards.filter(card=>(quantities.get(card.id)??0)>0&&(card.id+" "+card.name).toLowerCase().includes(search)).map(card=>{const owned=lots.filter(l=>l.card_id===card.id);return {cardId:card.id,name:card.name,kindred:card.kindred,rarity:rarities[card.id]??"unassigned",owned:quantities.get(card.id)??0,...inventoryBreakdown(owned,quantities.get(card.id)??0,eligibility.eligible&&!!policy.id&&policy.rules.enabled,exactReserved),tradeable:owned.reduce((n,l)=>n+l.available,0),explanations:[...new Set([...owned.flatMap(l=>l.issues.map(playerTradeReason)),...eligibility.reasons])],reasons:[...new Set(owned.flatMap(l=>l.issues))]};});return {enabled:!!policy.id&&policy.rules.enabled,configVersion:policy.id,eligibility,requirements:{minimumAgeHours:policy.rules.minimumAgeHours,minimumLevel:policy.rules.minimumLevel,minimumMatches:policy.rules.minimumMatches},cards:cards.slice(query.page*20,query.page*20+20),page:query.page,hasMore:cards.length>(query.page+1)*20};});});
}
