import { Window } from 'happy-dom';
import { annotateTimesInEl } from '../src/lib/parse-event-times.ts';

const body = process.argv.slice(2).join(' ');
const window = new Window();
(globalThis as any).window = window;
(globalThis as any).document = window.document;
(globalThis as any).Node = window.Node;
(globalThis as any).HTMLElement = window.HTMLElement;
(globalThis as any).Element = window.Element;
(globalThis as any).navigator = window.navigator;

const wrap = document.createElement('div');
wrap.innerHTML = body;
annotateTimesInEl(wrap, 'Europe/London', 'GMT');
const eventRows = Array.from(wrap.querySelectorAll<HTMLElement>('[data-tz-row][data-tz-utc]'));
console.log(JSON.stringify({ events: eventRows.length, pagesAt8PerPage: Math.ceil(eventRows.length / 8), first: eventRows[0]?.textContent?.replace(/\s+/g, ' ').trim(), last: eventRows.at(-1)?.textContent?.replace(/\s+/g, ' ').trim() }, null, 2));
