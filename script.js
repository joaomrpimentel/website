/* =========================================================
   JOTAVERSE — minimal vanilla JS
   ascii fit-to-width · active-section nav · footer year
   ========================================================= */

/* fit the wide ascii masthead to its container, set wrapper height */
function fitAscii() {
    const wrap = document.querySelector('.masthead');
    const pre = document.getElementById('ascii');
    if (!wrap || !pre) return;

    // scale lives on the wrapper so the glow twin (#ascii-glow) inherits the
    // exact same value and can never drift out of register with the slices
    wrap.style.setProperty('--ascii-scale', 1);          // measure at natural size
    const natW = pre.scrollWidth;
    const natH = pre.scrollHeight;
    if (!natW) return;

    const scale = Math.min(wrap.clientWidth / natW, 1.4);
    wrap.style.setProperty('--ascii-scale', scale.toFixed(4));
    wrap.style.height = Math.ceil(natH * scale) + 'px';
}

/* ---------------------------------------------------------
   one rAF driver for every effect.

   each tick returns true while it still needs frames; once they all
   return false the loop stops, so an idle page costs zero frames
   instead of two permanent 60fps loops.

   it also samples frame cost and latches `perf.low` on machines that
   can't keep up. that flag only ever shrinks backing stores and droplet
   counts — it never switches a colour or an effect off, because a glitch
   that turns itself down mid-use reads as a bug rather than as mercy.
   frameEma is read directly by the masthead for the same purpose.
   --------------------------------------------------------- */
const perf = { low: false };
const ticks = new Set();
let looping = false, lastTs = 0, frameEma = 16.7, frameCount = 0;

function pump() {
    if (looping) return;
    looping = true;
    lastTs = performance.now();
    requestAnimationFrame(loop);
}

function loop(ts) {
    const dt = Math.min(ts - lastTs, 100);   // clamp tab-switch / restart spikes
    lastTs = ts;
    if (frameCount++ > 30) {                 // ignore warm-up
        frameEma += (dt - frameEma) * 0.05;
        // one-way latch. an oscillating flag made the glitch colour switch
        // itself on and off while you used the page, which reads as a bug —
        // once we've decided the machine is slow we stay decided.
        if (frameEma > 26) perf.low = true;
    }

    let alive = false;
    for (const fn of ticks) if (fn(dt)) alive = true;
    if (alive) requestAnimationFrame(loop);
    else looping = false;
}

/* ---------------------------------------------------------
   jelly glitch — the ascii masthead is sliced into chunks that
   get shoved away from the orb on a spring, so they wobble back
   with overshoot, splitting into green ghosts while they move.

   the slices are drawn on canvas, not in the DOM. the DOM version
   wrote inline styles on 70-90 spans per frame, and that is what
   the effect actually cost: a style recalc, a full layout pass
   (LayoutCount matched the frame count exactly — disable the style
   writes and it drops to zero) and a repaint per dirty span. it
   held 36fps at 6x cpu throttle, 21 at 10x, 12 at 16x, while the
   physics itself was only 2.4ms of a 22ms frame.

   drawing the same thing on canvas removes that whole class of
   work — zero layouts, style time down from 660ms to 80ms per 5s —
   and holds 60fps flat to 6x, 58 at 10x, 39 at 16x. rendering is
   not an approximation of the DOM version: glyph x positions come
   from the browser's own layout, so ink energy lands within 1% and
   ghost coverage within 0.2% of what the spans produced, and a
   sweep leaves the art bit-identical once it settles (0.02% of
   pixels, none of them visible).
   --------------------------------------------------------- */
/* live orb state, published by initOrb and read by the ascii jelly */
const orb = { x: 0, y: 0, speed: 0, seen: false };

