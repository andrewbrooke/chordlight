# Chordlight

A browser piano that lights up the notes that fit, so you can write melodies without memorising
scales.

**Play it at https://andrewbrooke.github.io/chordlight/**

Pick a key, or load a chord progression, and every key shows how it fits the chord that's
playing. Gold keys are safe to land on, teal keys fit as you pass through, violet keys clash and
want to move on, and unlit keys are outside the key. A panel next to the keyboard explains why
each note is lit the way it is.

## Features

- **Key mode:** choose a home note and a mode (major, minor, Lydian, Mixolydian, Dorian or
  Phrygian). Hold any of the key's seven chords from the palette or with `Z`–`M`.
- **Progression mode:** 16 preset progressions, including Four Chords, the 12-bar blues, ii–V–I
  and the Andalusian cadence, or type your own as Roman numerals (`I V vi IV`) or chord names
  (`C G Am F`). Backing styles are pad, piano, arpeggio and drive, with optional bass, click and
  count-in. The next chord's notes are marked just before it arrives.
- **Borrowed chords:** when a chord comes from outside the key, the lit scale changes with it.
- **Chord recognition:** whatever you hold is named, with its Roman numeral in the current key.
- **Clips:** keep the last 10 to 60 seconds of playing, along with the backing that was
  playing, then play it back (with or without the backing) or delete it.
- **Synthesised piano:** no samples to download. All sound is generated in the browser.
- **Input:** computer keyboard, mouse or touch, and MIDI keyboards.

## Requirements

- Node.js 20.11 or newer.
- A current desktop browser. For a MIDI keyboard, Chrome or Edge is the smoothest option.

## Running it

```bash
npm ci
npm run dev
```

Then open http://127.0.0.1:5190. The server listens on 127.0.0.1 only; set `PORT` to use a
different port.

## Playing

| Keys                    | Action                                                                      |
| ----------------------- | --------------------------------------------------------------------------- |
| `Q` to `]`              | the current key's notes, starting from home (`Q` `E` `T` is the home chord) |
| number keys above a gap | the notes in between, like a piano's black keys                             |
| `Z` to `M`              | hold the key's chords, I to vii° (Key mode)                                 |
| `←` `→`                 | octave down and up                                                          |
| `Shift`                 | sustain pedal                                                               |
| `Space`                 | play and stop (Progression mode)                                            |
| `Enter`                 | keep a clip                                                                 |

A piano-shaped layout (letters are white keys) and two chromatic rows are available in Settings.

## The lights

| Light           | Meaning                                                                |
| --------------- | ---------------------------------------------------------------------- |
| gold, with ring | home: the key's home note, or the root of the chord                    |
| gold            | land: a chord note, safe to hold or to end a phrase on                 |
| teal            | wander: in the scale, fine to pass through                             |
| violet, arrow   | lean: a half step above a chord note; move on the way the arrow points |
| unlit           | outside the key                                                        |

### Why they work

- **A key is seven of the twelve notes.** Five of them (the pentatonic scale) never clash with each
  other. The other two sit a half step from a neighbour and pull towards it; in C major, F leans
  down to E and B up to C.
- **Chords are every other note of the key.** While a chord plays, its own notes are the safe
  places to land, and the key's other notes connect them. A key note a half step above a chord
  note clashes with it, so it works best on the way somewhere else.
- **Progressions are written as Roman numerals** counted from home, so I–V–vi–IV is C G Am F in C
  major and the same progression in any other key.
- **Borrowed chords change the lights.** When a chord comes from outside the key, like the E major
  in C major's version of Creep (C E F Fm), the lights switch to the major, harmonic minor or
  melodic minor scale that fits it while keeping as much of the key as possible.
- **Modes are the major scale started from another note.** Lydian, Mixolydian, Dorian and Phrygian
  each change one note relative to major or minor, and that note is marked with a star.

## Development

```bash
npm run build          # compile src/ to dist/
npm run dev            # build, then serve
npm run watch          # rebuild on save
npm run check          # type-check only
npm run smoke          # build, then run the tests in tools/smoke/
npm run render         # render piano notes to WAV in var/render/
npm run site           # assemble the static site in site/
npm run format         # format with Prettier
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the code layout and conventions.

## Hosting

The app is fully static. `npm run site` assembles it in `site/` with relative paths, so it also
works from a sub-path such as `https://<user>.github.io/<repo>/`. The workflow in
`.github/workflows/pages.yml` runs the checks and deploys to GitHub Pages on every push to `main`;
enable it under Settings → Pages → Source: GitHub Actions.

## License

MIT. See [`LICENSE`](LICENSE).
