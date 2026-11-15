import { test, expect } from "bun:test";
import { channelLinkRating } from "../src/lib/player-customer-stats";
const stable = { ping_ms: 38, stalls: 0, reconnects: 0, delivery_ratio: 1 };
test('ping boundaries match the box exactly', () => {
 for (const [ping, rating] of [[80,'Excellent'],[81,'Good'],[200,'Good'],[201,'Fair'],[400,'Fair'],[401,'Poor']] as const) expect(channelLinkRating({...stable,ping_ms:ping})).toBe(rating);
});
test('one reconnect is Poor even at 38 ms', () => expect(channelLinkRating({...stable,reconnects:1})).toBe('Poor'));
test('one or two stalls are Fair and three are Poor', () => {
 expect(channelLinkRating({...stable,stalls:1})).toBe('Fair'); expect(channelLinkRating({...stable,stalls:2})).toBe('Fair'); expect(channelLinkRating({...stable,stalls:3})).toBe('Poor');
});
test('a delivery shortfall lowers the rating only after lasting a minute', () => {
 expect(channelLinkRating({...stable,delivery_ratio:0.8,short_ms:59_999,poor_ms:59_999})).toBe('Excellent');
 expect(channelLinkRating({...stable,delivery_ratio:0.8,short_ms:60_000,poor_ms:60_000})).toBe('Poor');
 expect(channelLinkRating({...stable,delivery_ratio:0.95,short_ms:60_000,poor_ms:0})).toBe('Fair');
});
test('older box readings without shortfall timing ignore the jumpy ratio', () => {
 expect(channelLinkRating({...stable,delivery_ratio:0.37})).toBe('Excellent');
});
test('no measurements is Checking, legacy missing snapshot is unknown', () => {
 expect(channelLinkRating({...stable,ping_ms:-1,delivery_ratio:-1})).toBe('Checking'); expect(channelLinkRating(null)).toBeNull();
});
