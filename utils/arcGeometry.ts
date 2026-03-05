/**
 * Arc geometry calculation for slur and tie SVG overlays.
 *
 * Extracted from ScoreViewer.tsx so this pure-math logic can be
 * tested and evolved independently of the React component.
 */
import { GuqinNote } from '../types';

/* ─── Types ──────────────────────────────────────────────────────────── */

/** A note (or pre-grouped chord) ready for layout, with a sequential index. */
export interface DisplayEntry {
  note: GuqinNote;
  chordNotes?: GuqinNote[];
  index: number; // sequential index used for arc DOM lookup
}

export interface SlurArc {
  d: string;              // SVG path data
  type: 'slur' | 'tie';  // slur = above, tie = below
}

/* ─── Constants ──────────────────────────────────────────────────────── */

/** Threshold (px) for detecting whether two note elements are on the same row. */
const SAME_ROW_THRESHOLD = 30;

/** Slur (phrasing) arc geometry */
const SLUR_MAX_HEIGHT = 22;
const SLUR_HEIGHT_RATIO = 0.12;
const SLUR_HEIGHT_BASE = 8;

/** Tie (sustain) arc geometry */
const TIE_MAX_HEIGHT = 12;
const TIE_HEIGHT_RATIO = 0.06;
const TIE_HEIGHT_BASE = 4;

/** Inset from container edges for cross-row split arcs */
const EDGE_INSET = 16;

/** Small offset (px) to keep arcs from overlapping the number text */
const ANCHOR_OFFSET = 2;

/* ─── Public API ─────────────────────────────────────────────────────── */

/**
 * Build arcs from two separate sources:
 *
 * 1. **Slurs** (`<slur>` elements): stack-based slurStart/slurStop matching.
 *    Draw above the number line as a prominent phrasing arc.
 *
 * 2. **Cross-barline ties**: pattern-based detection.
 *    When a note with `tieStart` is followed by dashFromTie dashes AND a barline
 *    sits between the note and the dashes, draw a subtle arc below the number
 *    line to indicate the sustain bridges the barline.
 *    Within-measure ties (no barline between note and dashes) need no arc —
 *    the dashes themselves are the visual representation.
 */
export function calculateArcs(
  entries: DisplayEntry[],
  container: HTMLElement,
): SlurArc[] {
  const arcs: SlurArc[] = [];

  // ── Slur arcs: stack-based matching (from <slur> elements only) ──
  const slurStack: number[] = [];
  for (const entry of entries) {
    if (entry.note.originalNote.slurStop && slurStack.length > 0) {
      const startIdx = slurStack.pop()!;
      const arc = buildArc(startIdx, entry.index, container, 'slur');
      if (arc) arcs.push(arc);
    }
    if (entry.note.originalNote.slurStart) {
      slurStack.push(entry.index);
    }
  }

  // ── Cross-barline tie arcs ──
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const orig = entry.note.originalNote;

    if (orig.isBarline || orig.isDash || orig.isRest || !orig.tieStart) continue;

    let j = i + 1;
    let lastDashIdx = -1;
    let barlineBeforeDashes = false;
    let foundDashFromTie = false;

    while (j < entries.length) {
      const next = entries[j].note.originalNote;
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
      const arc = buildArc(entry.index, entries[lastDashIdx].index, container, 'tie');
      if (arc) arcs.push(arc);
    }
  }

  if (import.meta.env.DEV && arcs.length > 0) {
    console.log(
      `[arcGeometry] ${arcs.length} arcs: ` +
      `${arcs.filter(a => a.type === 'slur').length} slur, ` +
      `${arcs.filter(a => a.type === 'tie').length} tie`,
    );
  }

  return arcs;
}

/* ─── Internal helpers ───────────────────────────────────────────────── */

function buildArc(
  startIdx: number,
  endIdx: number,
  container: HTMLElement,
  type: 'slur' | 'tie',
): SlurArc | null {
  const startEl = container.querySelector(`[data-note-idx="${startIdx}"]`) as HTMLElement | null;
  const endEl   = container.querySelector(`[data-note-idx="${endIdx}"]`)   as HTMLElement | null;
  if (!startEl || !endEl) return null;

  const cr = container.getBoundingClientRect();
  const sr = startEl.getBoundingClientRect();
  const er = endEl.getBoundingClientRect();

  const x1 = sr.left - cr.left + sr.width / 2;
  const x2 = er.left - cr.left + er.width / 2;

  // data-note-idx is on the jianpu number area (~2.5rem / 40px tall).
  // Slur arcs: above (top - offset), Tie arcs: below (bottom + offset)
  const isSlur = type === 'slur';
  const y1 = isSlur
    ? sr.top - cr.top - ANCHOR_OFFSET
    : sr.top - cr.top + sr.height + ANCHOR_OFFSET;
  const y2 = isSlur
    ? er.top - cr.top - ANCHOR_OFFSET
    : er.top - cr.top + er.height + ANCHOR_OFFSET;

  const span = Math.abs(x2 - x1);
  const arcH = isSlur
    ? Math.min(SLUR_MAX_HEIGHT, span * SLUR_HEIGHT_RATIO + SLUR_HEIGHT_BASE)
    : Math.min(TIE_MAX_HEIGHT,  span * TIE_HEIGHT_RATIO  + TIE_HEIGHT_BASE);

  // Row detection uses raw positions (before anchor offset)
  const rawY1 = sr.top - cr.top;
  const rawY2 = er.top - cr.top;
  const sameRow = Math.abs(rawY1 - rawY2) < SAME_ROW_THRESHOLD;

  if (sameRow) {
    return sameRowArc(x1, y1, x2, y2, arcH, isSlur, type);
  }
  return crossRowArc(x1, y1, x2, y2, arcH, isSlur, cr.width, type);
}

function sameRowArc(
  x1: number, y1: number, x2: number, y2: number,
  arcH: number, isSlur: boolean, type: 'slur' | 'tie',
): SlurArc {
  const midX = (x1 + x2) / 2;
  const cpY = isSlur
    ? Math.min(y1, y2) - arcH
    : Math.max(y1, y2) + arcH;
  return { d: `M ${x1} ${y1} Q ${midX} ${cpY} ${x2} ${y2}`, type };
}

function crossRowArc(
  x1: number, y1: number, x2: number, y2: number,
  arcH: number, isSlur: boolean, containerWidth: number, type: 'slur' | 'tie',
): SlurArc {
  const rightEdge = containerWidth - EDGE_INSET;
  const leftEdge  = EDGE_INSET;
  const sign = isSlur ? -1 : 1;

  const cpY1 = y1 + sign * arcH;
  const cpY2 = y2 + sign * arcH;
  const d1 = `M ${x1} ${y1} Q ${(x1 + rightEdge) / 2} ${cpY1} ${rightEdge} ${y1}`;
  const d2 = `M ${leftEdge} ${y2} Q ${(leftEdge + x2) / 2} ${cpY2} ${x2} ${y2}`;
  return { d: `${d1} ${d2}`, type };
}
