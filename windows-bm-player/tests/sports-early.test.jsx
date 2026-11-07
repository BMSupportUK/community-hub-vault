import {test,expect} from 'bun:test';
import {sportsRows} from '../renderer/sports-guide.jsx';
const items=[{name:'UFC 1',id:1}];
const ev=(start)=>({start,channels:['UFC 1'],unavailable:['UFC 1']});
test('offline channel before the event shows not started',()=>{const r=sportsRows(ev(Date.now()+3600000),items,[]).find(x=>x.item);expect(r.down).toBe(true);expect(r.early).toBe(true);});
test('offline channel after the event starts shows not working',()=>{const r=sportsRows(ev(Date.now()-60000),items,[]).find(x=>x.item);expect(r.down).toBe(true);expect(r.early).toBe(false);});
