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
      </header>
      <div class="head">
        <div class="eyebrow">${cfg.code}</div>
        <h1>${cfg.name}</h1>
        <div class="plate"></div>
        <div class="now"><b></b><span></span></div>
        <div class="prog"><i></i></div>
      </div>
      <nav class="sections"></nav>
      <aside class="mach"></aside>
      <svg class="wires"></svg>
      <div class="labels"></div>
      <div class="hover"></div>
      <aside class="partcard"></aside>
      <div class="pad"><button data-pad="fwd:1" aria-label="Forward">▲</button><button data-pad="turn:1" aria-label="Turn left">◀</button><button data-pad="fwd:-1" aria-label="Back">▼</button><button data-pad="turn:-1" aria-label="Turn right">▶</button></div>
      <div class="menus"></div>
      <footer class="dock"></footer>
      <div class="credit">${cfg.credit}</div>
      <div class="hint">Drag to turn · scroll to zoom · click a part · WASD to walk</div>`;
    const q = (s) => root.querySelector(s);
    this.prog = q('.prog');
    this.progBar = q('.prog i');
    this.nowTitle = q('.now b');
    this.nowText = q('.now span');
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

    // data plate along the top: fixed facts first, then what he is doing right now
    const plate = q('.plate');
    this.plate = {};
    const cell = (key, label, value = '') => {
      const c = el('div', 'cell', `<label>${label}</label><b>${value}</b>`);
      plate.append(c);
      this.plate[key] = c.querySelector('b');
    };
    for (const [label, value] of cfg.spec.top) cell(label, label, value);
    cell('parts', 'Build');
    cell('form', 'Form');
    cell('state', 'State');

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
    row('teardown', 'Teardown', ['Every part apart', 'Click again to spread every piece']);

    // machinery panel, right: live readings on top, the fixed build sheet under them
    const mach = q('.mach');
    mach.innerHTML = `<h3>Machinery</h3><div class="meters"></div><h3>Build sheet</h3><dl class="sheet">${cfg.spec.machinery.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
    const live = mach.querySelector('.meters');
    this.meters = {};
    for (const m of cfg.meters) {
      const r = el('div', 'meter', `<label>${m.label}</label><div class="val"><b>0</b><u>${m.unit}</u></div>${m.bars ? '<div class="bars">' + '<i></i>'.repeat(6) + '</div>' : m.wave ? '<canvas width="200" height="30"></canvas>' : '<div class="bar"><i></i></div>'}`);
      live.append(r);
      this.meters[m.id] = { val: r.querySelector('b'), bar: r.querySelector('.bar i'), bars: [...r.querySelectorAll('.bars i')], wave: r.querySelector('canvas'), row: r };
    }
    this.waveData = new Array(50).fill(0.5);

    // dock: each button opens its own list of options above it
    const dock = q('.dock');
    this.menus = q('.menus');
    this.menuButtons = {};
    this.openMenu = null;
    const menuButton = (id, title) => {
      const b = el('button', 'dbtn', `<label>${title}</label><span class="cur"></span><i class="caret"></i>`);
      b.setAttribute('aria-haspopup', 'true');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleMenu(id);
      });
      dock.append(b);
      const m = el('div', 'menu');
      m.dataset.menu = id;
      m.addEventListener('click', (e) => e.stopPropagation());
      this.menus.append(m);
      this.menuButtons[id] = { b, cur: b.querySelector('.cur'), m };
      return m;
    };
    const option = (menu, html, fn, note = '') => {
      const o = el('button', 'opt', `<span>${html}</span>${note ? `<small>${note}</small>` : ''}`);
      o.addEventListener('click', () => {
        fn();
        this.toggleMenu(null);
      });
      menu.append(o);
      return o;
    };
    const sw = (l) => `<i class="sw" style="--a:${l.swatch[0]};--b:${l.swatch[1]};--c:${l.swatch[2]}"></i>`;

    this.formOpts = {};
    const mForm = menuButton('form', 'Form');
    for (const [id, f] of Object.entries(cfg.forms)) this.formOpts[id] = option(mForm, f.label, () => on.form(id), f.caption);

    this.lineOpts = {};
    const mLine = menuButton('line', 'Colour');
    mLine.classList.add('two');
    for (const l of cfg.lines) this.lineOpts[l.id] = option(mLine, `${sw(l)}${l.name}`, () => on.line(l.id));
    this.swatchOf = Object.fromEntries(cfg.lines.map((l) => [l.id, `${sw(l)}${l.name}`]));

    this.stateOpts = {};
    const mState = menuButton('state', 'State');
    for (const [id, s] of Object.entries(cfg.states)) this.stateOpts[id] = option(mState, s.label, () => on.state(id), s.note || '');

    this.wingOpts = {};
    const mWings = menuButton('wings', 'Wings');
    this.wingOpts.open = option(mWings, 'Spread', () => on.wings(true), 'Arm swings up, blades fan out');
    this.wingOpts.folded = option(mWings, 'Folded', () => on.wings(false), 'Blades stack and stow behind his back');

    const mView = menuButton('view', 'View');
    const zoomRow = el('div', 'optrow');
    zoomRow.append(this.chip('−', () => on.zoom(-1), 'sq'));
    this.zoomLabel = el('span', 'read', 'Zoom 100%');
    zoomRow.append(this.zoomLabel, this.chip('+', () => on.zoom(1), 'sq'));
    mView.append(zoomRow);
    const speedRow = el('div', 'optrow');
    this.speedChips = {};
    for (const s of cfg.speeds) speedRow.append((this.speedChips[s] = this.chip(`${s}×`, () => on.speed(s))));
    mView.append(el('label', 'optlabel', 'Speed'), speedRow);
    option(mView, 'Reset view', () => on.home(), 'Back to the three-quarter view');

    this.setZoom(1);
    const tourBtn = el('button', 'dbtn solo', '<label>Guided</label><span class="cur">▶ Tour</span>');
    tourBtn.addEventListener('click', () => on.tourAll());
    dock.append(tourBtn);
    this.tourBtn = tourBtn.querySelector('.cur');

    window.addEventListener('click', () => this.toggleMenu(null));
    window.addEventListener('keydown', (e) => e.key === 'Escape' && this.toggleMenu(null));
    window.addEventListener('resize', () => this.toggleMenu(null));

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

  // Open one dock menu above its button (or close them all with null).
  toggleMenu(id) {
    if (id === this.openMenu) id = null;
    this.openMenu = id;
    for (const [k, { b, m }] of Object.entries(this.menuButtons)) {
      const on = k === id;
      b.classList.toggle('open', on);
      m.classList.toggle('on', on);
      if (!on) continue;
      const r = b.getBoundingClientRect();
      const host = this.root.getBoundingClientRect();
      m.style.bottom = `${host.bottom - r.top + 8}px`;
      const w = m.offsetWidth;
      m.style.left = `${Math.max(8, Math.min(host.width - w - 8, r.left - host.left + r.width / 2 - w / 2))}px`;
    }
  }

  pick(map, id) {
    for (const [k, c] of Object.entries(map)) c.classList.toggle('on', k === id);
  }

  setForm(id) {
    this.pick(this.formOpts, id);
    this.menuButtons.form.cur.textContent = this.plate.form.textContent = this.cfg.forms[id].label;
  }

  setLine(id, accent) {
    this.pick(this.lineOpts, id);
    this.menuButtons.line.cur.innerHTML = this.swatchOf[id];
    this.root.style.setProperty('--accent', accent);
  }

  setState(id) {
    this.pick(this.stateOpts, id);
    this.menuButtons.state.cur.textContent = this.plate.state.textContent = this.cfg.states[id].label;
  }

  setWings(open) {
    this.pick(this.wingOpts, open ? 'open' : 'folded');
    this.menuButtons.wings.cur.textContent = open ? 'Spread' : 'Folded';
  }

  setSection(id) {
    this.pick(this.sectionRows, id);
  }

  setChapter(id) {
    this.tourBtn.textContent = id ? '■ Stop tour' : '▶ Tour';
    this.prog.classList.toggle('on', !!id);
  }

  setProgress(k) {
    this.progBar.style.width = `${k * 100}%`;
  }

  setParts(parts, pieces) {
    this.plate.parts.textContent = `${parts} parts · ${pieces} pieces`;
  }

  // The line under the data plate: what is open or happening, and one line about it.
  setCaption(title, text = '') {
    const key = `${title}|${text}`;
    if (this._cap === key) return;
    this._cap = key;
    this.nowTitle.textContent = title;
    this.nowText.textContent = text;
  }

  setZoom(z) {
    this.zoomLabel.textContent = this.menuButtons.view.cur.textContent = `Zoom ${Math.round(z * 100)}%`;
  }

  setSpeed(s) {
    this.pick(this.speedChips, String(s));
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

  // values: { meterId: { value, level 0..1, bars: [..] } }
  setMeters(values) {
    for (const [id, v] of Object.entries(values)) {
      const c = this.meters[id];
      if (!c) continue;
      if (c.val._v !== v.value) c.val.textContent = c.val._v = v.value;
      if (c.bar) c.bar.style.width = `${Math.round(Math.max(0, Math.min(1, v.level)) * 100)}%`;
      if (c.bars.length && v.bars) c.bars.forEach((b, k) => (b.style.height = `${Math.round(12 + v.bars[k] * 88)}%`));
      c.row.classList.toggle('hot', !!v.hot);
      if (c.wave) {
        this.waveData.push(v.level);
        this.waveData.shift();
        const g = c.wave.getContext('2d');
        g.clearRect(0, 0, 200, 30);
        g.strokeStyle = getComputedStyle(this.root).getPropertyValue('--accent');
        g.lineWidth = 2;
        g.beginPath();
        this.waveData.forEach((y, k) => g[k ? 'lineTo' : 'moveTo'](k * 4.08, 27 - Math.min(1, y) * 24));
        g.stroke();
      }
    }
  }
}