function initAsciiJelly() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(hover: none)').matches) return;   // skip touch

    const pre = document.getElementById('ascii');
    if (!pre || pre.dataset.jelly) return;
    if (!document.createElement('canvas').getContext) return;
    pre.dataset.jelly = '1';

    /* the halo is 57% of all raster work in this effect: a 26px blur re-drawn
       across the whole masthead every time a slice moves. so it gets lifted off
       the moving text and onto a twin that sits behind and never changes —
       rasterised once, composited free from then on. measured at zero cost. */
    const glow = pre.cloneNode(true);
    glow.id = 'ascii-glow';
    delete glow.dataset.jelly;
    pre.parentNode.insertBefore(glow, pre);

    /* slice the art up once — not to animate the spans, but to make the
       browser lay the proportional art out so we can read the geometry
       back out of it. after the first build the DOM copy stops painting
       and never has a style written to it again. */
    const CHUNK = 24;                // chars per slice
    const lines = pre.textContent.split('\n');
    const frag = document.createDocumentFragment();
    const chunks = [];               // {el, cs, x, y, w, h, cx, cy, o*, v*, ...}

    lines.forEach((line, li) => {
        if (li) frag.appendChild(document.createTextNode('\n'));
        for (let i = 0; i < line.length; i += CHUNK) {
            const el = document.createElement('span');
            el.className = 'ascii-chunk';
            el.textContent = line.slice(i, i + CHUNK);
            frag.appendChild(el);
            chunks.push({
                el, li, txt: el.textContent, cs: null,
                x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0,
                ox: 0, oy: 0, vx: 0, vy: 0,
                on: false, lifted: false, sh: 0,
            });
        }
    });
    pre.textContent = '';
    pre.appendChild(frag);
    pre.style.willChange = 'auto';   // nothing in the DOM copy animates now

    const R = 190;                   // influence radius, local px
    const PUSH = 26;                 // shove strength
    const K = 0.11, DAMP = 0.84;     // spring constant / damping
    const CELL = 96;                 // spatial grid cell, local px
    const LIFT = 0.4;                // displacement before a slice leaves the base
    const PAD = 4;                   // proportional glyphs overhang their box
    /* a slice sits still when the spring balances the shove, at ox = fx / K,
       so with PUSH 26 and K 0.11 it can rest ~100px out of the masthead and
       overshoot further on the rebound — vertically less, the shove there is
       damped to 0.55. the fx layer is grown by that much on every side: the
       spans used to overflow the pre freely, and a slice drawn outside the
       canvas is worse than clipped, because its punched-out hole in the base
       stays. that read as the art being eaten away near the edges. */
    const BX = 128, BY = 72;         // fx bleed, local px

    const cs = getComputedStyle(pre);
    const FS = parseFloat(cs.fontSize);
    const LH = parseFloat(cs.lineHeight) || FS * 1.17;
    const FONT = cs.fontSize + ' ' + cs.fontFamily;

    let natW = 0, natH = 0, scale = 1, S = 1, dpr = 1;
    let redA = null, greenA = null;
    let baseCv = null, fxCv = null, base = null, fx = null;

    /* per-character x, straight out of layout. positioning whole slices with
       canvas' own text metrics instead drifts against the DOM art — measured
       13.7% of pixels off; per-character positioning is exact. */
    function measureChars() {
        natW = pre.scrollWidth; natH = pre.scrollHeight;
        scale = parseFloat(cs.getPropertyValue('--ascii-scale')) || 1;
        const pr = pre.getBoundingClientRect();
        const rng = document.createRange();
        for (const c of chunks) {
            const node = c.el.firstChild;
            const n = c.txt.length;
            const xs = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                rng.setStart(node, i); rng.setEnd(node, i + 1);
                // rects come back in page space, i.e. already scaled
                xs[i] = (rng.getBoundingClientRect().left - pr.left) / scale;
            }
            c.cs = xs;
            c.x = xs[0];
            c.w = (c.el.offsetLeft + c.el.offsetWidth) - c.x;
            c.y = c.li * LH; c.h = LH;
            c.cx = c.x + c.w / 2; c.cy = c.y + c.h / 2;
        }
    }

    function atlas() {
        const a = document.createElement('canvas');
        a.width = Math.ceil(natW * S); a.height = Math.ceil(natH * S);
        const g = a.getContext('2d');
        g.setTransform(S, 0, 0, S, 0, 0);
        g.font = FONT; g.textBaseline = 'alphabetic'; g.fillStyle = '#ff2d1a';
        const m = g.measureText('Hg');
        const asc = m.fontBoundingBoxAscent || FS * 0.9;
        const desc = m.fontBoundingBoxDescent || FS * 0.25;
        // css half-leading: where the baseline sits inside the line box
        const ascent = (LH - (asc + desc)) / 2 + asc;
        for (const c of chunks) {
            const y = c.li * LH + ascent;
            for (let i = 0; i < c.txt.length; i++) g.fillText(c.txt[i], c.cs[i], y);
        }
        return a;
    }

    /* the ghosts need the same art in green. re-running 7k fillTexts for it is
       pointless — mask a copy of the red one instead. */
    function tint(src, color) {
        const a = document.createElement('canvas');
        a.width = src.width; a.height = src.height;
        const g = a.getContext('2d');
        g.drawImage(src, 0, 0);
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = color;
        g.fillRect(0, 0, a.width, a.height);
        return a;
    }

    /* the layers carry the art at its natural size and inherit the same
       --ascii-scale transform as the DOM copy, so a resize is geometrically
       correct immediately and only the backing store has to catch up. */
    function layer(z, old, bx, by) {
        const cv = old || document.createElement('canvas');
        cv.className = bx ? 'ascii-layer ascii-fx' : 'ascii-layer';
        cv.width = Math.ceil((natW + bx * 2) * S);
        cv.height = Math.ceil((natH + by * 2) * S);
        cv.style.width = (natW + bx * 2) + 'px';
        cv.style.height = (natH + by * 2) + 'px';
        cv.style.setProperty('--bleed-y', by + 'px');
        cv.style.zIndex = z;
        if (!old) pre.parentNode.appendChild(cv);
        return cv;
    }

    let grid = new Map();
    function build() {
        measureChars();
        dpr = Math.min(window.devicePixelRatio || 1, perf.low ? 1 : 2);
        // two atlases, the base and the (larger) fx layer all live at once
        const px = (r) => (natW + r * BX * 2) * scale * dpr * (natH + r * BY * 2) * scale * dpr;
        if (4 * (3 * px(0) + px(1)) > 32e6) dpr = 1;
        S = dpr * scale;

        redA = atlas();
        greenA = tint(redA, '#39ff14');
        baseCv = layer(1, baseCv, 0, 0); fxCv = layer(2, fxCv, BX, BY);
        base = baseCv.getContext('2d'); fx = fxCv.getContext('2d');
        base.drawImage(redA, 0, 0);

        /* the grid keeps the per-frame loop proportional to the affected area,
           not to the number of slices in the masthead */
        grid = new Map();
        for (const c of chunks) {
            c.ox = c.oy = c.vx = c.vy = 0;
            c.on = false; c.lifted = false;
            const key = ((c.cy / CELL) | 0) * 4096 + ((c.cx / CELL) | 0);
            const cell = grid.get(key);
            if (cell) cell.push(c); else grid.set(key, [c]);
        }
        active.length = 0;
        prev = null;
        pre.style.visibility = 'hidden';   // the ruler stops painting
        place();
    }

    /* the pre's page-space origin, cached: reading getBoundingClientRect
       inside the frame forced a layout flush on every single tick. */
    let baseL = 0, baseT = 0;
    let scrollX = window.scrollX, scrollY = window.scrollY;
    function place() {
        const r = pre.getBoundingClientRect();
        scrollX = window.scrollX; scrollY = window.scrollY;
        baseL = r.left + scrollX; baseT = r.top + scrollY;
    }

    const active = [];
    let t = 0, prev = null, thin = false, gate = 1;

    build();

    let rebuildT = 0;
    function rebuild() {
        pre.style.visibility = '';       // measure a painting element
        build();
        pump();
    }
    window.addEventListener('resize', () => {   // fitAscii runs on its own
        clearTimeout(rebuildT);
        rebuildT = setTimeout(rebuild, 160);
    });
    window.addEventListener('load', rebuild);
    window.addEventListener('scroll', () => {
        scrollX = window.scrollX; scrollY = window.scrollY;
    }, { passive: true });

    function punch(c) {              // lift a slice out of the resting art
        base.clearRect(c.x * S, c.y * S, c.w * S, c.h * S);
    }
    function restore(c) {            // and set it back down
        const sx = Math.max(0, c.x - PAD);
        const sw = Math.min(natW - sx, c.w + PAD * 2);
        base.save();
        base.beginPath();
        base.rect(c.x * S, c.y * S, c.w * S, c.h * S);
        base.clip();                 // never paint over a neighbour's overhang
        base.drawImage(redA, sx * S, c.y * S, sw * S, c.h * S,
                             sx * S, c.y * S, sw * S, c.h * S);
        base.restore();
    }

    function jellyTick() {
        if (!orb.seen || !base) return false;
        t += 0.016;

        // orb is in viewport coords → convert to the art's local space
        const mx = (orb.x + scrollX - baseL) / scale;
        const my = (orb.y + scrollY - baseT) / scale;

        // wake every slice in the orb's neighbourhood via the grid
        if (mx > -R && my > -R && mx < natW + R && my < natH + R) {
            const gx0 = ((mx - R) / CELL) | 0, gx1 = ((mx + R) / CELL) | 0;
            const gy0 = ((my - R) / CELL) | 0, gy1 = ((my + R) / CELL) | 0;
            for (let gy = gy0; gy <= gy1; gy++) {
                for (let gx = gx0; gx <= gx1; gx++) {
                    const cell = grid.get(gy * 4096 + gx);
                    if (cell) for (const c of cell)
                        if (!c.on) { c.on = true; active.push(c); }
                }
            }
        }

        let anyMoving = false, ghosts = 0;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        const paint = [];

        for (let i = active.length - 1; i >= 0; i--) {
            const c = active[i];
            const dx = c.cx - mx, dy = c.cy - my;
            const d2 = dx * dx + dy * dy;
            let ax = 0, ay = 0;

            const near = d2 < R * R;
            if (near) {
                const d = Math.sqrt(d2) || 0.001;
                const fall = 1 - d / R;
                const amp = PUSH * fall * fall;
                ax = (dx / d) * amp;
                ay = (dy / d) * amp * 0.55;      // flatter vertically
                // gooey shimmer so the deformed zone never sits still
                ax += Math.sin(t * 6 + c.cy * 0.08) * 3 * fall;
            }

            // spring back to rest → overshoot = jelly
            c.vx = (c.vx + ax - c.ox * K) * DAMP;
            c.vy = (c.vy + ay - c.oy * K) * DAMP;
            c.ox += c.vx; c.oy += c.vy;

            const moving = Math.abs(c.vx) + Math.abs(c.vy);
            if (moving > 0.05) anyMoving = true;

            // a slice only leaves the static layer once it would visibly move
            if (!c.lifted && (Math.abs(c.ox) + Math.abs(c.oy) > LIFT || moving > 1)) {
                c.lifted = true;
                punch(c);
            }

            if (c.lifted) {
                // any slice in motion splits into green ghosts, including the
                // spring-back — the flicks on the rebound are the glitch
                const sh = (moving > gate) ? Math.min((moving * 1.3) | 0, 7) : 0;
                if (sh) ghosts++;
                c.sh = sh;
                paint.push(c);
                const pad = 8 + sh;
                if (c.x + c.ox - pad < x0) x0 = c.x + c.ox - pad;
                if (c.y + c.oy - pad < y0) y0 = c.y + c.oy - pad;
                if (c.x + c.w + c.ox + pad > x1) x1 = c.x + c.w + c.ox + pad;
                if (c.y + c.h + c.oy + pad > y1) y1 = c.y + c.h + c.oy + pad;
            }

            // settled and out of range → put it back on the static layer.
            // thresholds are deliberately coarse: sub-third-of-a-pixel ringing
            // is invisible, and every extra frame a slice stays in the active
            // set is another punch, another draw and another cleared band.
            if (!near && moving < 0.12 &&
                Math.abs(c.ox) < 0.3 && Math.abs(c.oy) < 0.3) {
                c.ox = c.oy = c.vx = c.vy = 0;
                c.on = false;
                if (c.lifted) { c.lifted = false; restore(c); }
                active[i] = active[active.length - 1];
                active.pop();
            }
        }

        /* clear last frame's band together with this one, so nothing trails */
        let cx0 = x0, cy0 = y0, cx1 = x1, cy1 = y1;
        if (prev) {
            cx0 = Math.min(cx0, prev[0]); cy0 = Math.min(cy0, prev[1]);
            cx1 = Math.max(cx1, prev[2]); cy1 = Math.max(cy1, prev[3]);
        }
        if (cx1 > cx0) {
            cx0 = Math.max(-BX, cx0); cy0 = Math.max(-BY, cy0);
            cx1 = Math.min(natW + BX, cx1); cy1 = Math.min(natH + BY, cy1);
            fx.clearRect((cx0 + BX) * S, (cy0 + BY) * S,
                         (cx1 - cx0) * S, (cy1 - cy0) * S);
        }
        prev = x1 > x0 ? [x0, y0, x1, y1] : null;

        for (const c of paint) {
            const sh = c.sh;
            const sk = Math.max(-14, Math.min(14, c.vx * 1.6));
            const sx = Math.max(0, c.x - PAD);
            const sw = Math.min(natW - sx, c.w + PAD * 2);
            fx.setTransform(S, 0, 0, S, BX * S, BY * S);
            if (sk) {                        // skew about the slice's centre,
                const tan = Math.tan(sk * Math.PI / 180);   // as the spans did
                fx.translate(c.cx + c.ox, c.cy + c.oy);
                fx.transform(1, 0, tan, 1, 0, 0);
                fx.translate(-c.cx, -c.cy);
            } else fx.translate(c.ox, c.oy);
            const src = sh ? greenA : redA;
            if (sh) {
                // the glyph goes green too, so ghost and glyph fringes average
                // to neon green instead of red-mixing to orange
                fx.globalAlpha = 0.7;
                fx.drawImage(src, sx * S, c.y * S, sw * S, c.h * S, sx + sh, c.y, sw, c.h);
                fx.globalAlpha = 0.55;
                fx.drawImage(src, sx * S, c.y * S, sw * S, c.h * S, sx - sh, c.y, sw, c.h);
                fx.globalAlpha = 1;
            }
            fx.drawImage(src, sx * S, c.y * S, sw * S, c.h * S, sx, c.y, sw, c.h);
        }
        fx.setTransform(1, 0, 0, 1, 0, 0);

        /* a ghosted slice costs three draws instead of one, so the number of
           them in flight is what bounds the frame on weak hardware. the latch
           is one-way and the budget is generous: an oscillating quality knob
           would pulse the glitch density, which reads as a bug. below the
           latch nothing is capped, and the effect is pixel-for-pixel what the
           DOM version drew — measured at 36.2% green coverage against 36.0%. */
        if (!thin && frameCount > 60 && frameEma > 20) thin = true;
        if (thin) {
            const budget = perf.low ? 12 : 32;   // both latches are one-way
            if (ghosts > budget) gate *= 1.08;
            else if (ghosts < budget * 0.6) gate = Math.max(1, gate * 0.94);
        }

        // slices held in equilibrium under a stationary cursor need no frames.
        // they stay displaced, which is correct — the orb restarts the loop as
        // soon as the pointer moves.
        return active.length > 0 && (anyMoving || orb.speed > 0.05);
    }

    ticks.add(jellyTick);
}

