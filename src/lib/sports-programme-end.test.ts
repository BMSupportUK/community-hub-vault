// @ts-nocheck — bun:test is provided by the test runner, not the app typecheck.
import { expect, test } from "bun:test";
import { applyGuideEnds, sportsEventState, type PlayerSportsEvent } from "./player-sports";
import { isOfficialSportsChannel, programmeMatchesEvent } from "./sports-programme-end";
const H = 3600_000, start = Date.UTC(2026,10,8,15);
const event: PlayerSportsEvent = { sport:"Football",subcategory:"",competition:"EFL",title:"Derby v Bolton",date:null,time:"15:00",start,end:start+2*H,endSource:"estimate",channels:["DAZN CA 18","Sky Sports Football","TNT Sports 1"],passChannels:[] };
test("official programme completion marks the matching event finished",()=>{
 const listings=new Map([["sky sports football",[{title:"Live EFL: Derby v Bolton",start:start-30*60_000,end:start+105*60_000}]]]);
 const result=applyGuideEnds([event],listings,start+106*60_000)[0];
 expect(result.endSource).toBe("epg");expect(result.end).toBe(start+105*60_000);expect(sportsEventState(result,start+106*60_000)).toBe("finished");
});
test("unrelated, replay and split-half programmes retain scheduled fallback",()=>{
 for(const title of ["Live Leeds v Tottenham","Derby v Bolton Highlights","Derby v Bolton Replay","Derby v Bolton First Half","Derby v Bolton Half Time","Derby v Bolton Women"]){
  expect(applyGuideEnds([event],new Map([["sky sports football",[{title,start,end:start+H}]]]),start)[0].end).toBe(start+2*H);
 }
});
test("event-only channels cannot finish a card and later official coverage wins",()=>{
 const listings=new Map([["dazn ca 18",[{title:event.title,start,end:start+H}]],["sky sports football",[{title:event.title,start,end:start+2*H}]],["tnt sports 1",[{title:event.title,start,end:start+2.5*H}]]]);
 expect(applyGuideEnds([event],listings,start)[0].end).toBe(start+2.5*H);
 expect(isOfficialSportsChannel("DAZN CA 18")).toBe(false);expect(isOfficialSportsChannel("Sky Sports Main Event HD")).toBe(true);
});
test("generic race sessions, different editions and main cards cannot finish another event",()=>{
 expect(programmeMatchesEvent("F1 Race","F1 Race")).toBe(false);
 expect(programmeMatchesEvent("UFC 320: Main Card","UFC 321: Main Card")).toBe(false);
 expect(programmeMatchesEvent("UFC 320: Prelims","UFC 320: Main Card")).toBe(false);
});
test("wrong-day or malformed programme times cannot override an event",()=>{
 for(const p of [{title:event.title,start:start-24*H,end:start+H},{title:event.title,start,end:NaN},{title:event.title,start,end:start-1}])expect(applyGuideEnds([event],new Map([["sky sports football",[p]]]),start)[0].end).toBe(start+2*H);
});

test("BBL Women fixtures use their own explicit live Sky slots, not the eight-hour cricket estimate", () => {
 const first = Date.UTC(2026, 10, 8, 2, 40), second = Date.UTC(2026, 10, 8, 6, 10);
 const fixtures = [
  {...event, sport:"Cricket", competition:"Big Bash League | Women", title:"SIXERS @ THUNDERS", start:first, end:first+8*H, channels:["Sky Sports Cricket | FHD |"]},
  {...event, sport:"Cricket", competition:"Big Bash League | Women", title:"PERTH SCORCHERS v MELBOURNE STARS", start:second, end:second+8*H, channels:["Sky Sports Cricket | FHD |"]},
 ];
 const listings = new Map([["sky sports cricket | fhd |", [
  {title:"Live Women's Big Bash League", start:first-5*60_000, end:Date.UTC(2026,10,8,5,40)},
  {title:"Live Women's Big Bash League", start:second-5*60_000, end:Date.UTC(2026,10,8,9,10)},
  {title:"Women's Big Bash League", start:Date.UTC(2026,10,8,10), end:Date.UTC(2026,10,8,11)},
 ]]]);
 const result = applyGuideEnds(fixtures, listings, Date.UTC(2026,10,8,9,11));
 expect(result).toHaveLength(1);
 expect(result[0].end).toBe(Date.UTC(2026,10,8,9,10));
 expect(result[0].endSource).toBe("epg");
 expect(sportsEventState(result[0], Date.UTC(2026,10,8,9,11))).toBe("finished");
 expect(applyGuideEnds(fixtures, listings, Date.UTC(2026,10,8,11,43))).toHaveLength(0);
});

test("competition-only WBBL slots reject repeats, mens events and ambiguous simultaneous fixtures", () => {
 const e = {...event,competition:"Big Bash League | Women",channels:["Sky Sports Cricket"],end:start+8*H};
 for (const title of ["Women's Big Bash League", "Live Women's Big Bash League Highlights", "Live Big Bash League", "Live ICC Women's World Cup"]) {
  expect(applyGuideEnds([e],new Map([["sky sports cricket",[{title,start,end:start+3*H}]]]),start)[0].endSource).toBe("estimate");
 }
 const listing=new Map([["sky sports cricket",[{title:"Live Women's Big Bash League",start,end:start+3*H}]]]);
 expect(applyGuideEnds([{...e,competition:"Big Bash League | Men"}],listing,start)[0].endSource).toBe("estimate");
 expect(applyGuideEnds([e,{...e,title:"Other teams v Opponents"}],listing,start).every(x=>x.endSource==="estimate")).toBe(true);
});