import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!DOCTYPE html>');
(globalThis as any).DOMParser = dom.window.DOMParser;

import { parseMusicXML } from '../utils/parser';
import { generateDashes } from '../utils/transforms';
import { reduceChords } from '../utils/chordReducer';

const xml = readFileSync('assist/小半节选.musicxml', 'utf-8');
const parsed = parseMusicXML(xml);

console.log("=== After parseMusicXML: isTied notes ===");
parsed.filter(n => n.isTied).forEach(n => {
  console.log(`  ${n.step}${n.octave} chord=${n.chord} isTied=${n.isTied} tieStop=${n.tieStop} st=${n.startTime} beats=${n.beats}`);
});

console.log("\n=== After parseMusicXML: tieStart notes ===");
parsed.filter(n => n.tieStart).forEach(n => {
  console.log(`  ${n.step}${n.octave} chord=${n.chord} tieStart=${n.tieStart} st=${n.startTime} beats=${n.beats}`);
});

const reduced = reduceChords(parsed);
console.log("\n=== After reduceChords: isTied notes ===");
reduced.filter(n => n.isTied).forEach(n => {
  console.log(`  ${n.step}${n.octave} chord=${n.chord} isTied=${n.isTied} tieStop=${n.tieStop} st=${n.startTime} beats=${n.beats}`);
});

console.log("\n=== After reduceChords: full list around tie region (startTime 78-100) ===");
reduced.filter(n => n.startTime >= 78 && n.startTime <= 100).forEach((n, i) => {
  const idx = reduced.indexOf(n);
  console.log(`  [${idx}] ${n.isBarline ? 'BAR' : n.isDash ? 'DASH' : n.isRest ? 'REST' : `${n.step}${n.octave}`} chord=${n.chord} isTied=${n.isTied ?? false} tieStart=${n.tieStart ?? false} tieStop=${n.tieStop ?? false} st=${n.startTime} beats=${n.beats ?? ''}`);
});

const withDashes = generateDashes(reduced);
console.log("\n=== After generateDashes: all dashes (DFT and regular) ===");
withDashes.filter(n => n.isDash).forEach((n) => {
  const idx = withDashes.indexOf(n);
  console.log(`  [${idx}] DASH dashFromTie=${n.dashFromTie ?? false} st=${n.startTime}`);
});

console.log("\n=== After generateDashes: full list around tie region (startTime 78-100) ===");
withDashes.filter(n => n.startTime >= 78 && n.startTime <= 100).forEach((n) => {
  const idx = withDashes.indexOf(n);
  const type = n.isBarline ? 'BAR' : n.isDash ? 'DASH' : n.isRest ? 'REST' : `${n.step}${n.octave}`;
  console.log(`  [${idx}] ${type} chord=${n.chord ?? false} isTied=${n.isTied ?? false} dashFromTie=${n.dashFromTie ?? false} tieStart=${n.tieStart ?? false} st=${n.startTime} beats=${n.beats ?? ''}`);
});
