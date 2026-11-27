import {expect,it} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import CollectibleCard,{InfluenceDiagram} from "../src/ui/cards/CollectibleCard";
import {currentOwnerContent} from "../src/content/current";
import {libraryOf} from "../src/content/validation";
const library=libraryOf(currentOwnerContent());
it("mirrors asymmetric printed influence for the opposing controller without changing the card",()=>{
  const card=library.n003,before=structuredClone(card),classes=(player:0|1)=>[...renderToStaticMarkup(createElement(InfluenceDiagram,{card,player})).matchAll(/class="([^"]*)"/g)].slice(1).map(match=>match[1]);
  const right=classes(0),left=classes(1);expect(right).toHaveLength(25);expect(left).toHaveLength(25);
  expect(right[18]).toContain("influence-expansion");expect(right[16]).not.toContain("influence-expansion");expect(left[16]).toContain("influence-expansion");expect(left[18]).not.toContain("influence-expansion");expect(left[12]).toContain("influence-origin");expect(card).toEqual(before);
});
it("shows configured host identity, classification and power requirements in the shared face",()=>{
  const card=structuredClone(library.n027);card.prerequisite={...card.prerequisite,tags:["Mammal"],minPower:3};
  const markup=renderToStaticMarkup(createElement(CollectibleCard,{card,library}));expect(markup).toContain("N002 Wolf Cub");expect(markup).toContain("Mammal classification");expect(markup).toContain("Host power ≥ 3");expect(markup).toContain('data-layer="artwork"');expect(markup).toContain('data-layer="permanent"');
});
