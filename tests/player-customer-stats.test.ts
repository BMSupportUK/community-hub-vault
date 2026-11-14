import { expect, test } from 'bun:test';
import { customerStatsDays, customerStatsSegments } from '../src/lib/player-customer-stats';

test('customer stats contain exactly seven UK calendar days including today', () => {
 expect(customerStatsDays(Date.parse('2026-11-14T19:20:00Z'))).toEqual(['2026-11-14','2026-11-13','2026-11-12','2026-11-11','2026-11-10','2026-11-09','2026-11-08']);
});
test('UK day tabs include the UK date when it differs from UTC and survive clock changes', () => {
 expect(customerStatsDays(Date.parse('2026-07-14T23:30:00Z'))[0]).toBe('2026-07-15');
 expect(customerStatsDays(Date.parse('2026-10-26T00:10:00Z'))).toEqual(['2026-10-26','2026-10-25','2026-10-24','2026-10-23','2026-10-22','2026-10-21','2026-10-20']);
});
test('daily chart percentages use the watched channel totals across devices', () => {
 const rows = customerStatsSegments([{ title:'E4',kind:'live',seconds:120 },{ title:'E4',kind:'live',seconds:60 },{ title:'BBC One',kind:'live',seconds:60 }]);
 expect(rows).toEqual([{title:'E4',kind:'live',seconds:180,percent:75},{title:'BBC One',kind:'live',seconds:60,percent:25}]);
 expect(customerStatsSegments([])).toEqual([]);
});