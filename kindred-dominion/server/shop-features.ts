import type {Product} from "./shop-rules";
type Audience={sandbox?:boolean;startingKindred?:string|null;level?:number};
export function inWindow(value:{startsAt?:string;endsAt?:string},now:Date){return (!value.startsAt||Date.parse(value.startsAt)<=now.getTime())&&(!value.endsAt||Date.parse(value.endsAt)>now.getTime());}
export function promotionEligible(eligibility:NonNullable<Product["promotion"]>["eligibility"],audience:Audience){return (!eligibility?.sandboxOnly||!!audience.sandbox)&&(!eligibility?.kindreds?.length||!!audience.startingKindred&&eligibility.kindreds.includes(audience.startingKindred))&&(!eligibility?.minimumLevel||(audience.level??1)>=eligibility.minimumLevel);}
export function promotionAt(product:Product,now:Date,audience:Audience){return product.promotion&&inWindow(product.promotion,now)&&promotionEligible(product.promotion.eligibility,audience)?product.promotion:null;}
export function featuredAt(product:Product,now:Date){return product.feature?product.feature.enabled&&inWindow(product.feature,now):product.featured||product.category==="offers";}
