/**
 * Terminal test harness for the MusicXML → Guqin pipeline.
 * Usage: npx tsx assist/test-pipeline.ts [xmlFile]
 *
 * Polyfills DOMParser via jsdom so the parser can run in Node.js.
 */
import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';

// Polyfill browser globals needed by parser.ts
const dom = new JSDOM('<!DOCTYPE html>');
(globalThis as any).DOMParser = dom.window.DOMParser;

// Now import pipeline functions
import { parseMusicXML } from '../utils/parser';
import { generateDashes, recalculateJianpu } from '../utils/transforms';
import { reduceChords } from '../utils/chordReducer';
import { TUNINGS } from '../constants';

const DEFAULT_TUNING = TUNINGS[0]; // 正调 F major

const xmlPath = process.argv[2] || 'assist/小半节选.musicxml';
const xmlContent = readFileSync(xmlPath, 'utf-8');

console.log(`\n=== Pipeline Test: ${xmlPath} ===\n`);

// Stage 1: Parse
const parsed = parseMusicXML(xmlContent);
console.log(`[1] parseMusicXML → ${parsed.length} items`);

// Stage 2: Reduce chords
const reduced = reduceChords(parsed);
console.log(`[2] reduceChords  → ${reduced.length} items`);

// Stage 3: Generate dashes
const withDashes = generateDashes(reduced);
console.log(`[3] generateDashes → ${withDashes.length} items`);

// Stage 4: Recalculate jianpu
const recalced = recalculateJianpu(withDashes, DEFAULT_TUNING.fifths);
console.log(`[4] recalculateJianpu → ${recalced.length} items`);

// ─── Detailed dump ─────────────────────────────────────────────
console.log('\n─── Detailed Note Dump ───\n');
console.log(
  'idx'.padStart(4),
  'type'.padEnd(8),
  'pitch'.padEnd(8),
  'jp#'.padEnd(4),
  'oct'.padEnd(4),
  'beats'.padEnd(6),
  'tied'.padEnd(5),
  'dashTie'.padEnd(8),
  'tieS'.padEnd(5),
  'tieE'.padEnd(5),
  'slurS'.padEnd(6),
  'slurE'.padEnd(6),
  'beamGrp'.padEnd(8),
);
console.log('-'.repeat(85));

recalced.forEach((n, i) => {
  let typeStr = '';
  if (n.isBarline) typeStr = 'BAR';
  else if (n.isDash) typeStr = 'DASH';
  else if (n.isRest) typeStr = 'REST';
  else if (n.chord) typeStr = 'CHORD';
  else typeStr = 'NOTE';

  const pitchStr = n.isBarline || n.isDash ? '' : (n.isRest ? 'rest' : `${n.step}${n.alter > 0 ? '#' : n.alter < 0 ? 'b' : ''}${n.octave}`);
  const jpNum = n.jianpu.number || '';
  const jpOct = n.isBarline || n.isDash ? '' : String(n.jianpu.octave);
  const beatsStr = n.beats != null ? n.beats.toFixed(1) : '';

  console.log(
    String(i).padStart(4),
    typeStr.padEnd(8),
    pitchStr.padEnd(8),
    jpNum.padEnd(4),
    jpOct.padEnd(4),
    beatsStr.padEnd(6),
    (n.isTied ? 'T' : '.').padEnd(5),
    (n.dashFromTie ? 'DFT' : '.').padEnd(8),
    (n.tieStart ? 'TS' : '.').padEnd(5),
    (n.tieStop ? 'TE' : '.').padEnd(5),
    (n.slurStart ? 'S' : '.').padEnd(6),
    (n.slurStop ? 'E' : '.').padEnd(6),
    (n.beamGroupId ? String(n.beamGroupId) : '.').padEnd(8),
  );
});

// ─── Display entry simulation ──────────────────────────────────
console.log('\n─── Display Entries (chord-collapsed) ───\n');

interface SimpleEntry {
  index: number;
  isBarline: boolean;
  isDash: boolean;
  isRest: boolean;
  dashFromTie: boolean;
  tieStart: boolean;
  tieStop: boolean;
  slurStart: boolean;
  slurStop: boolean;
  pitch: string;
  jpNum: string;
}

const entries: SimpleEntry[] = [];
let idx = 0;
let ei = 0;
while (ei < recalced.length) {
  const n = recalced[ei];
  const chordGroup = [n];
  while (ei + 1 < recalced.length && recalced[ei + 1].chord && !recalced[ei + 1].isBarline && !recalced[ei + 1].isDash) {
    ei++;
    chordGroup.push(recalced[ei]);
  }
  const hasTieStart = chordGroup.some(c => c.tieStart);
  const hasTieStop = chordGroup.some(c => c.tieStop);
  const hasSlurStart = chordGroup.some(c => c.slurStart);
  const hasSlurStop = chordGroup.some(c => c.slurStop);
  
  entries.push({
    index: idx++,
    isBarline: n.isBarline ?? false,
    isDash: n.isDash ?? false,
    isRest: n.isRest,
    dashFromTie: n.dashFromTie ?? false,
    tieStart: hasTieStart,
    tieStop: hasTieStop,
    slurStart: hasSlurStart,
    slurStop: hasSlurStop,
    pitch: n.isBarline ? '|' : n.isDash ? '—' : n.isRest ? '0' : `${n.step}${n.alter > 0 ? '#' : n.alter < 0 ? 'b' : ''}${n.octave}`,
    jpNum: n.jianpu.number,
  });
  ei++;
}

