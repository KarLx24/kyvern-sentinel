// HUD: everything drawn in the page around the robot. It only reports clicks through
// `on` callbacks and shows what it is told; it holds no robot logic.
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export class Hud {
  constructor(root, cfg, on) {
    this.root = root;
    this.on = on;
    this.cfg = cfg;
    root.innerHTML = `
      <header class="top">
        <a class="brand" href="./portrait/" title="Open the portrait render"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5l4 6-4 16-4-16z"/><path d="M11 12L2 8l3 10 7 3zM21 12l9-4-3 10-7 3z"/></svg><b>KYVERN</b></a>
        <div class="live"><i></i>LIVE SIM</div>
      </header>
      <div class="head">
        <div class="eyebrow">${cfg.code}</div>
        <h1>${cfg.name}</h1>
        <div class="formline"></div>
        <div class="prog"><i></i></div>
        <nav class="chapters"></nav>
      </div>
      <nav class="sections"></nav>
      <aside class="cards"></aside>
      <svg class="wires"></svg>
      <div class="labels"></div>
      <div class="hover"></div>
      <div class="caption"><div class="cap-main">${cfg.banner}</div><div class="cap-sub"></div></div>
      <aside class="partcard"></aside>
      <div class="pad"><button data-pad="fwd:1" aria-label="Forward">▲</button><button data-pad="turn:1" aria-label="Turn left">◀</button><button data-pad="fwd:-1" aria-label="Back">▼</button><button data-pad="turn:-1" aria-label="Turn right">▶</button></div>
      <footer class="dock"></footer>
      <div class="credit">${cfg.credit}</div>`;
    const q = (s) => root.querySelector(s);
    this.formline = q('.formline');
    this.prog = q('.prog i');
    this.capSub = q('.cap-sub');
    this.labels = q('.labels');
    this.wires = q('.wires');
    this.hover = q('.hover');
    this.partcard = q('.partcard');
    this.pool = [];
    // the dock wraps on narrow windows; everything above it follows its real height
    const dockEl = q('.dock');
    const measure = () => root.style.setProperty('--dock-h', `${dockEl.offsetHeight}px`);
    if (window.ResizeObserver) new ResizeObserver(measure).observe(dockEl);
    requestAnimationFrame(measure);

    // chapters
    const chapters = q('.chapters');
    chapters.append(this.chip('▶ Tour', () => on.tourAll(), 'ghost'));
    this.chapterChips = {};
    for (const c of cfg.chapters) chapters.append((this.chapterChips[c.id] = this.chip(c.label, () => on.chapter(c.id))));

    // sections
    const sections = q('.sections');
    this.sectionRows = {};
    const row = (id, label, lines) => {
      const r = el('button', 'sec', `<span>${label}</span>${lines.map((l) => `<small>${l}</small>`).join('')}`);
      r.addEventListener('click', () => on.section(id));
      sections.append(r);
      this.sectionRows[id] = r;
    };
    row('overview', 'Overview', []);
    for (const s of cfg.sections) row(s.id, s.label, s.lines);
    row('teardown', 'Teardown', ['Every part apart', 'Click again for every piece']);

    // telemetry cards
    const cards = q('.cards');
    this.cards = cfg.cards.map((name, i) => {
      const c = el('div', 'card', `<label>${name}</label><div class="val"><b>0</b><u></u></div>${i === 2 ? '<div class="bars">' + '<i></i>'.repeat(6) + '</div>' : i === 0 ? '<canvas width="200" height="36"></canvas>' : '<div class="bar"><i></i></div>'}`);
      cards.append(c);
      return { val: c.querySelector('b'), unit: c.querySelector('u'), bar: c.querySelector('.bar i'), bars: [...c.querySelectorAll('.bars i')], wave: c.querySelector('canvas') };
    });
    this.waveData = new Array(50).fill(0.5);

    // dock
    const dock = q('.dock');
    const grp = (title) => {
      const g = el('div', 'grp', `<label>${title}</label>`);
      dock.append(g);
      return g;
    };
    this.formChips = {};
    const gForm = grp('Form');
    for (const [id, f] of Object.entries(cfg.forms)) gForm.append((this.formChips[id] = this.chip(f.label, () => on.form(id))));
    this.lineChips = {};
    const gLine = grp('Colour line');
    for (const l of cfg.lines) {
      const c = this.chip(`<i class="sw" style="--a:${l.swatch[0]};--b:${l.swatch[1]}"></i>${l.name}`, () => on.line(l.id));
      gLine.append((this.lineChips[l.id] = c));
    }
    this.stateChips = {};
    const gState = grp('State');
    for (const [id, s] of Object.entries(cfg.states)) gState.append((this.stateChips[id] = this.chip(s.label, () => on.state(id))));
    const gWings = grp('Wings');
    this.wingChips = { open: this.chip('Spread', () => on.wings(true)), folded: this.chip('Folded', () => on.wings(false)) };
    gWings.append(this.wingChips.open, this.wingChips.folded);
    const gView = grp('View');
    gView.append(this.chip('−', () => on.zoom(-1), 'sq'));
    this.zoomLabel = el('span', 'read', 'Zoom 100%');
    gView.append(this.zoomLabel, this.chip('+', () => on.zoom(1), 'sq'));
    this.speedChip = this.chip('Speed 1×', () => on.speed());
    gView.append(this.speedChip, el('span', 'hint', 'WASD to walk · drag to turn · click a part'));

    // touch pad
    for (const b of root.querySelectorAll('[data-pad]')) {
      const [axis, v] = b.dataset.pad.split(':');
      const set = (x) => (e) => {
        e.preventDefault();
        on.pad(axis, x);
      };
      b.addEventListener('pointerdown', set(+v));
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, set(0));
    }
  }

  chip(html, fn, extra = '') {
    const b = el('button', `chip ${extra}`, `<span>${html}</span>`);
    b.addEventListener('click', fn);
    return b;
  }

  pick(map, id) {
    for (const [k, c] of Object.entries(map)) c.classList.toggle('on', k === id);
  }

  setForm(id, caption) {
    this.pick(this.formChips, id);
    this.formline.textContent = caption;
  }

  setLine(id, accent) {
    this.pick(this.lineChips, id);
    this.root.style.setProperty('--accent', accent);
  }

  setState(id) {
    this.pick(this.stateChips, id);
  }

  setWings(open) {
    this.pick(this.wingChips, open ? 'open' : 'folded');
  }

  setSection(id) {
    this.pick(this.sectionRows, id);
  }

  setChapter(id) {
    this.pick(this.chapterChips, id);
  }

  setProgress(k) {
    this.prog.style.width = `${k * 100}%`;
  }

  setCaption(text) {
    if (this._cap === text) return;
    this._cap = text;
    this.capSub.textContent = text;
  }

  setZoom(z) {
    this.zoomLabel.textContent = `Zoom ${Math.round(z * 100)}%`;
  }

  setSpeed(s) {
    this.speedChip.firstChild.textContent = `Speed ${s}×`;
  }

  // Card that lists the pieces of the open part.
  showPart(part) {
    if (!part) {
      this.partcard.classList.remove('on');
      return;
    }
    this.partcard.innerHTML = `<label>${part.sectionLabel || ''}</label><h2>${part.label}</h2><p>${part.note}</p><ol>${part.pieces.map((n) => `<li>${n}</li>`).join('')}</ol>`;
    this.partcard.classList.add('on');
  }

  // Labels wired to their parts. `items` is [{ text, ax, ay (the point on the part), lx, ly
  // (where the name sits), dir (-1 name on the left, 1 on the right), sub, alpha }], in screen pixels.
  drawLabels(items) {
    const NS = 'http://www.w3.org/2000/svg';
    while (this.pool.length < items.length) {
      const d = el('div');
      this.labels.append(d);
      const line = document.createElementNS(NS, 'path');
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('r', 3);
      this.wires.append(line, dot);
      this.pool.push({ d, line, dot });
    }
    this.pool.forEach(({ d, line, dot }, i) => {
      const it = items[i];
      const show = it ? '' : 'none';
      if (d.style.display !== show) d.style.display = line.style.display = dot.style.display = show;
      if (!it) return;
      if (d._t !== it.text) d.textContent = d._t = it.text;
      const cls = (it.sub ? 'sub ' : '') + (it.dir < 0 ? 'left' : 'right');
      if (d.className !== cls) {
        d.className = cls;
        line.setAttribute('class', it.sub ? 'sub' : '');
        dot.setAttribute('class', it.sub ? 'sub' : '');
      }
      d.style.transform = `translate(${it.lx.toFixed(1)}px, ${it.ly.toFixed(1)}px) translate(${it.dir < 0 ? '-100%' : '0'}, -50%)`;
      d.style.opacity = line.style.opacity = dot.style.opacity = it.alpha;
      const elbow = it.lx - it.dir * 14;
      line.setAttribute('d', `M${it.ax.toFixed(1)} ${it.ay.toFixed(1)}L${elbow.toFixed(1)} ${it.ly.toFixed(1)}L${it.lx.toFixed(1)} ${it.ly.toFixed(1)}`);
      dot.setAttribute('cx', it.ax.toFixed(1));
      dot.setAttribute('cy', it.ay.toFixed(1));
    });
  }

  setHover(text, x, y) {
    if (!text) {
      this.hover.style.opacity = 0;
      return;
    }
    this.hover.textContent = text;
    this.hover.style.opacity = 1;
    this.hover.style.transform = `translate(${x + 16}px, ${y + 18}px)`;
  }

  // values: [{ value, unit, level 0..1, bars: [..] }]
  setCards(values) {
    values.forEach((v, i) => {
      const c = this.cards[i];
      if (c.val._v !== v.value) c.val.textContent = c.val._v = v.value;
      if (c.unit._v !== v.unit) c.unit.textContent = c.unit._v = v.unit;
      if (c.bar) c.bar.style.width = `${Math.round(v.level * 100)}%`;
      if (c.bars.length && v.bars) c.bars.forEach((b, k) => (b.style.height = `${Math.round(12 + v.bars[k] * 88)}%`));
      if (c.wave) {
        this.waveData.push(v.level);
        this.waveData.shift();
        const g = c.wave.getContext('2d');
        g.clearRect(0, 0, 200, 36);
        g.strokeStyle = getComputedStyle(this.root).getPropertyValue('--accent');
        g.lineWidth = 2;
        g.beginPath();
        this.waveData.forEach((y, k) => g[k ? 'lineTo' : 'moveTo'](k * 4.08, 33 - y * 30));
        g.stroke();
      }
    });
  }
}