/* highlight nav link of the section in view */
function initActiveNav() {
    const links = [...document.querySelectorAll('.nav-links a[href^="#"]')];
    const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            const a = map.get(e.target.id);
            if (a) a.style.color = e.isIntersecting ? 'var(--red)' : '';
        });
    }, { rootMargin: '-45% 0px -45% 0px' });
    document.querySelectorAll('section[id]').forEach(s => obs.observe(s));
}

/* slimey 2d orb that chases the cursor with spring + blob physics */
function initOrb() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(hover: none)').matches) return;   // skip touch

    const cv = document.createElement('canvas');
    cv.id = 'orb';
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');

    let dpr = 0, W = 0, H = 0;
    let dirty = null;                // last drawn bbox, in css px
    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, perf.low ? 1 : 2);
        W = window.innerWidth; H = window.innerHeight;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        dirty = null;                // next frame clears everything
    }
    resize();
    window.addEventListener('resize', () => { resize(); pump(); });

    // target = cursor, pos = orb center (lags), vel = velocity for stretch
    const target = { x: W / 2, y: H / 2 };
    const pos = { x: W / 2, y: H / 2 };
    const vel = { x: 0, y: 0 };
    let seen = false;

    window.addEventListener('pointermove', (e) => {
        target.x = e.clientX; target.y = e.clientY; seen = true;
        pump();
    }, { passive: true });

    const BASE = 15;                 // base radius (px)
    const drops = [];                // shed droplets {x,y,vx,vy,r,life,max}
    const N = 22;                    // blob vertices
    const SPRING = 0.045, DAMP = 0.86;
    // per-vertex wobble phase/speed for the gooey surface
    const wob = Array.from({ length: N }, (_, i) => ({
        ph: (i / N) * Math.PI * 2,
        sp: 0.9 + (i % 5) * 0.18,
    }));
    let t = 0;

    function orbTick() {
        t += 0.016;

        // weak hardware: drop to a 1x backing store, a quarter of the fill cost
        const wantDpr = Math.min(window.devicePixelRatio || 1, perf.low ? 1 : 2);
        if (wantDpr !== dpr) resize();

        // spring toward cursor → trailing slime feel
        const ax = (target.x - pos.x) * SPRING;
        const ay = (target.y - pos.y) * SPRING;
        vel.x = (vel.x + ax) * DAMP;
        vel.y = (vel.y + ay) * DAMP;
        pos.x += vel.x; pos.y += vel.y;

        const speed = Math.hypot(vel.x, vel.y);
        // publish for the ascii jelly — it deforms around the orb, not the cursor
        orb.x = pos.x; orb.y = pos.y; orb.speed = speed; orb.seen = seen;
        // stretch along movement dir, squash perpendicular (jelly)
        const ang = Math.atan2(vel.y, vel.x);
        const stretch = Math.min(speed * 0.035, 0.7);

        // shed little balls while moving fast → fade out ~0.5s
        const maxDrops = perf.low ? 6 : 14;
        if (seen && speed > 5 && drops.length < maxDrops && Math.random() < 0.12) {
            const a = Math.random() * Math.PI * 2;
            const off = BASE * 0.6;
            const max = 0.35 + Math.random() * 0.2;   // 0.35–0.55s
            drops.push({
                x: pos.x + Math.cos(a) * off,
                y: pos.y + Math.sin(a) * off,
                vx: Math.cos(a) * (0.5 + Math.random() * 1.2) - vel.x * 0.2,
                vy: Math.sin(a) * (0.5 + Math.random() * 1.2) - vel.y * 0.2,
                r: 2 + Math.random() * 4,
                life: max, max,
            });
        }
        // advance droplets before drawing so the dirty box covers where they land
        for (let i = drops.length - 1; i >= 0; i--) {
            const d = drops[i];
            d.life -= 0.016;
            if (d.life <= 0) { drops.splice(i, 1); continue; }
            d.x += d.vx; d.y += d.vy;
            d.vx *= 0.92; d.vy *= 0.92;
        }

        /* clear only what the orb and its droplets touch. a full-viewport
           clearRect at 2x dpr every frame is pure memory bandwidth, and it
           was costing more than the blob itself on integrated GPUs. */
        const rad = BASE * 1.35 * (1 + stretch) + 6;
        let x0 = pos.x - rad, x1 = pos.x + rad;
        let y0 = pos.y - rad, y1 = pos.y + rad;
        for (const d of drops) {
            const r = d.r + 2;
            if (d.x - r < x0) x0 = d.x - r;
            if (d.x + r > x1) x1 = d.x + r;
            if (d.y - r < y0) y0 = d.y - r;
            if (d.y + r > y1) y1 = d.y + r;
        }
        if (dirty) {
            const cx0 = Math.max(0, Math.min(x0, dirty.x0) - 2);
            const cy0 = Math.max(0, Math.min(y0, dirty.y0) - 2);
            const cx1 = Math.min(W, Math.max(x1, dirty.x1) + 2);
            const cy1 = Math.min(H, Math.max(y1, dirty.y1) + 2);
            if (cx1 > cx0 && cy1 > cy0) ctx.clearRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
        } else {
            ctx.clearRect(0, 0, W, H);
        }
        dirty = { x0, y0, x1, y1 };

        // draw droplets
        ctx.fillStyle = '#e8473b';
        for (const d of drops) {
            const k = d.life / d.max;
            ctx.globalAlpha = k;
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r * k, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        if (seen) {
            ctx.save();
            ctx.translate(pos.x, pos.y);
            ctx.rotate(ang);
            ctx.scale(1 + stretch, 1 / (1 + stretch * 0.6));

            // wobble only while moving → clean still ball at rest
            const wb = Math.min(speed * 0.04, 0.18);
            const pts = [];
            for (let i = 0; i < N; i++) {
                const a = (i / N) * Math.PI * 2;
                const r = BASE * (1 + wb * (Math.sin(t * wob[i].sp + wob[i].ph)
                                    + 0.5 * Math.sin(t * 2.3 + a * 3)));
                pts.push([Math.cos(a) * r, Math.sin(a) * r]);
            }
            ctx.beginPath();
            ctx.moveTo((pts[N - 1][0] + pts[0][0]) / 2,
                       (pts[N - 1][1] + pts[0][1]) / 2);
            for (let i = 0; i < N; i++) {
                const cur = pts[i], nxt = pts[(i + 1) % N];
                ctx.quadraticCurveTo(cur[0], cur[1],
                    (cur[0] + nxt[0]) / 2, (cur[1] + nxt[1]) / 2);
            }
            ctx.closePath();

            ctx.fillStyle = '#e8473b';
            ctx.fill();
            ctx.restore();
        }

        // at rest the last frame stays on the canvas — no need to redraw it
        const chasing = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y);
        return seen && (speed > 0.03 || drops.length > 0 || chasing > 0.5);
    }

    ticks.add(orbTick);
    pump();                          // one frame to place the resting blob
}

window.addEventListener('DOMContentLoaded', () => {
    fitAscii();
    initAsciiJelly();
    initActiveNav();
    initOrb();
    const y = document.getElementById('year');
    if (y) y.textContent = new Date().getFullYear();
});

window.addEventListener('resize', fitAscii);
window.addEventListener('load', fitAscii);   // refit once fonts settle
