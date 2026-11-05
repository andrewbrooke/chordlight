// Guitar tunings: the six open strings as MIDI notes, thickest first. A custom tuning is any six
// notes in STRING_RANGE, so re-entrant tunings are allowed and "thickest" means first, not lowest.

export interface Tuning {
  id: string;
  name: string;
  notes: readonly number[];
}

export const STRINGS = 6;

/** The lowest and highest note a string can be set to. */
export const STRING_RANGE: readonly [number, number] = [28, 72];

export const TUNINGS: readonly Tuning[] = [
  { id: 'standard', name: 'Standard (E A D G B E)', notes: [40, 45, 50, 55, 59, 64] },
  { id: 'half-down', name: 'Half step down (E♭ standard)', notes: [39, 44, 49, 54, 58, 63] },
  { id: 'whole-down', name: 'Whole step down (D standard)', notes: [38, 43, 48, 53, 57, 62] },
  { id: 'drop-d', name: 'Drop D (D A D G B E)', notes: [38, 45, 50, 55, 59, 64] },
  { id: 'drop-c', name: 'Drop C (C G C F A D)', notes: [36, 43, 48, 53, 57, 62] },
  { id: 'dadgad', name: 'DADGAD (D A D G A D)', notes: [38, 45, 50, 55, 57, 62] },
  { id: 'open-g', name: 'Open G (D G D G B D)', notes: [38, 43, 50, 55, 59, 62] },
  { id: 'open-d', name: 'Open D (D A D F♯ A D)', notes: [38, 45, 50, 54, 57, 62] },
];

export const STANDARD: readonly number[] = TUNINGS[0]!.notes;

/** The preset these notes are, or undefined for a custom tuning. */
export function tuningOf(notes: readonly number[]): Tuning | undefined {
  return TUNINGS.find((t) => t.notes.every((n, i) => n === notes[i]));
}

export function isTuning(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length === STRINGS &&
    v.every((n) => Number.isInteger(n) && n >= STRING_RANGE[0] && n <= STRING_RANGE[1])
  );
}

/** Sharps and flats as guitarists usually name them, since a tuning has no key to spell from. */
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

/** `E`, or `E2` with the octave. */
export function stringName(midi: number, octave = false): string {
  const name = NAMES[((midi % 12) + 12) % 12]!;
  return octave ? `${name}${Math.floor(midi / 12) - 1}` : name;
}

/** `thickest`, `5th`, … `thinnest`, counting as guitarists do: the thinnest string is the 1st. */
export function stringLabel(index: number): string {
  if (index === 0) return '6th (thickest)';
  if (index === STRINGS - 1) return '1st (thinnest)';
  return `${STRINGS - index}${['th', 'st', 'nd', 'rd'][STRINGS - index] ?? 'th'}`;
}
