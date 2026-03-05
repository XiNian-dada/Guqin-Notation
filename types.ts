export interface ParsedNote {
  step: string;
  octave: number;
  alter: number;
  duration: number;
  type: string;
  isRest: boolean;
  
  // New structural flags
  isBarline?: boolean; // Display as |
  isDash?: boolean;    // Display as - (for duration extension)
  isTied?: boolean;    // This note is a tie continuation (don't re-attack)
  dashFromTie?: boolean; // This dash was generated from a tied note (for tie arc rendering)
  
  voice: number;
  staff: number;
  chord: boolean;
  pitchName: string;
  absolutePitch: number;
  startTime: number;
  beats?: number;      // Duration in quarter-note beats (for dash generation)

  // Beam grouping — consecutive short notes sharing connected underlines in jianpu
  beamGroupId?: number;

  // Slur markers — legato arcs in jianpu display (from <slur> elements only)
  slurStart?: boolean; // A slur begins at this note
  slurStop?: boolean;  // A slur ends at this note

  // Tie markers — sustain arcs in jianpu display (from <tied> elements only)
  tieStart?: boolean;  // A tie begins at this note (same pitch sustained forward)
  tieStop?: boolean;   // A tie ends at this note (same pitch sustained from before)

  jianpu: JianpuInfo;
}

export interface JianpuInfo {
  number: string; 
  octave: number; 
  accidental: string;
  // New rhythm info
  underlineCount: number; // 0=Quarter+, 1=Eighth, 2=16th
  dot: boolean;           // Dotted note
}

export enum HandTechnique {
  San = '散',
  An = '按',
  Fan = '泛',
  Empty = ''
}

export enum RightHand {
  Tiao = '挑',
  Gou = '勾',
  Mo = '抹',
  Ti = '剔',
  Da = '打',
  Zhai = '摘',
  None = ''
}

export enum LeftHand {
  Da = '大',
  Shi = '食',
  Zhong = '中',
  Ming = '名',
  None = ''
}

export interface GuqinNote {
  originalNote: ParsedNote;
  string: number;
  hui: string;
  huiDecimal?: number;
  technique: HandTechnique;
  rightHand: RightHand;
  leftHand: LeftHand;
  isValid: boolean;
}

export interface GuqinTuning {
  id: string;
  name: string;
  description: string;
  solfege: string; // e.g. "5 6 1 2 3 5 6"
  pitches: number[];
  fifths: number;  // Key signature in fifths notation (-1=F, 0=C, etc.)
}