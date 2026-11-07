import {test,expect} from 'bun:test';
import {matchesSearch} from '../windows-bm-player/renderer/sports-guide.jsx';
const bk={title:'BKFC 96: Cooke v Weir',competition:'Daily Sports',sport:'Fighting'};
const mg={title:'MotoGP: Round 20: Qatar Sprint Race',competition:'DAZN'};
const fb={title:'Derby County v Bolton Wanderers',competition:'Sky Sports'};
test('voice',()=>{
 expect(matchesSearch(bk,'BKFC.')).toBe(true);
 expect(matchesSearch(bk,'Show me BKFC')).toBe(true);
 expect(matchesSearch(mg,'Moto GP')).toBe(true);
 expect(matchesSearch(fb,'Derby versus Bolton')).toBe(true);
 expect(matchesSearch(fb,'the Derby game tonight')).toBe(true);
 expect(matchesSearch(fb,'Chelsea')).toBe(false);
});
