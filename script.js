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
   can't keep up. that flag only shrinks the orb's backing store and its
   droplet count — it deliberately never touches the masthead, because a
   glitch effect that switches its own colours off mid-use reads as a bug.
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
   get shoved away from the cursor on a spring, so they wobble
   back with overshoot, splitting into green ghosts while they move.
   --------------------------------------------------------- */
/* live orb state, published by initOrb and read by the ascii jelly */
const orb = { x: 0, y: 0, speed: 0, seen: false };

function initAsciiJelly() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(hover: none)').matches) return;   // skip touch

    const pre = document.getElementById('ascii');
    if (!pre || pre.dataset.jelly) return;
    pre.dataset.jelly = '1';

    /* the halo is 57% of all raster work in this effect: a 26px blur re-drawn
       across the whole masthead every time a slice moves. so it gets lifted off
       the moving text and onto a twin that sits behind and never changes —
       rasterised once, composited free from then on. the slices themselves are
       drawn with no shadow at all. */
    const glow = pre.cloneNode(true);
    glow.id = 'ascii-glow';
    delete glow.dataset.jelly;
    pre.parentNode.insertBefore(glow, pre);

    /* halving the slice count is the biggest single win left on weak hardware:
       55.6fps vs 39.7 at 4x CPU, 41.5 vs 26.8 at 6x, because per-frame style
       and paint work scales with the number of spans. this used to change how
       the art rendered — widening it snapped glyphs differently and the whole
       masthead shifted. it no longer does: the halo now comes from the
       un-chunked twin, so chunking only moves the sharp text a subpixel.
       measured at 0.03% of pixels visibly different from the original. */
    const CHUNK = 24;                // chars per slice
    const lines = pre.textContent.split('\n');
    const frag = document.createDocumentFragment();
    const chunks = [];               // {el, cx, cy, ox, oy, vx, vy, on, s}

    lines.forEach((line, li) => {
        if (li) frag.appendChild(document.createTextNode('\n'));
        for (let i = 0; i < line.length; i += CHUNK) {
            const el = document.createElement('span');
            el.className = 'ascii-chunk';
            el.textContent = line.slice(i, i + CHUNK);
            frag.appendChild(el);
            chunks.push({
                el, cx: 0, cy: 0, ox: 0, oy: 0, vx: 0, vy: 0,
                on: false, s: 0, wx: 0, wy: 0, wk: 0,   // last written transform
            });
        }
    });
    pre.textContent = '';
    pre.appendChild(frag);

    const R = 190;                   // influence radius, local px
    const PUSH = 26;                 // shove strength
    const K = 0.11, DAMP = 0.84;     // spring constant / damping
    const CELL = 96;                 // spatial grid cell, local px

    /* cache untransformed layout centers (offsets are pre-scale) + rebuild grid.
       the grid keeps the per-frame loop proportional to the affected area,
       not to the chunks in the masthead. the pre's page-space origin is cached
       here too: reading getBoundingClientRect inside the frame forced a layout
       flush on every single tick. */
    let grid = new Map(), scale = 1;
    let baseL = 0, baseT = 0, boxW = 0, boxH = 0;
    let scrollX = window.scrollX, scrollY = window.scrollY;

    function measure() {
        grid = new Map();
        for (const c of chunks) {
            c.cx = c.el.offsetLeft + c.el.offsetWidth / 2;
            c.cy = c.el.offsetTop + c.el.offsetHeight / 2;
            const key = ((c.cy / CELL) | 0) * 4096 + ((c.cx / CELL) | 0);
            const cell = grid.get(key);
            if (cell) cell.push(c); else grid.set(key, [c]);
        }
        scale = parseFloat(
            getComputedStyle(pre).getPropertyValue('--ascii-scale')) || 1;
        const r = pre.getBoundingClientRect();
        scrollX = window.scrollX; scrollY = window.scrollY;
        baseL = r.left + scrollX;
        baseT = r.top + scrollY;
        boxW = pre.offsetWidth; boxH = pre.offsetHeight;
    }
    measure();
    window.addEventListener('resize', measure);   // fitAscii runs on its own
    window.addEventListener('load', measure);
    window.addEventListener('scroll', () => {
        scrollX = window.scrollX; scrollY = window.scrollY;
    }, { passive: true });

    const active = [];               // chunks currently moving or in range
    let t = 0;

    /* no layer promotion for the slices, and the measurement that says
       otherwise is a trap: promoting them cuts raster by 90% (2000ms → 200ms
       per sweep) but DELIVERS FEWER FRAMES — 19.0ms median and 17% janky vs
       16.7ms and 0%. raster runs off the main thread and was never the critical
       path here; churning will-change on hundreds of spans per frame is.
       optimise for frame intervals, not for totals. */
    function wake(c) {
        if (c.on) return;
        c.on = true;
        active.push(c);
    }

    function jellyTick() {
        if (!orb.seen) return false;
        t += 0.016;

        // orb is in viewport coords → convert to the pre's local space
        const mx = (orb.x + scrollX - baseL) / scale;
        const my = (orb.y + scrollY - baseT) / scale;

        // wake every chunk in the orb's neighbourhood via the grid
        if (mx > -R && my > -R && mx < boxW + R && my < boxH + R) {
            const gx0 = ((mx - R) / CELL) | 0, gx1 = ((mx + R) / CELL) | 0;
            const gy0 = ((my - R) / CELL) | 0, gy1 = ((my + R) / CELL) | 0;
            for (let gy = gy0; gy <= gy1; gy++) {
                for (let gx = gx0; gx <= gx1; gx++) {
                    const cell = grid.get(gy * 4096 + gx);
                    if (cell) for (const c of cell) wake(c);
                }
            }
        }

        let anyMoving = false;

        for (let i = active.length - 1; i >= 0; i--) {
            const c = active[i];
            const dx = c.cx - mx, dy = c.cy - my;
            const d2 = dx * dx + dy * dy;
            let fx = 0, fy = 0;

            const near = d2 < R * R;
            if (near) {
                const d = Math.sqrt(d2) || 0.001;
                const fall = 1 - d / R;
                const amp = PUSH * fall * fall;
                fx = (dx / d) * amp;
                fy = (dy / d) * amp * 0.55;      // flatter vertically
                // gooey shimmer so the deformed zone never sits still
                fx += Math.sin(t * 6 + c.cy * 0.08) * 3 * fall;
            }

            // spring back to rest → overshoot = jelly
            c.vx = (c.vx + fx - c.ox * K) * DAMP;
            c.vy = (c.vy + fy - c.oy * K) * DAMP;
            c.ox += c.vx; c.oy += c.vy;

            const moving = Math.abs(c.vx) + Math.abs(c.vy);
            if (moving > 0.05) anyMoving = true;

            // settled and out of range → clear styles, drop from active.
            // thresholds are deliberately coarse: sub-third-of-a-pixel ringing
            // is invisible, and every extra frame a slice stays in the active
            // set is another style write and another repaint of its box.
            if (!near && moving < 0.12 &&
                Math.abs(c.ox) < 0.3 && Math.abs(c.oy) < 0.3) {
                c.ox = c.oy = c.vx = c.vy = 0;
                c.el.style.cssText = '';
                c.on = false; c.s = 0; c.wx = c.wy = c.wk = 0;
                active[i] = active[active.length - 1];
                active.pop();
                continue;
            }

            // don't repaint a slice that hasn't visibly moved — the tail of the
            // spring is hundreds of sub-pixel deltas nobody can see
            const skew = Math.max(-14, Math.min(14, c.vx * 1.6));
            if (Math.abs(c.ox - c.wx) > 0.06 || Math.abs(c.oy - c.wy) > 0.06 ||
                Math.abs(skew - c.wk) > 0.25) {
                c.wx = c.ox; c.wy = c.oy; c.wk = skew;
                c.el.style.transform =
                    `translate(${c.ox.toFixed(2)}px,${c.oy.toFixed(2)}px)` +
                    ` skewX(${skew.toFixed(2)}deg)`;
            }

            // any chunk in motion splits into green ghosts, including the
            // spring-back — the flicks on the rebound are the glitch.
            // no blur radius: blurred shadows on this many spans tank the
            // paint budget. the glyph goes green too, so the ghost/glyph
            // fringes average to neon green instead of red-mixing to orange.
            // these shadows have no blur radius, so they are cheap — they stay
            // on regardless of how slow the machine is. the glitch is the point.
            const s = moving > 1 ? Math.min((moving * 1.3) | 0, 7) : 0;
            if (s !== c.s) {                     // quantized → few restyles
                c.s = s;
                if (s) {
                    c.el.style.color = '#39ff14';
                    c.el.style.textShadow =
                        `${s}px 0 rgba(140,255,0,0.7),` +
                        ` -${s}px 0 rgba(0,255,120,0.55)`;
                } else {
                    c.el.style.color = '';
                    c.el.style.textShadow = '';
                }
            }
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
