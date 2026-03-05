/**
 * Post-parse transformation utilities.
 *
 * These operate on ParsedNote[] arrays AFTER initial XML parsing:
 *   - calculateJianpu: pitch → numbered-musical-notation mapping
 *   - generateDashes:  expand long / tied notes into dash items
 *   - recalculateJianpu: re-derive jianpu when key changes
 *   - createStructureItem: factory for barline / dash items
 *
 * Extracted from parser.ts to keep that module focused on XML DOM parsing.
 */
import { ParsedNote, JianpuInfo } from '../types';
import { FIFTHS_TO_KEY } from '../constants';
import { Note, Key } from 'tonal';

/* ─── Structure item factory ─────────────────────────────────────────── */

/**
 * Create a non-note structural item (barline or dash).
 */
export const createStructureItem = (
  type: 'bar' | 'dash',
  startTime: number,
  extra?: Partial<ParsedNote>,
): ParsedNote => ({
  step: '', octave: 0, alter: 0, duration: 0, type: '',
  isRest: false,
  isBarline: type === 'bar',
  isDash: type === 'dash',
  voice: 0, staff: 0, chord: false, pitchName: '', absolutePitch: 0, startTime,
  jianpu: { number: '', octave: 0, accidental: '', underlineCount: 0, dot: false },
  ...extra,
});

/* ─── Jianpu calculation ─────────────────────────────────────────────── */

/**
 * Calculate Jianpu (numbered musical notation) info from a MIDI pitch number.
 * Uses `tonal` library for music theory: key resolution, scale degrees, chromaticism.
 */
export const calculateJianpu = (midi: number, fifths: number, isRest: boolean): JianpuInfo => {
  if (isRest) {
    return { number: '0', octave: 0, accidental: '', underlineCount: 0, dot: false };
  }

  // 1. Resolve key from fifths using tonal
  const keyName = FIFTHS_TO_KEY[fifths] ?? 'C';
  const key = Key.majorKey(keyName);
  const tonicChroma = Note.chroma(key.tonic) ?? 0;
  const scaleNotes = key.scale;

  // 2. Determine "Middle 1" — the tonic instance closest to C4 (MIDI 60)
  let baseTonic = tonicChroma;
  while (baseTonic < 60) baseTonic += 12;
  if (Math.abs((baseTonic - 12) - 60) < Math.abs(baseTonic - 60)) {
    baseTonic -= 12;
  }

  // 3. Octave relative to baseTonic
  const diff = midi - baseTonic;
  const octave = Math.floor(diff / 12);

  // 4. Find scale degree using tonal's chroma matching
  const notePC = midi % 12;
  const degreeIndex = scaleNotes.findIndex(n => Note.chroma(n) === notePC);

  let number: string;
  let accidental = '';

  if (degreeIndex >= 0) {
    number = String(degreeIndex + 1);
  } else {
    // Chromatic note — try both sharp and flat interpretations
    const belowIdx = scaleNotes.findIndex(n => Note.chroma(n) === ((notePC - 1 + 12) % 12));
    const aboveIdx = scaleNotes.findIndex(n => Note.chroma(n) === ((notePC + 1) % 12));

    if (belowIdx >= 0 && aboveIdx >= 0) {
      const sharpDegree = belowIdx + 1;
      if (sharpDegree <= 2 || sharpDegree === 4 || sharpDegree === 5) {
        number = String(sharpDegree);
        accidental = '#';
      } else {
        number = String(aboveIdx + 1);
        accidental = 'b';
      }
    } else if (belowIdx >= 0) {
      number = String(belowIdx + 1);
      accidental = '#';
    } else if (aboveIdx >= 0) {
      number = String(aboveIdx + 1);
      accidental = 'b';
    } else {
      number = '?';
    }
  }

  return { number, octave, accidental, underlineCount: 0, dot: false };
};

/* ─── Jianpu recalculation ───────────────────────────────────────────── */

/**
 * Recalculate jianpu numbers for all notes using a (possibly different) key.
 * Preserves rhythm info (underlineCount, dot) from the original parse.
 */
export const recalculateJianpu = (notes: ParsedNote[], fifths: number): ParsedNote[] => {
  return notes.map(note => {
    if (note.isBarline || note.isDash) return note;
    const j = calculateJianpu(note.absolutePitch, fifths, note.isRest);
    return {
      ...note,
      jianpu: { ...j, underlineCount: note.jianpu.underlineCount, dot: note.jianpu.dot },
    };
  });
};

/* ─── Dash generation ────────────────────────────────────────────────── */

/**
 * Generate dashes for long notes and tie continuations.
 *
 * Must be called AFTER chord reduction so that multi-voice parsing
 * doesn't produce duplicate dashes at the same startTime.
 *
 * Handles chord groups (primary + chord members) as a unit:
 * - Uses the longest note's beats for dash count
 * - All-tied chords become dashes; mixed tied/non-tied keeps only non-tied
 *
 * Rules:
 * - Tied notes (isTied): replaced entirely with floor(beats) dashes
 * - Long notes (beats >= 2): append floor(beats) - 1 dashes after the note
 */
export const generateDashes = (notes: ParsedNote[]): ParsedNote[] => {
  const result: ParsedNote[] = [];
  let i = 0;
  while (i < notes.length) {
    const note = notes[i];

    if (note.isBarline || note.isDash) {
      result.push(note);
      i++;
      continue;
    }

    // Collect chord group: primary note + consecutive chord members
    const chordGroup: ParsedNote[] = [note];
    while (
      i + 1 < notes.length &&
      notes[i + 1].chord &&
      !notes[i + 1].isBarline &&
      !notes[i + 1].isDash
    ) {
      i++;
      chordGroup.push(notes[i]);
    }

    const allTied = chordGroup.every(n => n.isTied);
    const groupHasSlurStop = chordGroup.some(n => n.slurStop);
    const groupHasSlurStart = chordGroup.some(n => n.slurStart);

    if (allTied) {
      const maxBeats = Math.max(...chordGroup.map(n => n.beats ?? 0));
      const totalDashes = Math.max(1, Math.floor(maxBeats));
      for (let d = 0; d < totalDashes; d++) {
        const extra: Partial<ParsedNote> = { dashFromTie: true };
        if (d === 0 && groupHasSlurStop) extra.slurStop = true;
        if (d === totalDashes - 1 && groupHasSlurStart) extra.slurStart = true;
        result.push(createStructureItem('dash', note.startTime, extra));
      }
    } else {
      for (const cn of chordGroup) {
        if (!cn.isTied) result.push(cn);
      }
      const maxBeats = Math.max(
        ...chordGroup.filter(n => !n.isTied).map(n => n.beats ?? 0),
      );
      if (maxBeats >= 2) {
        const dashCount = Math.floor(maxBeats) - 1;
        for (let d = 0; d < dashCount; d++) {
          result.push(createStructureItem('dash', note.startTime));
        }
      }
    }

    i++;
  }
  return result;
};
