// Tour: short guided chapters. A chapter turns the camera to a view, opens something,
// reads out its lines, then puts everything back. The camera never zooms on its own.
export class Tour {
  constructor(chapters, hooks) {
    this.chapters = chapters;
    this.hooks = hooks; // { begin(ch), line(ch, i), end(ch), progress(k) }
    this.active = null;
    this.queue = [];
    this.t = 0;
    this.step = 0;
  }

  play(id) {
    const ch = this.chapters.find((c) => c.id === id);
    if (!ch) return;
    if (this.active) this.finish(true);
    this.queue = [];
    this.start(ch);
  }

  playAll() {
    if (this.active) this.finish(true);
    this.queue = this.chapters.slice(1);
    this.start(this.chapters[0]);
  }

  start(ch) {
    this.active = ch;
    this.t = 0;
    this.step = 0;
    this.hooks.begin(ch);
  }

  // more = another chapter starts straight away, so the robot need not reset fully
  finish(more = false) {
    const ch = this.active;
    this.active = null;
    if (ch) this.hooks.end(ch, more);
    this.hooks.progress(0);
  }

  stop() {
    this.queue = [];
    if (this.active) this.finish();
  }

  update(dt) {
    const ch = this.active;
    if (!ch) return;
    this.t += dt;
    const n = ch.lines.length;
    const slot = (ch.seconds - 1.2) / Math.max(1, n);
    while (this.step < n && this.t > 0.9 + this.step * slot) this.hooks.line(ch, this.step++);
    this.hooks.progress(Math.min(1, this.t / ch.seconds));
    if (this.t >= ch.seconds) {
      const next = this.queue.shift();
      this.finish(!!next);
      if (next) this.start(next);
    }
  }
}
