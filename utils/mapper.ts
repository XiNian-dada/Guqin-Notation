import { GuqinNote, GuqinTuning, HandTechnique, LeftHand, ParsedNote, RightHand } from '../types';
import { TUNINGS } from '../constants';

/**
 * Semitone-to-Hui mapping based on guqin string physics.
 * 
 * Hui positions (fraction of string length from 岳山):
 *   Hui 13: 7/8, Hui 12: 5/6, Hui 11: 4/5, Hui 10: 3/4,
 *   Hui 9: 2/3, Hui 8: 3/5, Hui 7: 1/2, Hui 6: 2/5,
 *   Hui 5: 1/3, Hui 4: 1/4
 * 
 * Sub-positions use "X.Y" notation = from Hui X, Y/10 toward Hui (X+1).
 * Semitone = 12 × log2(1 / string_fraction).
 */
const HUI_OFFSETS: Record<number, string> = {
  1:  '十三外',  // m2  — just past Hui 13 toward nut
  2:  '十三',    // M2  — Hui 13 (7/8, ~2.3 semitones)
  3:  '十二',    // m3  — Hui 12 (5/6, ~3.2 semitones)
  4:  '十一',    // M3  — Hui 11 (4/5, ~3.9 semitones)
  5:  '十',      // P4  — Hui 10 (3/4, exact 5.0 semitones)
  6:  '九.五',   // TT  — between Hui 9 & 10
  7:  '九',      // P5  — Hui 9  (2/3, ~7.0 semitones)
  8:  '八.四',   // m6  — between Hui 8 & 9
  9:  '八',      // M6  — Hui 8  (3/5, ~8.8 semitones)
  10: '七.六',   // m7  — verified ✓
  11: '七.三',   // M7  — verified ✓
  12: '七',      // P8  — Hui 7  (1/2, exact 12.0 semitones)
  13: '六.七',   // m9  — between Hui 6 & 7
  14: '六.四',   // M9  — verified ✓
  15: '六.二',   // m10 — verified ✓
  16: '六',      // M10 — Hui 6  (2/5, ~15.9 semitones)
  17: '五.六',   // P11 — between Hui 5 & 6 (was incorrectly '五.九')
  18: '五.三',   // A11 — between Hui 5 & 6
  19: '五',      // P12 — Hui 5  (1/3, ~19.0 semitones)
  20: '四.八',   // m13 — between Hui 4 & 5
  21: '四.五',   // M13 — between Hui 4 & 5
  22: '四.三',   // m14 — between Hui 4 & 5
  23: '四.一',   // M14 — between Hui 4 & 5
  24: '四',      // P15 — Hui 4  (1/4, exact 24.0 semitones)
};

/**
 * Build a dynamic solfege→string map from the tuning's solfege string.
 * e.g. "5 6 1 2 3 5 6" → { '5': [1,6], '6': [2,7], '1': [3], '2': [4], '3': [5] }
 */
const buildSolfegeMap = (tuning: GuqinTuning): Record<string, number[]> => {
  const solfegeNotes = tuning.solfege.split(' '); // e.g. ['5','6','1','2','3','5','6']
  const map: Record<string, number[]> = {};
  solfegeNotes.forEach((note, index) => {
    if (!map[note]) map[note] = [];
    map[note].push(index + 1); // string numbers are 1-based
  });
  return map;
};

interface Position {
  string: number;
  hui: string;
  technique: HandTechnique;
  cost: number; // Lower is better
}

/* ─── Sub-functions ──────────────────────────────────────────────────── */

/**
 * Find open-string (散音) candidates for a given pitch.
 * Matches by solfege number AND octave proximity to the open string pitch.
 */
function findOpenStringCandidates(
  midi: number,
  jianpuNum: string,
  solfegeMap: Record<string, number[]>,
  tuningPitches: number[],
  lastString: number,
): Position[] {
  const candidates: Position[] = [];
  const openStringIndices = solfegeMap[jianpuNum];
  if (!openStringIndices) return candidates;

  for (const strIdx of openStringIndices) {
    const openMidi = tuningPitches[strIdx - 1];
    const pitchClassMatch = (midi % 12) === (openMidi % 12);
    const octaveDiff = Math.abs(midi - openMidi);

    if (pitchClassMatch && octaveDiff <= 12) {
      const exactMatch = (midi === openMidi) ? 0 : 1;
      const dist = Math.abs(strIdx - lastString);
      candidates.push({
        string: strIdx,
        hui: '',
        technique: HandTechnique.San,
        cost: exactMatch + (dist * 0.1),
      });
    }
  }
  return candidates;
}

