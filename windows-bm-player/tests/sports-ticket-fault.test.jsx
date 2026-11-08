import {test,expect} from 'bun:test';
import {sportsRows} from '../renderer/sports-guide.jsx';
test('ticket fault overrides pre-event waiting and clears when resolved',()=>{
 const event={start:Date.now()+3600000,channels:['UFC 1'],ticketFaults:['UFC 1']},items=[{name:'UFC 1',id:1}];
 const fault=sportsRows(event,items,[]).find(r=>r.item);
 expect(fault.fault).toBe(true);expect(fault.down).toBe(true);expect(fault.early).toBe(false);
 const cleared=sportsRows({...event,ticketFaults:[]},items,[]).find(r=>r.item);
 expect(cleared.fault).toBe(false);expect(cleared.down).toBe(false);
});
test('club channels receive ticket faults too',()=>{
 const event={start:Date.now(),title:'Hearts v Celtic',competition:'Scottish',channels:[],ticketFaults:['Hearts TV']};
 expect(sportsRows(event,[{name:'Hearts TV',id:2}],[]).find(r=>r.item).fault).toBe(true);
});