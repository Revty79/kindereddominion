import {useEffect,useState} from "react";
import {splitIdentifiers} from "../shop/draft-tools";
export function IdentifierInput({label,values,onChange,disabled=false,multiline=false,commasOnly=false}:{label:string;values:string[];onChange:(v:string[])=>void;disabled?:boolean;multiline?:boolean;commasOnly?:boolean}){
 const canonical=values.join(", "),[text,setText]=useState(canonical),parse=(s:string)=>commasOnly?[...new Set(s.split(",").map(s=>s.trim()).filter(Boolean))]:splitIdentifiers(s);
 useEffect(()=>setText(current=>parse(current).join(", ")===canonical?current:canonical),[canonical,commasOnly]);
 const props={"aria-label":label,value:text,disabled,onChange:(e:any)=>{setText(e.target.value);onChange(parse(e.target.value));},onBlur:()=>setText(parse(text).join(", "))};
 return <label>{label}{multiline?<textarea {...props}/>:<input {...props}/>}</label>;
}
