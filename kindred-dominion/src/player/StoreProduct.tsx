import {useEffect,useId,useMemo,useRef,useState,type ReactNode,type CSSProperties} from "react";
import type {ContentPack} from "../content/types";
import {libraryOf} from "../content/validation";
import {artworkMap} from "../assets/references";
import CollectibleCard from "../ui/cards/CollectibleCard";
import {CardPresentation} from "../ui/cards/CardPresentation";

export type StoreProduct={id:string;name:string;description:string;type:string;mode:string;currency:string;price:number;available:boolean;reasons:string[];contentsDescription?:string;count?:number;totalCopies?:number;fullCount?:number;eligibleCount?:number;department?:string;category?:string;edition?:string;featured?:boolean;artworkUrl?:string|null;previewCardIds?:string[];rarity?:string|null;originalPrice?:number|null;ownedUnique?:number;ownedCopies?:number;ownedCosmetics?:number;collections?:{id:string;name:string}[];limit?:{period:string;quantity:number;used:number}|null;startsAt?:string|null;endsAt?:string|null;warnings?:string[]};
export function storePrice(price:number,currency:string){return currency==="usd"?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(price/100)+" USD · test amount":`${price.toLocaleString()} ${currency==="gold"?"Gold":currency==="aether"?"Aether":currency}`;}
export function productContents(p:StoreProduct){return p.contentsDescription??(p.type==="aether"?`${p.count?.toLocaleString()} sandbox Aether`:p.type==="booster"?`Randomized · ${p.count} slots · ${p.totalCopies} playable copies`:p.mode==="cosmetic"?`Fixed contents · ${p.count} artwork/cosmetic ${p.count===1?"license":"licenses"}`:`Fixed contents · ${p.count} identities · ${p.totalCopies} playable copies`);}
export function StoreProductArt({product,content}:{product:StoreProduct;content:ContentPack}){
 const [failed,setFailed]=useState(false),library=useMemo(()=>libraryOf(content),[content]),art=useMemo(()=>artworkMap(content),[content]),ids=(product.previewCardIds??[]).filter(id=>library[id]).slice(0,3);
 useEffect(()=>setFailed(false),[product.artworkUrl]);
 return <figure className={`store-product-art store-art-${product.department??product.type}`}>
  {product.artworkUrl&&!failed?<img src={product.artworkUrl} alt={`${product.name} product artwork`} loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:<>
   {ids.length?<CardPresentation value={{}}><div className={`store-card-fan ${ids.length===1?"is-single":""}`} aria-hidden="true">{ids.map((id,i)=><div key={id} style={{"--fan-index":i,"--fan-count":ids.length} as CSSProperties}><CollectibleCard original card={library[id]} library={library} artwork={art[id]} scale="hand"/></div>)}</div></CardPresentation>:<span className="store-art-sigil" aria-hidden="true">{product.type==="aether"?"◈":product.department==="artwork"?"✦":"◇"}</span>}
   <figcaption>{product.department==="cards"?"Published creature preview":"Development packaging preview · official artwork pending"}{failed&&" · Artwork unavailable"}</figcaption>
  </>}
 </figure>;
}
export default function StoreProductCard({product:p,content,busy,pending,onDetails,onReview}:{product:StoreProduct;content:ContentPack;busy:boolean;pending?:boolean;onDetails?:()=>void;onReview:()=>void}){
 const label=useId();return <article className="store-product" aria-labelledby={label} data-product-id={p.id}>
  <StoreProductArt product={p} content={content}/><div className="store-product-body"><div className="store-product-tags"><span>{p.mode==="first_copy"?"First copies":p.mode==="completion"?"Complete my collection":p.mode==="additional"?"Additional copies":p.mode==="cosmetic"?"Cosmetic ownership":p.type==="aether"?"Sandbox currency":"Sandbox product"}</span>{p.edition&&p.edition!=="standard"&&<span>{p.edition}</span>}{p.featured&&<span>Featured</span>}{p.rarity&&<span>{p.rarity}</span>}</div>
  <h2 id={label}>{p.name}</h2><p>{p.description}</p><p className="store-contents">{productContents(p)}</p>
  {!!p.collections?.length&&<p className="store-association">{p.collections.map(c=>c.name).join(" · ")}</p>}
  <p className="store-price">{p.originalPrice&&p.price>0&&<><del>{storePrice(p.originalPrice,p.currency)}</del> </>}<strong>{p.price>0?storePrice(p.price,p.currency):"Currently unavailable"}</strong></p>
  {!!p.originalPrice&&<small>Published discount on these same eligible contents.</small>}
  {p.mode==="cosmetic"?p.ownedCosmetics!==undefined&&<p>Owned: {p.ownedCosmetics} included cosmetics</p>:p.ownedUnique!==undefined&&<p>Owned: {p.ownedUnique} identities · {p.ownedCopies} copies</p>}
  {p.mode==="first_copy"&&<p>{p.eligibleCount} eligible first copies remain</p>}{p.limit&&<p>Limit: {p.limit.quantity} {p.limit.period} · {p.limit.used} used</p>}
  {p.startsAt&&<p>Available from {new Date(p.startsAt).toLocaleString()}</p>}{p.endsAt&&<p>Available until {new Date(p.endsAt).toLocaleString()}</p>}
  {p.reasons.map(reason=><p className="store-unavailable" key={reason}>{reason}</p>)}{p.warnings?.filter((_,i)=>i===0&&p.count!==undefined&&p.fullCount!==undefined&&p.count<p.fullCount).map(w=><p key={w}>{w}</p>)}
  <div className="store-product-actions">{onDetails&&<button disabled={busy} aria-label={`Inspect ${p.name}`} onClick={onDetails}>View details</button>}<button className="primary" aria-label={`Review ${p.name}`} disabled={busy||!p.available||pending} onClick={onReview}>Review purchase</button></div></div>
 </article>;
}
export function StoreDialog({title,onClose,children,returnFocus}:{title:string;onClose:()=>void;children:ReactNode;returnFocus?:HTMLElement|null}){
 const root=useRef<HTMLElement>(null),close=useRef(onClose),label=useId();close.current=onClose;
 useEffect(()=>{const previous=returnFocus??document.activeElement as HTMLElement|null,element=root.current!;element.querySelector<HTMLButtonElement>("button")?.focus();const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close.current();}if(e.key==="Tab"){const buttons=[...element.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,summary,[tabindex="0"]')].filter(b=>b.getClientRects().length),first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};element.addEventListener("keydown",key);return()=>{element.removeEventListener("keydown",key);requestAnimationFrame(()=>{if(previous?.isConnected&&(document.activeElement===document.body||element.contains(document.activeElement)))previous.focus();});};},[]);
 return <div className="store-dialog-shade" onClick={()=>onClose()}><section ref={root} role="dialog" aria-modal="true" aria-labelledby={label} className="store-dialog" onClick={e=>e.stopPropagation()}><header><h2 id={label}>{title}</h2><button aria-label="Close product details" onClick={onClose}>Close product details</button></header>{children}</section></div>;
}