console.log(`Total display entries: ${entries.length}`);
console.log(`  slurStart: ${entries.filter(e => e.slurStart).length}`);
console.log(`  slurStop:  ${entries.filter(e => e.slurStop).length}`);
console.log(`  tieStart:  ${entries.filter(e => e.tieStart).length}`);
console.log(`  tieStop:   ${entries.filter(e => e.tieStop).length}`);
console.log(`  dashFromTie: ${entries.filter(e => e.dashFromTie).length}`);

// ─── Slur arcs (stack-based, from <slur> only) ────────────────
console.log('\n[Slur Arcs] Stack-based matching (from <slur> elements):');
const slurStack: number[] = [];
let slurArcCount = 0;
for (const entry of entries) {
  if (entry.slurStop && slurStack.length > 0) {
    const startIdx = slurStack.pop()!;
    const startEntry = entries[startIdx];
    console.log(`  ARC: [${startIdx}] ${startEntry.pitch} (${startEntry.jpNum}) → [${entry.index}] ${entry.pitch} (${entry.jpNum})`);
    slurArcCount++;
  }
  if (entry.slurStart) {
    slurStack.push(entry.index);
  }
}
if (slurStack.length > 0) {
  console.log(`  WARNING: ${slurStack.length} unmatched slurStart(s) at indices: ${slurStack.join(', ')}`);
}
if (slurArcCount === 0) console.log('  (none)');

// ─── Cross-barline tie arcs ───────────────────────────────────
console.log('\n[Tie Arcs] Cross-barline detection (note w/ tieStart → barline → dashFromTie):');
let tieArcCount = 0;
for (let i = 0; i < entries.length; i++) {
  const entry = entries[i];
  if (entry.isBarline || entry.isDash || entry.isRest || !entry.tieStart) continue;

  let j = i + 1;
  let lastDashIdx = -1;
  let barlineBeforeDashes = false;
  let foundDashFromTie = false;

  while (j < entries.length) {
    const next = entries[j];
    if (next.isBarline) {
      if (!foundDashFromTie) barlineBeforeDashes = true;
      j++;
      continue;
    }
    if (next.isDash && next.dashFromTie) {
      foundDashFromTie = true;
      lastDashIdx = j;
      j++;
      continue;
    }
    if (next.isDash && !next.dashFromTie) {
      j++;
      continue;
    }
    break;
  }

  if (foundDashFromTie && barlineBeforeDashes && lastDashIdx >= 0) {
    console.log(`  ARC: [${i}] ${entry.pitch} (${entry.jpNum}) → [${lastDashIdx}] ${entries[lastDashIdx].pitch}`);
    tieArcCount++;
    
    // Show context
    const lo = Math.max(0, i - 1);
    const hi = Math.min(entries.length - 1, lastDashIdx + 1);
    for (let k = lo; k <= hi; k++) {
      const en = entries[k];
      const marker = k === i ? ' >>NOTE' : k === lastDashIdx ? ' >>DASH' : '';
      const flags = [
        en.isDash ? 'DASH' : en.isBarline ? 'BAR' : en.isRest ? 'REST' : 'NOTE',
        en.dashFromTie ? 'DFT' : '',
        en.tieStart ? 'tieS' : '',
        en.tieStop ? 'tieE' : '',
      ].filter(Boolean).join(' ');
      console.log(`    [${k}] ${en.pitch.padEnd(8)} jp=${en.jpNum.padEnd(3)} ${flags}${marker}`);
    }
    console.log('');
  } else if (entry.tieStart) {
    // Report tieStart WITHOUT cross-barline dash
    let dashes = 0;
    let hasCrossBarline = false;
    let seenDash = false;
    for (let k = i + 1; k < entries.length && (entries[k].isDash || entries[k].isBarline); k++) {
      if (entries[k].dashFromTie) { dashes++; seenDash = true; }
      if (entries[k].isBarline && !seenDash) hasCrossBarline = true;
    }
    if (dashes > 0 && !hasCrossBarline) {
      console.log(`  SKIP (within-measure): [${i}] ${entry.pitch} (${entry.jpNum}) + ${dashes} dash(es)`);
    } else if (dashes > 0 && hasCrossBarline) {
      console.log(`  BUG? tieStart with barline but no arc: [${i}] ${entry.pitch} (${entry.jpNum})`);
    }
  }
}
if (tieArcCount === 0) console.log('  (none)');

console.log(`\n=== Summary: ${slurArcCount} slur arcs, ${tieArcCount} tie arcs ===\n`);
