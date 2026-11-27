/** Small process-local cache, always consulted after ownership/revision checks.
 * Nothing survives logout/restart or becomes an authoritative match record. */
export class PreviewCache {
  private entries=new Map<string,{value:unknown;bytes:number;expires:number}>();private bytes=0;
  get<T>(key:string):T|undefined{const entry=this.entries.get(key);if(!entry)return;if(entry.expires<Date.now()){this.remove(key);return;}this.entries.delete(key);this.entries.set(key,entry);return entry.value as T;}
  put<T>(key:string,value:T):T{const bytes=Buffer.byteLength(JSON.stringify(value));if(bytes>128*1024)return value;this.remove(key);while(this.entries.size>=32||this.bytes+bytes>2*1024*1024){const oldest=this.entries.keys().next().value;if(!oldest)break;this.remove(oldest);}this.entries.set(key,{value,bytes,expires:Date.now()+15000});this.bytes+=bytes;return value;}
  private remove(key:string){const old=this.entries.get(key);if(old)this.bytes-=old.bytes;this.entries.delete(key);}
}
