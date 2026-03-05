import React from 'react';
import { GuqinNote } from '../types';
import { JianpuNumberDisplay, JianzipuFontDisplay } from './JianzipuChar';
import { DisplayEntry } from '../utils/arcGeometry';

/** A single display unit in a beam group — extends DisplayEntry with the same shape. */
export type BeamEntry = DisplayEntry;

interface Props {
  entries: BeamEntry[];
}

/**
 * Renders a group of beamed notes with connected underlines (减时线).
 *
 * Layout: CSS Grid — one column per entry, 3 rows:
 *   1. Jianpu numbers (octave dots, accidental, number, aug dot)
 *   2. Underlines container (flex column per cell: 2px-high bars, connected
 *      across columns because columnGap = 0 and cells stretch to fill)
 *   3. Jianzipu font characters
 *
 * Within row 2, each cell renders N bars (N = maxLevel). A bar is visible
 * (colored) only if the note's underlineCount exceeds that level,
 * so mixed-type groups (e.g. eighth + sixteenth) render correctly.
 */
export const BeamGroup: React.FC<Props> = ({ entries }) => {
  const n = entries.length;
  if (n === 0) return null;

  // Maximum underline depth across all entries (1 = eighth, 2 = 16th, 3 = 32nd)
  const maxLevel = Math.max(...entries.map(e => e.note.originalNote.jianpu.underlineCount));
  const levels = Math.max(maxLevel, 0);

  return (
    <div
      className="inline-grid"
      style={{
        gridTemplateColumns: `repeat(${n}, auto)`,
        gridTemplateRows: 'auto auto auto',
        columnGap: 0,
        rowGap: 0,
        alignItems: 'stretch',
      }}
    >
      {/* Row 1 — Jianpu numbers */}
      {entries.map((entry, i) => (
        <div
          key={`jianpu-${i}`}
          data-note-idx={entry.index}
          className="flex flex-col items-center justify-end px-2 pb-0 self-end"
          style={{ gridRow: 1, gridColumn: i + 1 }}
        >
          <JianpuNumberDisplay note={entry.note} chordNotes={entry.chordNotes} />
        </div>
      ))}

      {/* Row 2 — Connected underlines per column
          Each cell is a flex column of 2px bars. Since columnGap = 0 and
          cells stretch to fill the column width, the bars from adjacent
          columns form one continuous line across the beam group. */}
      {entries.map((entry, i) => {
        const noteLevel = entry.note.originalNote.jianpu.underlineCount;
        return (
          <div
            key={`ul-${i}`}
            className="flex flex-col items-stretch"
            style={{ gridRow: 2, gridColumn: i + 1, paddingTop: 4 }}
          >
            {Array.from({ length: levels }, (_, lvl) => (
              <div
                key={lvl}
                style={{
                  height: 2,
                  marginTop: lvl > 0 ? 3 : 0,
                  backgroundColor: noteLevel > lvl ? '#1c1917' : 'transparent',
                }}
              />
            ))}
          </div>
        );
      })}

      {/* Row 3 — Jianzipu characters */}
      {entries.map((entry, i) => (
        <div
          key={`jianzipu-${i}`}
          className="px-2 self-start"
          style={{ gridRow: 3, gridColumn: i + 1, marginTop: 4 }}
        >
          <JianzipuFontDisplay note={entry.note} chordNotes={entry.chordNotes} />
        </div>
      ))}
    </div>
  );
};
