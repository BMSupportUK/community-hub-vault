import {test,expect} from "bun:test";import {cardTitle} from "../src/lib/player-sports";
test("bkfc",()=>{expect(cardTitle("BKFC 96: Cooke v Weir")).toBe("BKFC 96: Cooke v Weir");expect(cardTitle("EPL: Derby v Bolton")).toBe("Derby v Bolton");});
