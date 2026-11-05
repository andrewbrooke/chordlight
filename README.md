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
- **Progression mode:** 17 preset progressions, including Four Chords, the 12-bar blues, ii–V–I
  and the Andalusian cadence, or type your own as Roman numerals (`I V vi IV`) or chord names
  (`C G Am F`). Backing styles are pad, piano, arpeggio and drive, with optional bass, click and
  count-in. The next chord's notes are marked just before it arrives.
- **Borrowed chords:** when a chord comes from outside the key, the lit scale changes with it.
- **Chord recognition:** whatever you hold is named, with its Roman numeral in the current key.
- **Clips:** keep the last 10 to 60 seconds of playing, along with the backing that was
  playing, or record exactly from one press of Record to the next, then play it back (with or
  without the backing) or delete it. Your MIDI keyboard's transport buttons can be learned for
  recording, clipping, playing and pausing the progression. Save a clip as JSON
  (everything it holds, and importable again) or as a MIDI file for a DAW or notation program,
  with the backing on its own tracks and the chord names as markers, or as sheet music (PDF): what
  you played snapped to written note lengths on the backing's beat, on a grand staff in the key,
  with the chord names above.
- **Guitar mode (experimental):** a guitar neck in place of the keyboard, lit the same way, in
  standard or any other tuning. Plug a guitar into an audio interface and Chordlight hears what
  you play, lights it on the neck, can play it through a built-in amp, and records it into clips
  and MIDI files like anything else. See [Guitar mode](#guitar-mode).
- **Synthesised piano:** no samples to download. All sound is generated in the browser.
- **Input:** computer keyboard, mouse or touch, MIDI keyboards, and a guitar through an audio
  interface.
- **A first-visit tour** of the basics, finished mostly by playing. Skip it from the start screen
  or at any step with `Esc`, and replay it from Settings.

## Requirements

- Node.js 20.11 or newer.
- A current desktop browser. For a MIDI keyboard, Chrome or Edge is the smoothest option.
- For guitar input, an audio interface with an instrument input (a Focusrite Scarlett, say), and
  permission for the page to use the microphone, which is how browsers reach audio inputs.

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

## Guitar mode

Switch the top bar from Piano to Guitar for a neck instead of a keyboard. Every place on the neck
whose note is lit gets a dot, so a key's scale shapes show across all the frets. Clicking a fret, the
computer keys and a MIDI keyboard all play a plucked string through the amp. The tuning is set in the
Guitar panel: standard, half or whole step down, drop D or C, DADGAD, open G or D, or six strings of
your own.

The amp has four sounds: **Clean**, **Crunch** (an amp just breaking up), **Punk** (tight and
saturated, mids forward) and **Fuzz** (thick, scooped, endless sustain), each with Drive, Bass, Mid
and Treble. The knobs start in the middle, where the sound is as voiced; picking a sound puts them
back there.

**Guitar input** in the top bar opens the panel. The first time, **Plug in my guitar** walks
through a setup: it finds the input your guitar is on, checks the level, listens to the quiet to
set a noise gate and filter out mains hum, tunes each string, and times you playing along to a
click so recordings line up with the beat. It's kept for each interface, and **Set up** runs it
again.

It's experimental, and the limits are real ones:

- **One note at a time.** Single notes, riffs and melodies are heard, lit and recorded. Strummed
  chords aren't yet.
- **The place on the neck is a guess.** Most notes can be played on two or more strings, and one
  pickup can't tell which. Chordlight lights the one nearest where your hand has been playing.
- **Playing through the amp can lag.** A browser adds delay between the input and the output, more
  on Windows than elsewhere. If it feels late, untick **hear my guitar through Chordlight** and use
  your interface's direct monitoring instead; Chordlight still hears and lights what you play.

If it hears notes you didn't play, or misses ones you did, **Record input** in the Guitar panel saves
what it heard as a WAV file, with its setup and the notes it heard inside. Send that with what you
played: `npm run hear -- <file.wav> --expect "E4 F#4 G#4"` replays it through the detector.

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
npm run render         # render piano notes to WAV in var/render/ (-- amp: a riff through each amp sound)
npm run hear -- <wav>  # replay a guitar input recording through the detector (--expect "E4 F#4", --notes)
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
