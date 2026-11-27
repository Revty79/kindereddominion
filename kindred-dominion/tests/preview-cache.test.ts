import {it,expect,vi} from "vitest";
import {PreviewCache} from "../server/preview-cache";
it("expires cached snapshots and keeps a bounded recent working set",()=>{vi.useFakeTimers();try{const cache=new PreviewCache();for(let n=0;n<40;n++)cache.put(String(n),{revision:n});expect(cache.get("0")).toBeUndefined();expect(cache.get("39")).toEqual({revision:39});vi.advanceTimersByTime(15001);expect(cache.get("39")).toBeUndefined();}finally{vi.useRealTimers();}});
it("does not retain oversized preview results",()=>{const cache=new PreviewCache(),value="x".repeat(130*1024);expect(cache.put("large",value)).toBe(value);expect(cache.get("large")).toBeUndefined();});
