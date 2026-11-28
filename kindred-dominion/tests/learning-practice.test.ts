import {describe,it,expect} from "vitest";
import {currentOwnerContent} from "../src/content/current";
import {libraryOf} from "../src/content/validation";
import {practiceMatch} from "../src/player/practice-model";
import {act,legalPlays,placementError} from "../src/engine/game";
import {tacticalPreview} from "../src/ui/tactical-preview";
import {scoreGame} from "../src/engine/scoring";
import {KINDRED_GUIDES} from "../src/player/learning-model";
const content=currentOwnerContent(),library=libraryOf(content);
describe("reward-free learning uses established gameplay",()=>{
 it("starts a reproducible legal published game without altering the source content",()=>{const original=structuredClone(content),a=practiceMatch(content),b=practiceMatch(content);expect(a).toEqual(b);expect(a.phase).toBe("playing");expect(a.active).toBe(0);expect(legalPlays(a,library,0).length).toBeGreaterThan(0);expect(content).toEqual(original);});
 it("uses real legal destinations, bounded previews and unchanged accepted outcomes",()=>{const before=practiceMatch(content),snapshot=structuredClone(before),play=legalPlays(before,library,0)[0],preview=tacticalPreview(before,library,0,play.card,play.row,play.col);expect(before).toEqual(snapshot);expect(placementError(before,library,0,play.card,play.row,play.col)).toBeNull();const after=act(before,play,library);expect(after.turn).toBeGreaterThan(before.turn);expect(after.cards[play.card].location).toBe("battlefield");expect(preview.tiles.some(t=>t.row===play.row&&t.col===play.col)).toBe(true);expect(scoreGame(after,library).totals.every(Number.isFinite)).toBe(true);});
 it("rejects an opponent tile without accepting a placement",()=>{const before=practiceMatch(content),original=structuredClone(before),play=legalPlays(before,library,0)[0];expect(placementError(before,library,0,play.card,0,4)).toBeTruthy();expect(()=>act(before,{...play,col:4,row:0},library)).toThrow();expect(before).toEqual(original);});
 it("uses representative permanent cards from each matching Kindred",()=>{expect(Object.keys(KINDRED_GUIDES)).toHaveLength(5);for(const[k,guide]of Object.entries(KINDRED_GUIDES))for(const id of guide.cards)expect(library[id].kindred).toBe(k);});
});
