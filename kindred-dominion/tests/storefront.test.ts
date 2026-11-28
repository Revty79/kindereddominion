import {describe,it,expect} from "vitest";
import {STORE_DEPARTMENTS,productDepartment,inDepartment} from "../src/shop/departments";
import {productSchema,DEFAULT_SHOP} from "../server/shop-rules";
import {offerPrice} from "../server/shop-catalog";
const base={id:"reviewed-set",name:"Reviewed set",description:"Explicit contents",category:"kindreds",type:"bundle",mode:"additional",status:"published",enabled:true,currency:"aether",price:1000,pool:{cards:["n001","n002"]}};
describe("store departments and truthful product terms",()=>{
 it("defines exactly seven distinct departments",()=>{expect(STORE_DEPARTMENTS).toHaveLength(7);expect(new Set(STORE_DEPARTMENTS.map(d=>d.id)).size).toBe(7);});
 it("keeps first and additional boosters in the same department",()=>{for(const p of DEFAULT_SHOP.products.filter(p=>p.type==="booster"))expect(productDepartment(p)).toBe("boosters");});
 it("separates direct additional cards from collection sets",()=>{expect(productDepartment(productSchema.parse({...base,id:"card-additional-n001",category:"additional"}))).toBe("cards");expect(productDepartment(productSchema.parse({...base,category:"additional"}))).toBe("collections");});
 it("routes alternate artwork and decorative cosmetics by their definitions",()=>{const p=productSchema.parse({...base,type:"cosmetic",mode:"cosmetic",category:"cosmetics",cosmetics:["appearance"]});expect(productDepartment(p,[{id:"appearance",type:"alternate_art"}])).toBe("artwork");expect(productDepartment(p,[{id:"appearance",type:"card_back"}])).toBe("customization");});
 it("features only explicit highlights or published offer classifications",()=>{const p=productSchema.parse(base);expect(inDepartment(p,"featured")).toBe(false);expect(inDepartment({...p,featured:true},"featured")).toBe(true);expect(inDepartment({...p,category:"offers"},"featured")).toBe(true);expect(inDepartment(p,"aether")).toBe(false);});
 it("extends old documents with nonpromotional defaults",()=>{expect(productSchema.parse(base)).toMatchObject({featured:false,edition:"standard"});expect(()=>productSchema.parse({...base,edition:"invented"})).toThrow();});
 it("compares the same prorated contents before and after a published discount",()=>{const p=productSchema.parse({...base,mode:"first_copy",currency:"gold",price:1000,discountBasisPoints:1500}),ids=["n001"];expect(offerPrice(p,ids,2,DEFAULT_SHOP)).toBe(425);expect(offerPrice({...p,discountBasisPoints:0},ids,2,DEFAULT_SHOP)).toBe(500);expect(offerPrice(p,[],2,DEFAULT_SHOP)).toBe(0);});
});
