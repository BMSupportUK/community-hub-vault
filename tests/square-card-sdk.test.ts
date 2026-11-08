import { afterEach, expect, test } from 'bun:test';
import { loadSquareCardSdk } from '../src/lib/square-card-sdk';

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
afterEach(() => {
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});
function browser() {
  const scripts: { src: string; onload?: () => void; onerror?: () => void; remove: () => void }[] = [];
  const windowMock = { setTimeout, clearTimeout, Square: undefined as unknown };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowMock });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({ src: '', remove() {} }),
    head: { appendChild: (script: typeof scripts[number]) => scripts.push(script) },
  } });
  return { scripts, windowMock };
}
test('concurrent card opens share one environment-specific SDK load', async () => {
  const { scripts, windowMock } = browser();
  const first = loadSquareCardSdk('sandbox');
  const second = loadSquareCardSdk('sandbox');
  expect(second).toBe(first);
  expect(scripts.length).toBe(1);
  expect(scripts[0]?.src).toBe('https://sandbox.web.squarecdn.com/v1/square.js');
  const sdk = { payments() {} }; windowMock.Square = sdk;
  scripts[0]?.onload?.();
  expect(await first).toBe(sdk);
});
test('a downloaded SDK without Square can be reloaded instead of caching failure', async () => {
  const { scripts, windowMock } = browser();
  const failed = loadSquareCardSdk('production');
  const rejection = failed.catch(error => error.message);
  scripts[0]?.onload?.();
  expect(await rejection).toBe('Square card entry did not load');
  const retry = loadSquareCardSdk('production');
  expect(retry).not.toBe(failed);
  expect(scripts.length).toBe(2);
  const sdk = { payments() {} }; windowMock.Square = sdk;
  scripts[1]?.onload?.();
  expect(await retry).toBe(sdk);
});