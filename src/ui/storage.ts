// localStorage helpers. Any access may throw (private mode, quota); failures fall back to defaults.

const PREFIX = 'chordlight.';

export function load<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + name);
    return raw === null ? fallback : { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

export function loadList<T>(name: string): T[] {
  try {
    const raw = localStorage.getItem(PREFIX + name);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** false if the browser refused the write. */
export function save(name: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
