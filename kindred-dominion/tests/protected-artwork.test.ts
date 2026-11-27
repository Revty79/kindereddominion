import {expect,it} from "vitest";
import {currentOwnerContent} from "../src/content/current";
import {artworkMap,recordArtworkMap} from "../src/assets/references";
import {createMatch} from "../src/engine/game";
import {libraryOf} from "../src/content/validation";
import {newRecord,validateRecord} from "../src/replay/record";
it("stores revisioned repository artwork independently of the protected Studio deployment base",()=>{
  const content=currentOwnerContent(),stored=recordArtworkMap(content),runtime=artworkMap(content);
  expect(Object.keys(stored)).toHaveLength(150);
  for(const [id,url] of Object.entries(stored)){
    expect(url).toMatch(/^assets\/cards\/[a-z0-9/_.-]+\.webp$/);
    expect(runtime[id]).toContain(url);
    expect(url).not.toContain("/api/control/");
  }
  const decks:[string[],string[]]=[content.decks[0].cards,content.decks[1].cards],library=libraryOf(content);
  const record=newRecord(createMatch(decks,library,content.rulesets[0].config,31,0),library,decks,content.id);
  record.artwork=stored;
  expect(()=>validateRecord(record)).not.toThrow();
});
