// The guided guitar setup, written for someone who has never plugged a guitar into a computer. One
// instruction a screen; each moves on by itself once it has heard what it needs, and each can be
// skipped. In order: open the input, find the guitar's channel, set the level, measure the quiet
// (the gate and any hum filter), tune each string, time a play-along, and ask about hearing the
// guitar through the amp. What it measured is saved for the input when it finishes.

import type { App } from '../app.js';
import { click } from '../audio/synths.js';
import {
  adviseLevel,
  analyseQuiet,
  gateFor,
  type LevelAdvice,
  likelyInterface,
  median,
  pickChannel,
  timingOffset,
  tuneTo,
} from '../listen/calibrate.js';
import { type InputDevice, listInputs } from '../listen/input.js';
import type { Meter } from '../listen/messages.js';
import { stringLabel, stringName } from '../presets/tunings.js';
import { LISTEN, MIX, SETUP } from '../tuning.js';
import { $, el, options } from './dom.js';
import { failureText } from './guitar.js';

type StepId = 'connect' | 'find' | 'level' | 'quiet' | 'tune' | 'timing' | 'monitor' | 'done';
const ORDER: StepId[] = ['connect', 'find', 'level', 'quiet', 'tune', 'timing', 'monitor', 'done'];

interface Button {
  label: string;
  run: () => void;
  primary?: boolean;
}

interface Screen {
  title: string;
  text: string[];
  show?: HTMLElement[];
  next?: Button | null;
  skip?: Button | null;
}

const LEVEL_WORDS: Record<LevelAdvice, string> = {
  quiet: 'A bit quiet. Turn up the gain knob for this input a little, then pluck again.',
  good: 'Good.',
  loud: 'A little loud. Turn the gain knob down a touch.',
  clipping: "Too loud: it's distorting. Turn the gain knob down until its light stops going red.",
};

const ms = (s: number) => `${Math.round(s * 1000)} ms`;

export class GuitarSetup {
  private readonly root = $('#setup');
  private readonly stepLine = $('#setup-step');
  private readonly title = $('#setup-title');
  private readonly text = $('#setup-text');
  private readonly show = $('#setup-show');
  private readonly sayLine = $('#setup-say');
  private readonly nextButton = $<HTMLButtonElement>('#setup-next');
  private readonly skipButton = $<HTMLButtonElement>('#setup-skip');
  private step: StepId = 'connect';
  private string = 0;
  private cleanups: (() => void)[] = [];
  private nextRun: (() => void) | null = null;
  private skipRun: (() => void) | null = null;
  private readonly results: string[] = [];

