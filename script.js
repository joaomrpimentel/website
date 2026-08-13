/* =========================================================
   JOTAVERSE — minimal vanilla JS
   ascii fit-to-width · active-section nav · footer year
   ========================================================= */

/* fit the wide ascii masthead to its container, set wrapper height */
function fitAscii() {
    const wrap = document.querySelector('.masthead');
    const pre = document.getElementById('ascii');
    if (!wrap || !pre) return;

    pre.style.setProperty('--ascii-scale', 1);          // measure at natural size
    const natW = pre.scrollWidth;
    const natH = pre.scrollHeight;
    if (!natW) return;

    const scale = Math.min(wrap.clientWidth / natW, 1.4);
    pre.style.setProperty('--ascii-scale', scale.toFixed(4));
    wrap.style.height = Math.ceil(natH * scale) + 'px';
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

    const CHUNK = 12;                // chars per slice
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
                on: false, s: 0,
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
       not to the ~500 chunks in the masthead. */
    let grid = new Map(), scale = 1;
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
    }
    measure();
    window.addEventListener('resize', measure);   // fitAscii runs on its own
    window.addEventListener('load', measure);

    const active = [];               // chunks currently moving or in range
    let t = 0;

    function wake(c) {
        if (!c.on) { c.on = true; active.push(c); }
    }

    function frame() {
        t += 0.016;

        if (orb.seen) {
            // orb is in viewport coords → convert to the pre's local space
            const rect = pre.getBoundingClientRect();
            const mx = (orb.x - rect.left) / scale;
            const my = (orb.y - rect.top) / scale;

            // wake every chunk in the orb's neighbourhood via the grid
            if (mx > -R && my > -R &&
                mx < pre.offsetWidth + R && my < pre.offsetHeight + R) {
                const gx0 = ((mx - R) / CELL) | 0, gx1 = ((mx + R) / CELL) | 0;
                const gy0 = ((my - R) / CELL) | 0, gy1 = ((my + R) / CELL) | 0;
                for (let gy = gy0; gy <= gy1; gy++) {
                    for (let gx = gx0; gx <= gx1; gx++) {
                        const cell = grid.get(gy * 4096 + gx);
                        if (cell) for (const c of cell) wake(c);
                    }
                }
            }

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

                // settled and out of range → clear styles, drop from active
                if (!near && moving < 0.04 &&
                    Math.abs(c.ox) < 0.08 && Math.abs(c.oy) < 0.08) {
                    c.ox = c.oy = c.vx = c.vy = 0;
                    c.el.style.cssText = '';
                    c.on = false; c.s = 0;
                    active[i] = active[active.length - 1];
                    active.pop();
                    continue;
                }

                const skew = Math.max(-14, Math.min(14, c.vx * 1.6));
                c.el.style.transform =
                    `translate(${c.ox.toFixed(2)}px,${c.oy.toFixed(2)}px)` +
                    ` skewX(${skew.toFixed(2)}deg)`;

                // any chunk in motion splits into green ghosts, including the
                // spring-back — the flicks on the rebound are the glitch.
                // no blur radius: blurred shadows on this many spans tank the
                // paint budget. the glyph goes green too, so the ghost/glyph
                // fringes average to neon green instead of red-mixing to orange.
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
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
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

    let dpr = 1, W = 0, H = 0;
    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth; H = window.innerHeight;
        cv.width = W * dpr; cv.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    // target = cursor, pos = orb center (lags), vel = velocity for stretch
    const target = { x: W / 2, y: H / 2 };
    const pos = { x: W / 2, y: H / 2 };
    const vel = { x: 0, y: 0 };
    let seen = false;

    window.addEventListener('pointermove', (e) => {
        target.x = e.clientX; target.y = e.clientY; seen = true;
    });

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

    function frame() {
        t += 0.016;
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

        ctx.clearRect(0, 0, W, H);

        // shed little balls while moving fast → fade out ~0.5s
        if (seen && speed > 5 && drops.length < 14 && Math.random() < 0.12) {
            const n = 1;
            for (let i = 0; i < n; i++) {
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
        }
        // update + draw droplets
        ctx.fillStyle = '#e8473b';
        for (let i = drops.length - 1; i >= 0; i--) {
            const d = drops[i];
            d.life -= 0.016;
            if (d.life <= 0) { drops.splice(i, 1); continue; }
            d.x += d.vx; d.y += d.vy;
            d.vx *= 0.92; d.vy *= 0.92;
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
            let mx = (pts[N - 1][0] + pts[0][0]) / 2;
            let my = (pts[N - 1][1] + pts[0][1]) / 2;
            ctx.moveTo(mx, my);
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
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
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
