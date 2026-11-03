// Notes are MIDI numbers. A spelling is a letter plus an accidental, chosen by the key.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export const LETTER_PC = [0, 2, 4, 5, 7, 9, 11] as const;

export interface Spelling {
  /** 0..6, C to B. */
  letter: number;
  /** -1 flat, +1 sharp. */
  acc: number;
}

export const pcOf = (n: number): number => ((n % 12) + 12) % 12;
export const letterOf = (n: number): number => ((n % 7) + 7) % 7;

export function pcOfSpelling(s: Spelling): number {
  return pcOf(LETTER_PC[s.letter]! + s.acc);
}

/** The accidental that puts `letter` on `pc`, in -6..5. */
export function accFor(letter: number, pc: number): number {
  return ((pc - LETTER_PC[letterOf(letter)]! + 18) % 12) - 6;
}

export function spellOnLetter(pc: number, letter: number): Spelling {
  return { letter: letterOf(letter), acc: accFor(letter, pc) };
}

/** Respells a double accidental on a neighbouring letter (B𝄫 → A). */
export function simplify(s: Spelling): Spelling {
  if (Math.abs(s.acc) < 2) return s;
  const pc = pcOfSpelling(s);
  for (const d of [1, -1]) {
    const acc = accFor(s.letter + d, pc);
    if (Math.abs(acc) <= 1) return { letter: letterOf(s.letter + d), acc };
  }
  return s;
}

const SIGN: Record<number, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };

export function nameOf(s: Spelling): string {
  return LETTERS[s.letter]! + (SIGN[s.acc] ?? '?');
}

/** `C`, `C#`, `Db`, `C♯`, `B♭`; null for anything else. */
export function parseNoteName(text: string): Spelling | null {
  const m = /^([A-G])([#b♯♭]?)$/.exec(text);
  if (!m) return null;
  const acc = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
  return { letter: LETTERS.indexOf(m[1] as (typeof LETTERS)[number]), acc };
}
