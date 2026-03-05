import React from 'react';
import { GuqinNote } from '../types';
import { buildJianzipuText, buildChordJianzipuText } from '../utils/jianzipuFont';

interface Props {
  note: GuqinNote;
  chordNotes?: GuqinNote[]; // For chord groups (simultaneous notes)
  noteIdx?: number; // Sequential index for arc DOM lookup
}

/* ─── Shared sub-components (exported for BeamGroup) ───────────────────── */

const OctaveDots: React.FC<{ count: number; position: 'top' | 'bottom' }> = ({ count, position }) => {
    if (!count) return null;
    return (
        <div className={`flex justify-center gap-[2px] leading-[0] ${position === 'top' ? 'mb-[1px]' : 'mt-[0px]'}`}>
            {Array.from({ length: Math.abs(count) }).map((_, i) => (
                <div key={i} className="w-[4px] h-[4px] bg-stone-900 rounded-full" />
            ))}
        </div>
    );
};

/**
 * Renders the Jianpu number, octave dots, accidental and augmentation dot.
 * Does NOT render underlines — those are the caller's responsibility.
 */
export const JianpuNumberDisplay: React.FC<{
  note: GuqinNote;
  chordNotes?: GuqinNote[];
}> = ({ note, chordNotes }) => {
  const { jianpu } = note.originalNote;

  // Rest
  if (note.originalNote.isRest) {
    return (
      <div className="flex flex-col items-center justify-end w-full">
        <div className="relative">
          <span className="text-[1.4rem] font-bold font-serif leading-none text-stone-900">0</span>
          {jianpu.dot && (
            <div className="absolute top-1 -right-2 w-[3.5px] h-[3.5px] bg-stone-900 rounded-full" />
          )}
        </div>
      </div>
    );
  }

  // Chord — render multiple numbers side by side
  if (chordNotes && chordNotes.length > 1) {
    const sorted = [...chordNotes].sort((a, b) => a.string - b.string);
    return (
      <div className="flex gap-1 items-center justify-center">
        {sorted.map((cn, ci) => (
          <span key={ci} className="text-[1.2rem] font-extrabold font-serif text-stone-900">
            {cn.originalNote.jianpu.number}
          </span>
        ))}
      </div>
    );
  }

  // Regular note
  const accidentalMap: Record<string, string> = { '#': '♯', 'b': '♭' };
  const displayAccidental = accidentalMap[jianpu.accidental] || jianpu.accidental;

  return (
    <div className="flex flex-col items-center">
      <OctaveDots count={jianpu.octave > 0 ? jianpu.octave : 0} position="top" />
      <div className="relative flex items-center justify-center leading-none">
        {displayAccidental && (
          <span className="absolute -left-3 top-[2px] text-[10px] font-bold text-stone-700">
            {displayAccidental}
          </span>
        )}
        <span className="text-[1.5rem] font-extrabold font-serif text-stone-900">
          {jianpu.number}
        </span>
        {jianpu.dot && (
          <span className="absolute -right-3 top-[6px] w-[4px] h-[4px] bg-stone-900 rounded-full" />
        )}
      </div>
      <OctaveDots count={jianpu.octave < 0 ? jianpu.octave : 0} position="bottom" />
    </div>
  );
};

/**
 * Renders the Jianzipu font character for a note or chord.
 * For rests, renders a height spacer.
 */
