import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { GuqinNote } from '../types';
import { JianzipuChar } from './JianzipuChar';
import { BeamGroup, BeamEntry } from './BeamGroup';
import { Download, Loader2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import { TUNINGS, FIFTHS_TO_KEY } from '../constants';
import { calculateArcs, DisplayEntry, SlurArc } from '../utils/arcGeometry';

interface Props {
  notes: GuqinNote[];
  tuningName?: string;
  title?: string;
}

/* ─── Component ──────────────────────────────────────────────────────── */

export const ScoreViewer: React.FC<Props> = ({ notes, tuningName, title }) => {
  const scoreRef = useRef<HTMLDivElement>(null);
  const scoreBodyRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [slurArcs, setSlurArcs] = useState<SlurArc[]>([]);

  // Derive key signature from the tuning's fifths value
  const tuningInfo = TUNINGS.find(t => t.name === tuningName);
  const keySignature = FIFTHS_TO_KEY[tuningInfo?.fifths ?? -1] || 'F';
  const tuningSolfege = tuningInfo?.solfege || "5 6 1 2 3 5 6";
  const tuningDisplay = `1=${keySignature} (${tuningName?.split(' ')[0]}定弦 ${tuningSolfege})`;

  /* ─── Build display entries (collapse chord members) ─────────────── */
  const entries = useMemo<DisplayEntry[]>(() => {
    const result: DisplayEntry[] = [];
    let i = 0;
    let idx = 0;
    while (i < notes.length) {
      const note = notes[i];
      const chordGroup: GuqinNote[] = [note];
      while (
        i + 1 < notes.length &&
        notes[i + 1].originalNote.chord &&
        !notes[i + 1].originalNote.isBarline &&
        !notes[i + 1].originalNote.isDash
      ) {
        i++;
        chordGroup.push(notes[i]);
      }
      result.push({
        note: chordGroup[0],
        chordNotes: chordGroup.length > 1 ? chordGroup : undefined,
        index: idx++,
      });
      i++;
    }
    return result;
  }, [notes]);

  /* ─── Build render units (beam groups or standalone) ─────────────── */
  const renderUnits = useMemo<React.ReactNode[]>(() => {
    const units: React.ReactNode[] = [];
    let j = 0;
    while (j < entries.length) {
      const entry = entries[j];
      const beamId = entry.note.originalNote.beamGroupId;
      const isStructural =
        entry.note.originalNote.isBarline || entry.note.originalNote.isDash;

      if (beamId && !isStructural) {
        // Collect consecutive entries with the same beamGroupId
        const beamEntries: BeamEntry[] = [
          { note: entry.note, chordNotes: entry.chordNotes, index: entry.index },
        ];
        while (
          j + 1 < entries.length &&
          entries[j + 1].note.originalNote.beamGroupId === beamId &&
          !entries[j + 1].note.originalNote.isBarline &&
          !entries[j + 1].note.originalNote.isDash
        ) {
          j++;
          beamEntries.push({
            note: entries[j].note,
            chordNotes: entries[j].chordNotes,
            index: entries[j].index,
          });
        }
        if (beamEntries.length > 1) {
          units.push(<BeamGroup key={`bg-${j}`} entries={beamEntries} />);
        } else {
          // Single entry in a "beam group" — render as standalone
          const e = beamEntries[0];
          units.push(
            <div key={`n-${j}`}>
              <JianzipuChar note={e.note} chordNotes={e.chordNotes} noteIdx={e.index} />
            </div>
          );
        }
      } else {
        units.push(
          <div key={`n-${j}`}>
            <JianzipuChar note={entry.note} chordNotes={entry.chordNotes} noteIdx={entry.index} />
          </div>
        );
      }
      j++;
    }
    return units;
  }, [entries]);

  /* ─── Measure slur arcs after layout + font load ────────────────── */
  useEffect(() => {
    const el = scoreBodyRef.current;
    if (!el || entries.length === 0) {
      setSlurArcs([]);
      return;
    }

    const compute = () => {
      const arcs = calculateArcs(entries, el);
      setSlurArcs(arcs);
    };

    // Wait for fonts to finish loading before measuring positions
    document.fonts.ready.then(() => {
      // Extra frame delay to ensure layout is settled after font load
      requestAnimationFrame(() => {
        requestAnimationFrame(compute);
      });
    });

    // Recalculate when container resizes (e.g. window resize → reflow)
    const ro = new ResizeObserver(compute);
    ro.observe(el);

    return () => ro.disconnect();
  }, [entries]);

  /* ─── Handlers ───────────────────────────────────────────────────── */
  const handleDownload = useCallback(async () => {
    if (scoreRef.current === null) return;
    setIsDownloading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      const dataUrl = await toPng(scoreRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 3,
      });
      const link = document.createElement('a');
      link.download = `${title || 'guqin-score'}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to generate image', err);
      alert('Could not generate image. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  }, [scoreRef, title]);

  /* ─── Empty state ────────────────────────────────────────────────── */
  if (notes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-stone-400 font-serif">
        <div className="w-24 h-24 mb-6 opacity-20 border-4 border-stone-400 rounded-full flex items-center justify-center">
          <span className="text-4xl">琴</span>
        </div>
        <p className="text-lg tracking-widest text-stone-500">AWAITING SCORE</p>
        <p className="text-sm opacity-60 mt-2">Please upload a MusicXML file</p>
      </div>
    );
  }

  /* ─── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="relative flex flex-col items-center min-h-full">
      {/* Action Bar */}
      <div className="sticky top-0 z-50 mb-6 flex gap-3 print:hidden">
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex items-center gap-2 px-5 py-2.5 bg-stone-900 text-stone-50 rounded shadow-xl hover:bg-amber-900 hover:-translate-y-0.5 transition-all text-xs uppercase tracking-widest font-semibold disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
        >
          {isDownloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {isDownloading ? 'Inking...' : 'Export PNG'}
        </button>
      </div>

      {/* The Paper Sheet */}
      <div
        ref={scoreRef}
        className="relative w-full max-w-[1100px] min-h-[1200px] bg-white shadow-2xl mb-20 p-20 print:shadow-none print:p-0"
      >
        {/* Header Section */}
        <div className="flex flex-col items-center mb-12">
          <h1 className="text-5xl font-bold font-serif text-black tracking-[0.1em] mb-6">
            {title || '古琴谱'}
          </h1>
          <div className="w-full flex justify-start pl-2">
            <p className="text-sm font-serif font-bold text-black tracking-widest">
              {tuningDisplay}
            </p>
          </div>
        </div>

        {/* Score Body — relative wrapper for slur SVG overlay */}
        <div ref={scoreBodyRef} className="relative min-h-[600px]">
          <div className="flex flex-wrap items-end justify-start gap-y-10 gap-x-0 content-start">
            {renderUnits}
            {/* End Bar */}
            <div className="w-[3px] h-[6rem] bg-stone-900 mx-3 self-start mt-2" />
          </div>

          {/* SVG overlay — slur / tie arcs */}
          {slurArcs.length > 0 && (
            <svg
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{ overflow: 'visible' }}
            >
              {slurArcs.map((arc, i) => (
                <path
                  key={i}
                  d={arc.d}
                  fill="none"
                  stroke="#1c1917"
                  strokeWidth={arc.type === 'slur' ? 1.5 : 1}
                  strokeLinecap="round"
                />
              ))}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};