/**
 * Find stopped-string (按音) candidates for a given pitch.
 * Also includes exact open-string matches as backup.
 */
function findStoppedCandidates(
  midi: number,
  tuningPitches: number[],
): Position[] {
  const candidates: Position[] = [];

  for (let index = 0; index < tuningPitches.length; index++) {
    const openMidi = tuningPitches[index];
    const stringNum = index + 1;

    // Exact open string (backup to solfege-based Strategy A)
    if (midi === openMidi) {
      candidates.push({
        string: stringNum, hui: '',
        technique: HandTechnique.San, cost: 0,
      });
    }

    // Stopped positions
    const diff = midi - openMidi;
    if (diff > 0 && diff <= 24) {
      let matchedHui = '';
      let costPenalty = 10; // Stopped notes are "more work" than open strings

      if (HUI_OFFSETS[diff]) {
        matchedHui = HUI_OFFSETS[diff];
      } else {
        // Fuzzy match closest hui
        const offsets = Object.keys(HUI_OFFSETS).map(Number);
        const closest = offsets.reduce((prev, curr) =>
          Math.abs(curr - diff) < Math.abs(prev - diff) ? curr : prev,
        );
        if (Math.abs(closest - diff) <= 1) {
          matchedHui = HUI_OFFSETS[closest];
          costPenalty += 2; // Slight penalty for fuzzy match
        }
      }

      if (matchedHui) {
        candidates.push({
          string: stringNum, hui: matchedHui,
          technique: HandTechnique.An, cost: costPenalty,
        });
      }
    }
  }
  return candidates;
}

/**
 * Select the best candidate position, filtering out strings already used
 * in the current chord group.
 */
function selectBestCandidate(
  candidates: Position[],
  chordUsedStrings: Set<number>,
): Position {
  const available = candidates.filter(c => !chordUsedStrings.has(c.string));
  const pool = available.length > 0 ? available : candidates;
  pool.sort((a, b) => a.cost - b.cost);

  if (pool.length === 0) {
    return { string: 7, hui: '外', technique: HandTechnique.An, cost: 999 };
  }
  return pool[0];
}

/**
 * Assign right-hand and left-hand techniques based on string and hui position.
 */
function assignHandTechniques(selected: Position): {
  rightHand: RightHand;
  leftHand: LeftHand;
} {
  // Strings 1-5 usually Gou (inward), 6-7 usually Tiao (outward)
  const rightHand = selected.string <= 5 ? RightHand.Gou : RightHand.Tiao;

  let leftHand = LeftHand.None;
  if (selected.technique === HandTechnique.An) {
    if (selected.hui.includes('十') || selected.hui === '九') {
      leftHand = LeftHand.Da;   // Thumb for lower positions
    } else {
      leftHand = LeftHand.Ming; // Ring finger for upper positions
    }
  }

  return { rightHand, leftHand };
}

/* ─── Main mapping function ──────────────────────────────────────────── */

export const mapNotesToGuqin = (notes: ParsedNote[], tuningPitches: number[], tuning?: GuqinTuning): GuqinNote[] => {
  let lastString = 7;
  const activeTuning = tuning || TUNINGS[0];
  const solfegeMap = buildSolfegeMap(activeTuning);

  const result: GuqinNote[] = [];
  let chordUsedStrings: Set<number> = new Set();

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];

    if (!note.chord) chordUsedStrings = new Set();

    // Pass through structural items unchanged
    if (note.isBarline || note.isDash || note.isRest) {
      result.push({
        originalNote: note,
        string: 0, hui: '', technique: HandTechnique.Empty,
        rightHand: RightHand.None, leftHand: LeftHand.None, isValid: true,
      });
      continue;
    }

    const midi = note.absolutePitch;
    const jianpuNum = note.jianpu.number;

    // Collect candidates from both strategies
    const candidates: Position[] = [
      ...findOpenStringCandidates(midi, jianpuNum, solfegeMap, tuningPitches, lastString),
      ...findStoppedCandidates(midi, tuningPitches),
    ];

    const selected = selectBestCandidate(candidates, chordUsedStrings);
    lastString = selected.string;
    chordUsedStrings.add(selected.string);

    const { rightHand, leftHand } = assignHandTechniques(selected);

    result.push({
      originalNote: note,
      string: selected.string,
      hui: selected.hui,
      technique: selected.technique,
      rightHand,
      leftHand,
      isValid: true,
    });
  }

  return result;
};