export const JianzipuFontDisplay: React.FC<{
  note: GuqinNote;
  chordNotes?: GuqinNote[];
}> = ({ note, chordNotes }) => {
  // Rest — just a spacer matching jianzipu height
  if (note.originalNote.isRest) {
    return <div className="h-[4rem]" />;
  }

  // Chord
  if (chordNotes && chordNotes.length > 1) {
    const sorted = [...chordNotes].sort((a, b) => a.string - b.string);
    const chordFontText = buildChordJianzipuText(sorted);
    const fallbackTexts = chordFontText
      ? null
      : sorted.map(cn => buildJianzipuText(cn)).filter(Boolean);

    return (
      <div className="min-w-[4.5rem] min-h-[4rem] flex flex-col items-center justify-start gap-0 overflow-visible">
        {chordFontText ? (
          <span className="jianzipu-font text-[3.5rem] leading-none text-stone-900">{chordFontText}</span>
        ) : fallbackTexts ? (
          fallbackTexts.map((text, ci) => (
            <span key={ci} className="jianzipu-font text-[2.5rem] leading-[1.1] text-stone-900">{text}</span>
          ))
        ) : (
          <span className="text-sm text-stone-400">?</span>
        )}
      </div>
    );
  }

  // Single note
  const fontText = buildJianzipuText(note);
  return (
    <div className="min-w-[3.5rem] min-h-[4rem] flex items-start justify-center overflow-visible">
      {fontText ? (
        <span className="jianzipu-font text-[3.5rem] leading-none text-stone-900">{fontText}</span>
      ) : (
        <span className="text-sm text-stone-400">?</span>
      )}
    </div>
  );
};

/* ─── Underlines (for non-beamed notes only) ───────────────────────────── */

const IndividualUnderlines: React.FC<{ count: number }> = ({ count }) => {
  if (count <= 0) return null;
  return (
    <div className="flex flex-col gap-[3px] mt-[4px] w-[1.2rem] items-center">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-full h-[2px] bg-stone-900" />
      ))}
    </div>
  );
};

/* ─── Main component (unchanged public API) ────────────────────────────── */

export const JianzipuChar: React.FC<Props> = ({ note, chordNotes, noteIdx }) => {
  // data-note-idx is placed on the jianpu number area so arc positioning
  // anchors to the number line, not the full element including jianzipu font.
  const idxAttr = noteIdx != null ? { 'data-note-idx': noteIdx } : {};

  // 1. Barline
  if (note.originalNote.isBarline) {
    return <div {...idxAttr} className="w-[1px] h-[7rem] bg-stone-800 mx-2 self-start mt-1" />;
  }

  // 2. Dash (duration extension)
  if (note.originalNote.isDash) {
    return (
      <div className="inline-flex flex-col items-center justify-start w-[2.5rem] mx-1 relative top-[-4px]">
        <div {...idxAttr} className="flex flex-col items-center justify-center h-[2.5rem] w-full">
          <span className="text-xl font-bold text-stone-900 scale-x-150">—</span>
        </div>
        <div className="h-[4rem]" />
      </div>
    );
  }

  // 3. Rest
  if (note.originalNote.isRest) {
    const { jianpu } = note.originalNote;
    return (
      <div className="inline-flex flex-col items-center justify-start w-[3.5rem] relative">
        <div {...idxAttr} className="flex flex-col items-center justify-end h-[2.5rem] w-full pb-1">
          <JianpuNumberDisplay note={note} />
          <IndividualUnderlines count={jianpu.underlineCount} />
        </div>
        <JianzipuFontDisplay note={note} />
      </div>
    );
  }

  // 4. Chord group (multiple simultaneous notes)
  if (chordNotes && chordNotes.length > 1) {
    const { jianpu } = note.originalNote;
    return (
      <div className="inline-flex flex-col items-center justify-start align-top relative px-2">
        <div {...idxAttr} className="flex flex-col items-center justify-end h-[2.5rem] w-full relative mb-1">
          <JianpuNumberDisplay note={note} chordNotes={chordNotes} />
          <IndividualUnderlines count={jianpu.underlineCount} />
        </div>
        <JianzipuFontDisplay note={note} chordNotes={chordNotes} />
      </div>
    );
  }

  // 5. Regular note — render via font
  const { jianpu } = note.originalNote;
  return (
    <div className="inline-flex flex-col items-center justify-start align-top relative px-2">
      <div {...idxAttr} className="flex flex-col items-center justify-end h-[2.5rem] w-full relative mb-1">
        <JianpuNumberDisplay note={note} />
        <IndividualUnderlines count={jianpu.underlineCount} />
      </div>
      <JianzipuFontDisplay note={note} />
    </div>
  );
};