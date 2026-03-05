import { ParsedNote } from '../types';
import { Note } from 'tonal';
import { createStructureItem, calculateJianpu } from './transforms';

export const parseMusicXML = (xmlContent: string): ParsedNote[] => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
  const notes: ParsedNote[] = [];
  
  // Only parse the first <part> to avoid mixing multiple instruments
  const firstPart = xmlDoc.querySelector("part");
  if (!firstPart) return notes;
  const measures = Array.from(firstPart.querySelectorAll("measure"));
  let measureStartTime = 0;
  let currentFifths = 0; // Default to C
  let currentDivisions = 1; // Persist across measures (MusicXML spec: divisions only appears when changed)

  // Beam tracking — assigns sequential IDs to beam groups (level-1 beams).
  let nextBeamGroupId = 1;
  let activeBeamGroupId = 0; // 0 = not in a beam group

  measures.forEach((measure) => {
    // Get divisions for this measure (update only if present)
    const attrNode = measure.querySelector('attributes');
    
    if (attrNode) {
        const divNode = attrNode.querySelector('divisions');
        if (divNode && divNode.textContent) currentDivisions = parseInt(divNode.textContent, 10);
        
        const keyNode = attrNode.querySelector('key > fifths');
        if (keyNode && keyNode.textContent) currentFifths = parseInt(keyNode.textContent, 10);
    }

    const divisions = currentDivisions;

    const children = Array.from(measure.children);
    let currentOffset = 0;
    let maxOffset = 0; // Track the furthest point reached in this measure
    let previousNoteStartTime = measureStartTime; // Track for chord notes

    children.forEach((child) => {
      if (child.tagName === 'note') {
        const rest = child.querySelector('rest');
        const chord = child.querySelector('chord') !== null;
        const durationNode = child.querySelector('duration');
        const duration = durationNode ? parseInt(durationNode.textContent || '0', 10) : 0;
        
        const pitch = child.querySelector('pitch');
        const voice = parseInt(child.querySelector('voice')?.textContent || '1', 10);
        
        // Dot check
        const dotNode = child.querySelector('dot');
        const isDotted = dotNode !== null;
        
        const typeNode = child.querySelector('type');
        const noteType = typeNode ? typeNode.textContent : '';
        
        // Tie detection: <tie type="stop"/> means this note continues a previous tie
        const ties = Array.from(child.querySelectorAll('tie'));
        const isTieStop = ties.some(t => t.getAttribute('type') === 'stop');

        // Beam detection: <beam number="1">begin|continue|end</beam>
        // Only track level-1 beams (which define the grouping for jianpu underlines).
        const beam1 = Array.from(child.querySelectorAll('beam'))
          .find(b => b.getAttribute('number') === '1');
        const beam1Type = beam1?.textContent?.trim() ?? '';

        // Slur detection: <notations><slur type="start|stop" /></notations>
        const slurElements = Array.from(child.querySelectorAll('slur'));
        const hasSlurStart = slurElements.some(s => s.getAttribute('type') === 'start');
        const hasSlurStop = slurElements.some(s => s.getAttribute('type') === 'stop');

        // Tied arc detection: <notations><tied type="start|stop" /></notations>
        // Visual arcs for tied notes (in addition to dashes for note extension)
        const tiedElements = Array.from(child.querySelectorAll('tied'));
        const hasTiedStart = tiedElements.some(t => t.getAttribute('type') === 'start');
        const hasTiedStop = tiedElements.some(t => t.getAttribute('type') === 'stop');
        
        // Only parse voice 1 (right hand / melody).
        // Left hand (voice 5 in piano scores) is skipped — guqin arrangement
        // focuses on the melodic line.
        if (voice > 1) {
           if (!chord) currentOffset += duration;
           maxOffset = Math.max(maxOffset, currentOffset);
           return;
        }

        // Rhythm Calculation
        const quarterDuration = divisions;
        const beats = duration / quarterDuration; 
        
        let underlineCount = 0;
        if (noteType === 'eighth') underlineCount = 1;
        else if (noteType === '16th') underlineCount = 2;
        else if (noteType === '32nd') underlineCount = 3;
        // Quarters and Halves have 0 underlines

        let noteStartTime = measureStartTime + currentOffset;
        
        // MusicXML <chord/> means "this note starts at the same time as the
        // previous note".  Since we already advanced currentOffset for the
        // previous non-chord note, we must reuse its startTime instead.
        if (chord) {
          noteStartTime = previousNoteStartTime;
        } else {
          previousNoteStartTime = noteStartTime;
        }

        let noteData: ParsedNote = {
          step: '', octave: 0, alter: 0, duration,
          type: noteType || '',
          isRest: !!rest,
          isBarline: false,
          isDash: false,
          voice, staff: 1, chord,
          pitchName: '',
          absolutePitch: 0,
          startTime: noteStartTime,
          jianpu: { number: '0', octave: 0, accidental: '', underlineCount, dot: isDotted }
        };

        if (pitch) {
          const step = pitch.querySelector('step')?.textContent || 'C';
          const octave = parseInt(pitch.querySelector('octave')?.textContent || '4', 10);
          const alter = parseInt(pitch.querySelector('alter')?.textContent || '0', 10);
          noteData.step = step; noteData.octave = octave; noteData.alter = alter;
          // Build pitch name for tonal: e.g. "C4", "F#5", "Bb3"
          const accStr = alter > 0 ? '#'.repeat(alter) : alter < 0 ? 'b'.repeat(-alter) : '';
          const tonalPitchName = `${step}${accStr}${octave}`;
          noteData.absolutePitch = Note.midi(tonalPitchName) ?? 0;
          
          noteData.jianpu = { 
              ...calculateJianpu(noteData.absolutePitch, currentFifths, false),
              underlineCount,
              dot: isDotted
          };
        } else if (rest) {
           noteData.jianpu = {
               ...calculateJianpu(0, currentFifths, true),
               underlineCount,
               dot: isDotted
           };
        }

        // Store beat count for downstream dash generation
        noteData.beats = beats;

        // Mark tie continuations — don't re-attack these on guqin.
        // Dash generation is deferred to generateDashes() after chord reduction
        // so that multi-voice duplicate dashes are avoided.
        if (isTieStop) {
            noteData.isTied = true;
        }

        // Beam group assignment (only for voice 1 notes that passed the filter).
        // <beam number="1"> begin/continue/end defines the grouping.
        if (beam1Type === 'begin') {
            activeBeamGroupId = nextBeamGroupId++;
            noteData.beamGroupId = activeBeamGroupId;
        } else if ((beam1Type === 'continue' || beam1Type === 'end') && activeBeamGroupId > 0) {
            noteData.beamGroupId = activeBeamGroupId;
            if (beam1Type === 'end') activeBeamGroupId = 0;
        }

        // Slur and tie arc markers — produce DIFFERENT visual arcs in jianpu.
        // <slur> = legato phrasing arc between different pitches (above the line).
        // <tied> = sustain arc between same-pitch notes (below the line, cross-barline).
        if (hasSlurStart) noteData.slurStart = true;
        if (hasSlurStop) noteData.slurStop = true;
        if (hasTiedStart) noteData.tieStart = true;
        if (hasTiedStop) noteData.tieStop = true;

        notes.push(noteData);

        if (!chord) {
           currentOffset += duration;
           maxOffset = Math.max(maxOffset, currentOffset);
        }

      } else if (child.tagName === 'backup') {
        const duration = parseInt(child.querySelector('duration')?.textContent || '0', 10);
        currentOffset -= duration;
      } else if (child.tagName === 'forward') {
        const duration = parseInt(child.querySelector('duration')?.textContent || '0', 10);
        currentOffset += duration;
        maxOffset = Math.max(maxOffset, currentOffset);
      }
    });

    // Use maxOffset for measure duration to handle multi-voice backup correctly
    notes.push(createStructureItem('bar', measureStartTime + maxOffset));
    measureStartTime += maxOffset; 
  });

  // Diagnostic: log what was parsed
  if (import.meta.env.DEV) {
    const slurStarts = notes.filter(n => n.slurStart).length;
    const slurStops = notes.filter(n => n.slurStop).length;
    const tieStarts = notes.filter(n => n.tieStart).length;
    const tieStops = notes.filter(n => n.tieStop).length;
    const tiedNotes = notes.filter(n => n.isTied).length;
    const beamedNotes = notes.filter(n => n.beamGroupId).length;
    const beamGroups = new Set(notes.map(n => n.beamGroupId).filter(Boolean)).size;
    console.log(`[Parser] notes=${notes.length}, slurStart=${slurStarts}, slurStop=${slurStops}, tieStart=${tieStarts}, tieStop=${tieStops}, isTied=${tiedNotes}, beamedNotes=${beamedNotes}, beamGroups=${beamGroups}`);
  }

  return notes;
};
