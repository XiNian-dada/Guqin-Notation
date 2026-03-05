import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<html></html>');
(globalThis as any).DOMParser = dom.window.DOMParser;
import { parseMusicXML } from '../utils/parser';

const xml = readFileSync('assist/小半节选.musicxml', 'utf-8');
const parsed = parseMusicXML(xml);

// Check that chord notes now share startTime with their primary
let issues = 0;
for (let i = 0; i < parsed.length; i++) {
  if (parsed[i].chord && i > 0) {
    let j = i - 1;
    while (j >= 0 && parsed[j].chord) j--;
    if (j >= 0 && !parsed[j].isBarline && !parsed[j].isDash) {
      if (parsed[i].startTime !== parsed[j].startTime) {
        console.log(`MISMATCH: chord[${i}] ${parsed[i].step}${parsed[i].octave} st=${parsed[i].startTime} vs primary[${j}] ${parsed[j].step}${parsed[j].octave} st=${parsed[j].startTime}`);
        issues++;
      }
    }
  }
}
console.log(issues === 0 ? 'All chord notes have correct startTimes!' : `${issues} mismatches found`);