  constructor(private readonly app: App) {
    $('#setup-cancel').addEventListener('click', () => this.close());
    this.nextButton.addEventListener('click', () => this.nextRun?.());
    this.skipButton.addEventListener('click', () => this.skipRun?.());
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  start(from: StepId = 'connect'): void {
    this.root.hidden = false;
    this.app.keys.releaseAll();
    this.app.keys.paused = true;
    // The setup listens for the guitar and plays its own clicks: nothing else should be sounding.
    this.app.hush();
    this.results.length = 0;
    this.go(from);
  }

  close(): void {
    this.leave();
    this.root.hidden = true;
    this.app.keys.paused = false;
  }

  private get link() {
    return this.app.guitar;
  }

  private go(step: StepId): void {
    this.leave();
    this.step = step;
    if (step === 'tune') this.string = 0;
    this[step]();
  }

  private forward(): void {
    const i = ORDER.indexOf(this.step);
    this.go(ORDER[Math.min(ORDER.length - 1, i + 1)]!);
  }

  private leave(): void {
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
  }

  private frame(s: Screen): void {
    const i = ORDER.indexOf(this.step);
    this.stepLine.textContent = `Step ${i + 1} of ${ORDER.length}`;
    this.title.textContent = s.title;
    this.text.replaceChildren(...s.text.map((t) => el('p', { text: t })));
    this.show.replaceChildren(...(s.show ?? []));
    this.say('');
    this.setButton(this.nextButton, s.next === undefined ? this.nextStep() : s.next, 'next');
    this.setButton(this.skipButton, s.skip === undefined ? this.skipStep() : s.skip, 'skip');
  }

  private nextStep(): Button {
    return { label: 'Next', run: () => this.forward(), primary: true };
  }

  private skipStep(): Button {
    return { label: 'Skip this step', run: () => this.forward() };
  }

  private setButton(b: HTMLButtonElement, spec: Button | null, which: 'next' | 'skip'): void {
    b.hidden = spec === null;
    if (spec) {
      b.textContent = spec.label;
      b.classList.toggle('primary', spec.primary ?? which === 'next');
      b.disabled = false;
    }
    if (which === 'next') this.nextRun = spec?.run ?? null;
    else this.skipRun = spec?.run ?? null;
  }

  private say(text: string, tone: 'plain' | 'good' | 'warn' = 'plain'): void {
    this.sayLine.textContent = text;
    this.sayLine.className = `say ${tone}`;
  }

  private listen(meter?: (m: Meter) => void, hit?: (t: number, level: number) => void): void {
    if (meter) {
      this.link.onMeter.add(meter);
      this.cleanups.push(() => this.link.onMeter.delete(meter));
    }
    if (hit) {
      this.link.onHit.add(hit);
      this.cleanups.push(() => this.link.onHit.delete(hit));
    }
  }

  private later(ms: number, fn: () => void): void {
    const id = setTimeout(fn, ms);
    this.cleanups.push(() => clearTimeout(id));
  }

  // The steps

  private connect(): void {
    const on = this.link.state === 'on';
    this.frame({
      title: 'Plug in your guitar',
      text: [
        'Plug your guitar into your audio interface, and the interface into this computer. If the input has an INST or Hi-Z button, turn it on.',
        "Your browser will ask to use your microphone: that's how it reaches the interface. Choose Allow.",
      ],
      next: { label: on ? 'Next' : 'Start listening', run: () => void this.connectNow() },
      skip: null,
    });
    if (on) this.say(`Listening to ${this.link.device?.label ?? 'your input'}.`, 'good');
  }

  private async connectNow(): Promise<void> {
    if (this.link.state === 'on') return this.forward();
    this.say('Opening the input…');
    this.nextButton.disabled = true;
    this.app.set({ guitarOn: true });
    if (!(await this.link.open(this.app.s.guitarDevice || null))) {
      this.nextButton.disabled = false;
      this.nextButton.textContent = 'Try again';
      return this.say(failureText(this.link.failure), 'warn');
    }
    // The browser's default input is often the laptop's microphone; move to the interface.
    if (!this.app.s.guitarDevice) {
      const inputs = await listInputs();
      const pick = inputs[likelyInterface(inputs.map((i) => i.label))];
      if (pick && pick.id !== this.link.device?.id) {
        this.app.set({ guitarDevice: pick.id });
        await this.link.open(pick.id);
      }
    }
    if (this.step === 'connect') this.forward();
  }

  private find(): void {
    const bars = [meterBar(), meterBar()];
    const rows = bars.map((b, c) => el('div', { className: 'channel' }, [`Input ${c + 1}`, b.el]));
    const picker = el('select');
    this.frame({
      title: 'Find your guitar',
      text: ['Pluck any string and let it ring.'],
      show: [el('label', { className: 'device' }, ['Interface', picker]), ...rows],
    });
    void this.fillDevices(picker);

    const started = performance.now();
    const base: number[][] = [[], []];
    let quiet: number[] | null = null;
    const loud = [-120, -120];
    let found = false;
    this.listen((m) => {
      m.peaks.forEach((p, c) => bars[c]?.set(p));
      rows[1]!.hidden = m.peaks.length < 2;
      if (performance.now() - started < 600) {
        m.peaks.forEach((p, c) => base[c]?.push(p));
        return;
      }
      quiet ??= base.map((b) => median(b) ?? -120);
      m.peaks.forEach((p, c) => (loud[c] = Math.max(loud[c] ?? -120, p)));
      const channel = pickChannel(quiet, loud.slice(0, m.peaks.length));
      if (channel === null || found) return;
      found = true;
      this.link.calibrate({ channel });
      this.results.push(`Your guitar is on input ${channel + 1} of ${this.link.device?.label}.`);
      this.say(`Found it: input ${channel + 1}.`, 'good');
      this.later(1200, () => this.forward());
    });
    this.later(8000, () => {
      if (found) return;
      this.say(
        "Nothing yet. Check the lead is pushed all the way in at both ends, the guitar's volume knob is up, and the interface's gain knob isn't turned right down.",
        'warn',
      );
    });
  }

  private async fillDevices(picker: HTMLSelectElement): Promise<void> {
    const inputs: InputDevice[] = await listInputs();
    options(
      picker,
      inputs.map((i) => [i.id, i.label]),
    );
    picker.value = this.link.device?.id ?? '';
    picker.addEventListener('change', async () => {
      this.app.set({ guitarDevice: picker.value });
      picker.blur();
      if (await this.link.open(picker.value)) this.go('find');
      else this.say(failureText(this.link.failure), 'warn');
    });
  }

  private level(): void {
    const bar = meterBar(true);
    this.frame({
      title: 'Set the level',
      text: [
        "Pluck a string hard, the hardest you'll play, a few times.",
        "The gain knob for your guitar's input on the interface sets how loud it comes in.",
      ],
      show: [bar.el],
    });
    const channel = this.link.calibration.channel;
    const good: number[] = [];
    let until = 0;
    let peak = -120;
    let level = -120;
    let judged = true;
    this.listen(
      (m) => {
        const p = m.peaks[Math.min(channel, m.peaks.length - 1)] ?? -120;
        bar.set(p);
        if (performance.now() < until) {
          peak = Math.max(peak, p);
          level = Math.max(level, m.level);
        } else if (!judged) {
          judged = true;
          this.judge(peak, level, good);
        }
      },
      () => {
        until = performance.now() + 350;
        peak = -120;
        level = -120;
        judged = false;
      },
    );
  }

  private judge(peak: number, level: number, good: number[]): void {
    const advice = adviseLevel(peak);
    if (advice !== 'good') {
      good.length = 0;
      return this.say(LEVEL_WORDS[advice], 'warn');
    }
    good.push(level);
    const left = SETUP.goodPlucks - good.length;
    if (left > 0) return this.say(`${LEVEL_WORDS.good} ${left === 1 ? 'Once more.' : 'Again.'}`);
    const loudDb = median(good)!;
    this.link.calibrate({ loudDb });
    this.results.push('The level is set.');
    this.say("That's a good level.", 'good');
    this.later(1000, () => this.forward());
  }

  private quiet(): void {
    this.frame({
      title: 'Listen to the quiet',
      text: [
        'Rest your hand across all the strings so nothing rings, and keep still.',
        'Press Start, then stay quiet for three seconds.',
      ],
      next: { label: 'Start', run: () => void this.measureQuiet(), primary: true },
    });
  }

  private async measureQuiet(): Promise<void> {
    const capture = this.link.capture(SETUP.quietSeconds);
    if (!capture) return this.say(failureText(this.link.failure), 'warn');
    this.nextButton.disabled = true;
    let heard = false;
    this.listen(undefined, () => (heard = true));
    for (let s = SETUP.quietSeconds; s > 0; s--) {
      this.later((SETUP.quietSeconds - s) * 1000, () => this.say(`Keep still… ${s}`));
    }
    const { samples, rate } = await capture;
    if (this.step !== 'quiet') return;
    this.nextButton.disabled = false;
    if (heard) {
      this.nextButton.textContent = 'Try again';
      return this.say('I heard a note. Keep the strings still and try again.', 'warn');
    }
    const report = analyseQuiet(samples, rate);
    this.link.calibrate({
      gateDb: gateFor(report.cleanDb),
      ampGateDb: gateFor(report.floorDb),
      hum: report.hum,
    });
    const said: string[] = [];
    if (report.mains !== null) {
      said.push(`Found hum from the mains (${report.mains} Hz) and filtered it out.`);
      this.results.push(`Hum from the mains (${report.mains} Hz) is filtered out.`);
    }
    if (report.noisy) {
      said.push(
        "There's a lot of background noise. If your guitar has single-coil pickups, try facing away from your computer screen, or turning the guitar's volume down a little.",
      );
    } else said.push('Quiet enough.');
    this.results.push('Chordlight ignores anything quieter than your guitar at rest.');
    this.say(said.join(' '), report.noisy ? 'warn' : 'good');
    this.setButton(this.nextButton, this.nextStep(), 'next');
  }

  private tune(): void {
    const tuning = this.app.s.tuning;
    const i = this.string;
    const target = tuning[i]!;
    const dial = tunerDial();
    const last = i === tuning.length - 1;
    const onward = () => {
      if (last) return this.forward();
      this.leave();
      this.string++;
      this.tune();
    };
    this.frame({
      title: `Tune the ${stringLabel(i)} string`,
      text: [
        `Play it open, with no fingers on it, and let it ring. It should be ${stringName(target)}.`,
      ],
      show: [dial.el],
      next: { label: last ? 'Next' : 'Next string', run: onward, primary: true },
      skip: { label: 'Skip tuning', run: () => this.go('timing') },
    });
    this.stepLine.textContent += ` · string ${i + 1} of ${tuning.length}`;

    let since: number | null = null;
    let done = false;
    this.listen((m) => {
      if (done) return;
      if (
        m.pitch === null ||
        m.clarity < LISTEN.clarity ||
        m.level < this.link.calibration.gateDb
      ) {
        dial.set(null, false);
        since = null;
        return;
      }
      const semis = m.pitch - target;
      if (Math.abs(semis) > 0.5) {
        since = null;
        dial.set(semis < 0 ? -50 : 50, false);
        const heard = stringName(Math.round(m.pitch));
        if (Math.abs(semis) > 4.5) {
          this.say(`That sounds like ${heard}. Make sure it's the ${stringLabel(i)} string, open.`);
        } else {
          const way = semis < 0 ? 'Tighten' : 'Loosen';
          this.say(
            `That's ${heard}. ${way} the string slowly until it reaches ${stringName(target)}.`,
          );
        }
        return;
      }
      const { cents, verdict } = tuneTo(m.pitch, target);
      dial.set(cents, verdict === 'in tune');
      if (verdict !== 'in tune') {
        since = null;
        const way = verdict === 'flat' ? 'A little flat: tighten' : 'A little sharp: loosen';
        return this.say(`${way} the string slowly.`);
      }
      since ??= performance.now();
      if (performance.now() - since < SETUP.inTuneHold * 1000) return this.say('In tune. Hold it…');
      done = true;
      this.say('In tune.', 'good');
      this.later(700, onward);
    });
  }

  private timing(): void {
    const total = SETUP.countIn + SETUP.clicks;
    const dots = Array.from({ length: total }, (_, i) =>
      el('i', { className: i < SETUP.countIn ? 'listen' : 'play' }),
    );
    this.frame({
      title: 'Play along',
      text: [
        `Pluck or strum once on each click. The first ${SETUP.countIn} are to listen to; play along with the ${SETUP.clicks} after them.`,
        'This measures the delay between playing and Chordlight hearing it, so recordings line up with the beat.',
      ],
      show: [el('div', { className: 'beats' }, dots)],
      next: { label: 'Start', run: () => this.playAlong(dots), primary: true },
    });
  }

  private playAlong(dots: HTMLElement[]): void {
    const { engine } = this.app.startAudio();
    const ctx = engine.ctx;
    const out = ctx.createGain();
    out.gain.value = MIX.click;
    out.connect(ctx.destination);
    const spb = 60 / SETUP.bpm;
    const t0 = engine.now + 0.4;
    const times = dots.map((_, i) => t0 + i * spb);
    times.forEach((t, i) => click(engine, t, i % 4 === 0, out));
    const played = times.slice(SETUP.countIn);
    const hits: number[] = [];
    this.listen(undefined, (t) => hits.push(t));
    this.nextButton.disabled = true;
    this.say('Listen…');
    const tick = setInterval(() => {
      const heard = engine.heard;
      dots.forEach((d, i) => d.classList.toggle('past', heard >= times[i]!));
      if (heard >= played[0]! - 0.05 && heard < played[0]! + spb) this.say('Now play along.');
    }, 30);
    this.cleanups.push(() => {
      clearInterval(tick);
      out.disconnect();
    });
    this.later((times[times.length - 1]! - engine.now + 0.6) * 1000, () => {
      clearInterval(tick);
      this.nextButton.disabled = false;
      const timing = timingOffset(played, hits);
      if (!timing) {
        this.nextButton.textContent = 'Try again';
        return this.say(
          "I didn't catch enough of those. Try again, plucking firmly on each click.",
          'warn',
        );
      }
      this.link.calibrate({ offset: timing.offset });
      this.results.push(`Your notes are moved back ${ms(timing.offset)} so they land on the beat.`);
      this.say(
        `Got it: Chordlight hears your playing ${ms(timing.offset)} after you play it.`,
        'good',
      );
      this.setButton(this.nextButton, this.nextStep(), 'next');
    });
  }

  private monitor(): void {
    const choose = (monitor: boolean) => {
      this.app.set({ amp: { ...this.app.s.amp, monitor } });
      this.results.push(
        monitor
          ? 'You hear your guitar through the amp.'
          : "Chordlight listens, but doesn't play your guitar.",
      );
      this.forward();
    };
    const yes = el('button', { className: 'choice primary', text: 'Yes, through the amp' });
    const no = el('button', { className: 'choice', text: "No, I'll hear it another way" });
    yes.addEventListener('click', () => choose(true));
    no.addEventListener('click', () => choose(false));
    const text = [
      'With headphones or speakers on your interface, Chordlight can play your guitar through a built-in amp.',
      "If your interface has a direct monitor switch, turn it off for this, or you'll hear the guitar twice.",
    ];
    const offset = this.link.offset;
    if (offset > SETUP.laggy) {
      text.push(
        `This computer adds about ${ms(offset)} of delay, which can make playing through the amp feel late. If it does, choose No and turn direct monitoring on instead.`,
      );
    }
    this.frame({
      title: 'Hear your guitar through Chordlight?',
      text,
      show: [el('div', { className: 'choices' }, [yes, no])],
      next: null,
    });
  }

  private done(): void {
    this.frame({
      title: 'All set',
      text: [
        'Play a note and watch it light up on the neck. You can run this setup again from the Guitar panel at any time.',
      ],
      show: [
        el(
          'ul',
          { className: 'summary' },
          this.results.map((r) => el('li', { text: r })),
        ),
      ],
      next: {
        label: 'Finish',
        primary: true,
        run: () => {
          this.link.calibrate({}, true);
          this.close();
        },
      },
      skip: null,
    });
  }
}

const meterAt = (db: number) => `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;

/** A level meter over -60 to 0 dBFS; `zones` marks too quiet, good, loud and clipping. */
function meterBar(zones = false): { el: HTMLElement; set(db: number): void } {
  const fill = el('i');
  const bar = el('div', { className: zones ? 'meter zones' : 'meter' }, [fill]);
  if (zones) {
    bar.style.setProperty('--good', meterAt(SETUP.quietDb));
    bar.style.setProperty('--loud', meterAt(SETUP.loudDb));
    bar.style.setProperty('--clip', meterAt(SETUP.clipDb));
  }
  return {
    el: bar,
    set(db: number) {
      fill.style.width = meterAt(db);
    },
  };
}

/** A needle over ±50 cents; null hides it. */
function tunerDial(): { el: HTMLElement; set(cents: number | null, inTune: boolean): void } {
  const needle = el('i');
  const dial = el('div', { className: 'tuner' }, [
    el('span', { className: 'flat', text: 'flat' }),
    el('b'),
    needle,
    el('span', { className: 'sharp', text: 'sharp' }),
  ]);
  return {
    el: dial,
    set(cents, inTune) {
      needle.hidden = cents === null;
      if (cents !== null) needle.style.left = `${50 + Math.max(-50, Math.min(50, cents))}%`;
      dial.classList.toggle('in-tune', inTune);
    },
  };
}
