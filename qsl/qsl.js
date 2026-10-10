/* =========================================================
   QSL — a card that writes itself
   one canvas at print size (140×90mm @ ~380dpi). the printed
   part comes from the current edition; the pen part is written
   in live, one stroke-wipe per character, and keeps writing as
   the UTC minute rolls over or the visitor types their call.
   ========================================================= */

/* ---------- editions ----------
   one card per season. an edition is live from its `from` date until
   the day before the next one's `from`; after that it moves to the log,
   frozen on its last active day. queue the next card by appending it
   here with a future `from` — it takes over by itself on that day. */
const EDITIONS = [
    {
        no: 1, from: '2026-10-09',
        paper: '#f3e8c9', ink: '#2741a6', table: '#1d1b19', pen: '#22369a',
        call: 'PP1J0TA', country: 'BRASIL',
        club1: 'JOTAVERSE', club2: 'ESPÍRITO SANTO',
        cq: 'W3', itu: '65', loc: 'JT04rd',
        name: 'JOÃO PIMENTEL', addr1: 'VITÓRIA · ES', addr2: 'BRASIL',
        mhz: '14.205', rst: '59', mode: 'SSB', qsl: 'pse',
        art: 'entoloma',    // 'entoloma' | 'tower' | an image path relative to /qsl/
        artName: 'Entoloma virescens s.l.',
        artNote: 'A blue mushroom that grows here in Espírito Santo, blue from cap to stem.',
    },
];

const W = 2100, H = 1350;
const PRINT = '"Archivo", "Helvetica Neue", Arial, sans-serif';
const BLACK = '"Archivo Black", "Arial Black", sans-serif';
const HAND  = '"Reenie Beanie", "Comic Sans MS", cursive';
const CHAR_MS = 115;        // one pen character
const GAP_MS = 260;         // pen lift between cells
const DAY = 86400000;
const TO_KEY = 'qsl.to';

/* card geometry, shared by drawing and the TO RADIO overlay in css */
const T = { x0: 110, x1: 2010, y0: 680, y1: 1030, split: 540 };
T.r1 = T.y0 + 92; T.r2 = T.r1 + 92;
T.cw = (T.x1 - T.split) / 7;
const SIG = { x: 790, y: 1050, w: 560, h: 230 };
const CELLS = ['day', 'month', 'year', 'utc', 'mhz', 'rst', 'mode'];

const cv = document.getElementById('card');
const ctx = cv.getContext('2d');
const toInput = document.getElementById('to');

/* ---------- helpers ---------- */

function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
function rng(seed) {                       // mulberry32
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const up = (v) => (v || '').toLocaleUpperCase('pt-BR');
const slash = (v) => v.replace(/0/g, 'Ø');
const pad2 = (n) => String(n).padStart(2, '0');
const fmtLoc = (v) => up(v.slice(0, 4)) + v.slice(4, 6).toLowerCase() + v.slice(6);
const ymd = (d) => d.toISOString().slice(0, 10);
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const human = (d) => `${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

const startOf = (ed) => new Date(ed.from + 'T00:00:00Z');
function lastDayOf(ed) {
    const next = EDITIONS[EDITIONS.indexOf(ed) + 1];
    return next ? new Date(startOf(next) - DAY) : null;
}
function liveEdition(now) {
    const today = ymd(now);
    let cur = EDITIONS[0];
    for (const ed of EDITIONS) if (ed.from <= today) cur = ed;
    return cur;
}

function line(g, x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }

function printText(g, text, x, y, weight, size, align = 'left', maxW = 9999, family = PRINT) {
    if (!text) return;
    g.font = `${weight} ${size}px ${family}`;
    const w = g.measureText(text).width;
    if (w > maxW) g.font = `${weight} ${Math.floor(size * maxW / w)}px ${family}`;
    g.textAlign = align;
    g.fillText(text, x, y);
}

/* ---------- paper grain, built once ---------- */

const grain = (() => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const gx = c.getContext('2d');
    const img = gx.createImageData(W, H);
    const d = img.data, r = rng(7);
    for (let i = 0; i < d.length; i += 4) {
        const v = 255 - (r() * r() * 46) | 0;   // mostly white, sparse darker specks
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    gx.putImageData(img, 0, 0);
    const vg = gx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(1, 'rgba(150,135,110,0.28)');
    gx.fillStyle = vg; gx.fillRect(0, 0, W, H);
    return c;
})();

/* ---------- pen ----------
   a value is written char by char: each char has its own start time
   and is revealed by a left→right wipe, which reads as a stroke at
   this size. jitter is seeded per (cell, index, char) so ink that is
   already down never moves when more gets written after it. */

function hand(g, key, text, times, x, cy, size, maxW, align, now, pen) {
    if (!text) return x;
    g.font = `400 ${size}px ${HAND}`;
    const total = g.measureText(text).width;
    if (total > maxW) { size = size * maxW / total; g.font = `400 ${size}px ${HAND}`; }
    const width = Math.min(total, maxW);
    let cx = align === 'center' ? x - width / 2 : x;
    const tilt = (rng(hash(key))() - 0.5) * 0.05;
    g.save();
    g.fillStyle = g.strokeStyle = pen;
    g.lineWidth = size * 0.022;
    g.lineJoin = 'round';
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    let i = 0;
    for (const ch of text) {
        const cw = g.measureText(ch).width;
        const p = times ? clamp01((now - times[i]) / CHAR_MS) : 1;
        if (p > 0) {
            const r = rng(hash(key + i + ch));
            g.save();
            g.translate(cx + cw / 2, cy + size * 0.28 + (r() - 0.5) * size * 0.07);
            g.rotate(tilt + (r() - 0.5) * 0.14);
            if (p < 1) {
                g.beginPath();
                g.rect(-cw / 2 - size * 0.1, -size, (cw + size * 0.2) * p, size * 1.6);
                g.clip();
            }
            g.fillText(ch, -cw / 2, 0);
            g.strokeText(ch, -cw / 2, 0);
            g.restore();
        }
        cx += cw; i++;
    }
    g.restore();
    return cx;
}

/* a polyline that draws itself up to fraction p */
function strokePath(g, pts, p) {
    const n = Math.floor(pts.length * clamp01(p));
    if (n < 2) return;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.stroke();
}
function quadPts(pts, x0, y0, cx, cy, x1, y1, steps = 24) {
    for (let i = 0; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        pts.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
    }
    return pts;
}

function drawCheck(g, x, y, s, p, pen) {
    const pts = [];
    quadPts(pts, x + s * 0.12, y + s * 0.52, x + s * 0.3, y + s * 0.7, x + s * 0.42, y + s * 0.92, 10);
    quadPts(pts, x + s * 0.42, y + s * 0.92, x + s * 0.75, y + s * 0.2, x + s * 1.35, y - s * 0.18, 18);
    g.save();
    g.strokeStyle = pen; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
    strokePath(g, pts, p);
    g.restore();
}

/* signature: one fast ballpoint scrawl, drawn along its own path.
   abstract on purpose, like a real autograph: a tall J hook, a loop
   for the 0, a T stem, an 'a' that collapses into a trailing wiggle,
   then the T cross and a long underline. points live in a 1000×400
   box and get smoothed with catmull-rom. */
const SIG_STROKES = [
    [[60, 84], [196, 38], [152, 62], [134, 196], [106, 318], [60, 350], [36, 306], [104, 254],
     [226, 174], [274, 140], [302, 184], [282, 250], [230, 262], [212, 204], [262, 150],
     [326, 94], [344, 70], [338, 146], [330, 254], [380, 226], [424, 196], [404, 254],
     [446, 240], [486, 212], [474, 258], [528, 236], [604, 246], [700, 226]],
    [[276, 100], [356, 84], [438, 68]],
    [[92, 304], [300, 334], [566, 314], [812, 268], [876, 244], [852, 262]],
];
const sigPaths = SIG_STROKES.map((pts) => {
    const out = [];
    const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
    for (let i = 0; i < pts.length - 1; i++) {
        const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
        for (let s = 0; s < 12; s++) {
            const t = s / 12, t2 = t * t, t3 = t2 * t;
            out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t +
                (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
        }
    }
    out.push(pts[pts.length - 1]);
    let d = 0;
    return out.map((q, i) => { if (i) d += Math.hypot(q[0] - out[i - 1][0], q[1] - out[i - 1][1]); return [q[0], q[1], d]; });
});
const SIG_LEN = sigPaths.reduce((a, s) => a + s[s.length - 1][2], 0);

function drawSignature(g, p, pen) {
    if (p <= 0) return;
    const k = 0.64;
    g.save();
    g.translate(SIG.x + 10, SIG.y - 6);
    g.rotate(-0.05);
    g.scale(k, k);
    g.strokeStyle = pen;
    g.lineCap = 'round'; g.lineJoin = 'round';
    let budget = p * SIG_LEN;
    sigPaths.forEach((pts, si) => {
        const L = pts[pts.length - 1][2];
        for (let i = 1; i < pts.length && pts[i][2] <= budget; i++) {
            const d = pts[i][2];
            // ballpoint: thins at the ends of a stroke, breathes a little along it
            const taper = Math.max(0.35, Math.min(1, d / 40, (L - d) / 60));
            g.lineWidth = 9 * taper * (0.8 + 0.25 * Math.sin(d * 0.021 + si * 2));
            g.beginPath();
            g.moveTo(pts[i - 1][0], pts[i - 1][1]);
            g.lineTo(pts[i][0], pts[i][1]);
            g.stroke();
        }
        budget -= L;
    });
    g.restore();
}

/* ---------- printed artwork ---------- */

/* `art` is either one of the built-in drawings or an image path */
const BUILTIN_ART = { tower: drawTower, entoloma: drawEntoloma };
const artCache = new Map();
function artFor(ed) {
    if (!ed.art || BUILTIN_ART[ed.art]) return null;
    if (!artCache.has(ed.art)) {
        const img = new Image();
        img.onload = kick;
        img.src = ed.art;
        artCache.set(ed.art, img);
    }
    const img = artCache.get(ed.art);
    return img.complete && img.naturalWidth ? img : null;
}

function drawArt(g, ed, x, y, w, h) {
    const img = artFor(ed);
    if (img) {
        const k = Math.min(w / img.width, h / img.height);
        g.save();
        g.globalCompositeOperation = 'multiply';
        g.drawImage(img, x + (w - img.width * k) / 2, y + (h - img.height * k) / 2, img.width * k, img.height * k);
        g.restore();
        return;
    }
    (BUILTIN_ART[ed.art] || drawTower)(g, x, y, w, h);
}

/* entoloma virescens s.l., the blue pinkgill of the atlantic forest:
   conical-umbonate cap with a faintly striate margin, crowded gills,
   a long thin fibrillose stipe. line art, one ink, like the tower.
   drawn on its own layer so each fruit body can knock out the lines
   behind it (a fill would cover the paper grain), then cached. */
const shroomCache = new Map();
function drawEntoloma(g, x, y, w, h) {
    const key = `${g.strokeStyle}|${w}x${h}`;
    if (!shroomCache.has(key)) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const lg = c.getContext('2d');
        lg.strokeStyle = lg.fillStyle = g.strokeStyle;
        lg.lineCap = 'round'; lg.lineJoin = 'round';
        const base = h - 46;
        const r = rng(11);
        // back to front: a mature one leaning right, the tall one, a button
        shroom(lg, w * 0.70, base + 4, { stem: 170, cap: 150, tilt: 0.2, bend: 16, open: 0.6, seed: 2 });
        shroom(lg, w * 0.40, base, { stem: 285, cap: 200, tilt: -0.07, bend: -20, open: 0.25, seed: 5 });
        shroom(lg, w * 0.15, base + 2, { stem: 48, cap: 82, tilt: -0.24, bend: 4, open: 0, seed: 8 });
        // ground: scribbled shadow, moss tufts, a fallen leaf
        lg.lineWidth = 6;
        lg.beginPath();
        for (let i = 0; i < 8; i++) {
            const yy = base + 8 + i * 3.4, spread = 230 - i * 18;
            lg.moveTo(w * 0.42 - spread + r() * 24, yy);
            lg.lineTo(w * 0.42 + spread - r() * 24, yy + (r() - 0.5) * 3);
        }
        lg.stroke();
        lg.lineWidth = 3.5;
        for (const [mx, n] of [[w * 0.06, 6], [w * 0.27, 5], [w * 0.56, 7], [w * 0.86, 6]]) {
            for (let i = 0; i < n; i++) {
                const sx = mx + (i - n / 2) * 7 + r() * 4, len = 14 + r() * 18;
                lg.beginPath();
                lg.moveTo(sx, base + 6);
                lg.quadraticCurveTo(sx + (r() - 0.5) * 10, base + 6 - len * 0.6, sx + (r() - 0.5) * 16, base + 6 - len);
                lg.stroke();
            }
        }
        lg.save();
        lg.translate(w * 0.9, base + 14); lg.rotate(-0.35);
        lg.lineWidth = 5;
        lg.beginPath();
        lg.moveTo(-50, 0);
        lg.quadraticCurveTo(0, -30, 50, 0);
        lg.quadraticCurveTo(0, 24, -50, 0);
        lg.stroke();
        lg.lineWidth = 3;
        line(lg, -62, 2, 44, 0);
        for (let i = -2; i <= 2; i++) { line(lg, i * 16, 0, i * 16 + 12, -12); line(lg, i * 16, 0, i * 16 + 12, 10); }
        lg.restore();
        shroomCache.set(key, c);
    }
    g.drawImage(shroomCache.get(key), x, y);
}

/* one fruit body, local coords: base of the stipe at (0,0), up is -y */
function shroom(g, x, y, o) {
    const r = rng(o.seed);
    const R = o.cap / 2, capH = R * (1.2 - o.open * 0.55), sw = Math.max(4.5, o.cap * 0.042);
    g.save();
    g.translate(x, y);
    g.rotate(o.tilt);

    // stipe: sample the bent centre line, offset both edges
    const N = 24, L = [], Rt = [];
    const cx = (t) => 2 * (1 - t) * t * o.bend;
    for (let i = 0; i <= N; i++) {
        const t = i / N, yy = -o.stem * t;
        const half = sw * (1.25 - 0.3 * t) + (t < 0.08 ? (0.08 - t) * 40 : 0);   // slight foot
        L.push([cx(t) - half, yy]); Rt.push([cx(t) + half, yy]);
    }
    const outline = () => {
        g.beginPath();
        L.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b)));
        for (let i = N; i >= 0; i--) g.lineTo(Rt[i][0], Rt[i][1]);
        g.closePath();
    };
    g.save(); g.globalCompositeOperation = 'destination-out'; outline(); g.fill(); g.restore();
    g.lineWidth = 5.5;
    g.beginPath(); L.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.stroke();
    g.beginPath(); Rt.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.stroke();
    // innate fibrils: broken lines running the length of the stipe
    g.lineWidth = 2.2;
    for (const f of [-0.45, 0.1, 0.55]) {
        let i = 2 + Math.floor(r() * 3);
        while (i < N - 2) {
            const run = 2 + Math.floor(r() * 4), j = Math.min(N - 1, i + run);
            g.beginPath();
            for (let k = i; k <= j; k++) {
                const px = L[k][0] + (Rt[k][0] - L[k][0]) * (0.5 + f * 0.5);
                k === i ? g.moveTo(px, L[k][1]) : g.lineTo(px, L[k][1]);
            }
            g.stroke();
            i = j + 1 + Math.floor(r() * 3);
        }
    }

    // cap, sitting on the top of the stipe
    g.translate(cx(1), -o.stem);
    const lip = R * (0.06 + o.open * 0.16);          // how much underside shows
    const capPath = () => {
        g.beginPath();
        g.moveTo(-R, 0);
        g.bezierCurveTo(-R * 0.9, -capH * 0.5, -R * 0.32, -capH * 0.86, -R * 0.1, -capH * 0.97);
        g.quadraticCurveTo(0, -capH * 1.07, R * 0.1, -capH * 0.97);        // the umbo
        g.bezierCurveTo(R * 0.32, -capH * 0.86, R * 0.9, -capH * 0.5, R, 0);
        g.quadraticCurveTo(0, lip * 2.2, -R, 0);
        g.closePath();
    };
    g.save(); g.globalCompositeOperation = 'destination-out'; capPath(); g.fill(); g.restore();

    // crowded gills in the visible underside, converging on the stipe
    if (o.open > 0) {
        g.lineWidth = 2;
        const n = Math.round(10 + o.open * 14);
        for (let i = 1; i < n; i++) {
            const t = i / n, ex = -R + 2 * R * t;
            const ey = 2 * (1 - t) * t * lip * 2.2 * 0.98;
            g.beginPath(); g.moveTo(ex * 0.2, lip * 0.4); g.lineTo(ex * 0.97, ey * 0.97); g.stroke();
        }
        g.lineWidth = 3.5;
        g.beginPath(); g.moveTo(-R * 0.96, 2); g.quadraticCurveTo(0, -lip * 0.5, R * 0.96, 2); g.stroke();
    }

    // striate margin: lines climb from the margin toward the umbo along
    // the surface, longer and denser on the shaded right side
    g.lineWidth = 2.3;
    const ns = Math.round(R / 6);
    for (let i = 0; i <= ns; i++) {
        const u = -0.9 + 1.8 * i / ns;
        const mx = R * u, my = -2 - lip * 0.25 * (1 - u * u);
        const len = 0.28 + r() * 0.22 + (u > 0.15 ? 0.3 : 0);
        const ex = mx * (1 - len * 0.88), ey = -capH * len * 0.92;
        g.beginPath();
        g.moveTo(mx, my);
        g.quadraticCurveTo(mx * (1 - len * 0.3), -capH * len * 0.55, ex, ey);
        g.stroke();
    }
    // dark umbo
    g.beginPath();
    g.moveTo(-R * 0.13, -capH * 0.9);
    g.quadraticCurveTo(0, -capH * 1.1, R * 0.13, -capH * 0.9);
    g.quadraticCurveTo(0, -capH * 0.82, -R * 0.13, -capH * 0.9);
    g.fill();

    g.lineWidth = 7;
    capPath(); g.stroke();
    // faintly split, wavy margin
    g.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
        const u = -0.7 + r() * 1.4, mx = R * u;
        line(g, mx, 2 * (1 - (u + 1) / 2) * ((u + 1) / 2) * lip * 2.2 * 0.5, mx * 0.96, -capH * 0.12);
    }
    g.restore();
}

/* lattice tower + yagi + waves, inked like a rubber stamp */
function drawTower(g, x, y, w, h) {
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    const cx = x + w * 0.36, base = y + h - 40, top = y + 130;
    const bw = 110, tw = 16, n = 8;
    g.lineWidth = 9;
    line(g, cx - bw, base, cx - tw, top);
    line(g, cx + bw, base, cx + tw, top);
    g.lineWidth = 5;
    for (let i = 0; i <= n; i++) {
        const t = i / n, yy = base - (base - top) * t, hw = bw + (tw - bw) * t;
        line(g, cx - hw, yy, cx + hw, yy);
        if (i < n) {
            const t2 = (i + 1) / n, y2 = base - (base - top) * t2, hw2 = bw + (tw - bw) * t2;
            line(g, i % 2 ? cx - hw : cx + hw, yy, i % 2 ? cx + hw2 : cx - hw2, y2);
        }
    }
    const boomY = top - 55;
    g.lineWidth = 8;
    line(g, cx, top, cx, top - 95);
    line(g, cx - 150, boomY, cx + 150, boomY);
    g.lineWidth = 6;
    [[-140, 62], [-70, 56], [0, 50], [70, 44], [140, 38]].forEach(([dx, l]) => line(g, cx + dx, boomY - l, cx + dx, boomY + l));
    g.lineWidth = 8;
    [55, 105, 155].forEach((r, i) => {
        g.globalAlpha = 1 - i * 0.18;
        g.beginPath(); g.arc(cx + 175, boomY, r, -0.55, 0.55); g.stroke();
    });
    g.globalAlpha = 1;
    g.lineWidth = 6;
    const gr = rng(3);
    g.beginPath();
    for (let i = 0; i < 9; i++) {
        const yy = base + 6 + i * 3.2, spread = 200 - i * 14;
        g.moveTo(cx - spread + gr() * 20, yy);
        g.lineTo(cx + spread - gr() * 20, yy + (gr() - 0.5) * 3);
    }
    g.stroke();
    g.restore();
}

/* ---------- the card ----------
   pen: { values, times, check:[t0,dur], sig:[t0,dur] } — times null = fully written
   opts: { now, caret, hint } */

function drawCard(g, ed, pen, opts = {}) {
    const now = opts.now ?? performance.now();
    const prog = (span) => span ? clamp01((now - span[0]) / span[1]) : 1;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = ed.paper;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(grain, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.textBaseline = 'alphabetic';

    // --- printed: art, country, callsign, info row
    g.fillStyle = g.strokeStyle = ed.ink;
    drawArt(g, ed, 90, 50, 560, 470);
    g.fillStyle = g.strokeStyle = ed.ink;
    printText(g, up(ed.country), 1370, 205, 400, 118, 'center', 1250, BLACK);
    printText(g, slash(up(ed.call)), 1370, 500, 400, 330, 'center', 1320, BLACK);
    printText(g, up(ed.club1), 112, 575, 700, 46, 'left', 560);
    printText(g, up(ed.club2), 112, 628, 700, 46, 'left', 560);
    printText(g, `Zone: CQ ${ed.cq}; ITU ${ed.itu}`, 760, 600, 700, 46, 'left', 620);
    printText(g, `WW Loc ${slash(fmtLoc(ed.loc))}`, 2005, 600, 700, 46, 'right', 560);

    // --- printed: the log table, in its own ink
    g.fillStyle = g.strokeStyle = ed.table;
    g.lineWidth = 7;
    g.strokeRect(T.x0, T.y0, T.x1 - T.x0, T.y1 - T.y0);
    g.lineWidth = 4;
    line(g, T.split, T.y0, T.split, T.y1);
    line(g, T.split, T.r1, T.x1, T.r1);
    line(g, T.x0, T.r2, T.x1, T.r2);
    for (let i = 1; i < 7; i++) line(g, T.split + T.cw * i, T.r1, T.split + T.cw * i, T.y1);
    g.textBaseline = 'middle';
    printText(g, 'TO RADIO', (T.x0 + T.split) / 2, (T.y0 + T.r2) / 2, 700, 50, 'center', T.split - T.x0 - 30);
    printText(g, 'CONFIRMING OUR QSO', (T.split + T.x1) / 2, (T.y0 + T.r1) / 2 + 3, 700, 50, 'center', T.x1 - T.split - 40);
    ['DAY', 'MONTH', 'YEAR', 'UTC', 'MHz', 'RST', '2-WAY'].forEach((c, i) =>
        printText(g, c, T.split + T.cw * (i + 0.5), (T.r1 + T.r2) / 2 + 3, 700, 44, 'center', T.cw - 24));
    g.textBaseline = 'alphabetic';

    // --- printed: QSL boxes + operator block
    g.fillStyle = g.strokeStyle = ed.ink;
    const BX = 232, BS = 52;
    printText(g, 'PSE', 112, 1112, 700, 48);
    printText(g, 'QSL', 270, 1165, 700, 48);
    printText(g, 'TNX', 112, 1220, 700, 48);
    g.lineWidth = 4;
    g.strokeRect(BX, 1070, BS, BS);
    g.strokeRect(BX, 1178, BS, BS);
    printText(g, up(ed.name), 1400, 1125, 700, 48, 'left', 610);
    printText(g, up(ed.addr1), 1400, 1180, 700, 48, 'left', 610);
    printText(g, up(ed.addr2), 1400, 1235, 700, 48, 'left', 610);
    printText(g, `QSL Nº ${pad2(ed.no)}`, 2005, 1300, 700, 26, 'right');

    // --- pen
    const v = pen.values, tm = pen.times || {};
    const vy = (T.r2 + T.y1) / 2;
    const toX = T.x0 + 34;
    if (!v.to && opts.hint) {
        g.save();
        g.globalAlpha = 0.28;
        g.fillStyle = ed.table;
        printText(g, 'your call ✎', (T.x0 + T.split) / 2, vy + 14, 500, 42, 'center');
        g.restore();
    }
    const end = hand(g, 'to', v.to, tm.to, toX, vy, 165, T.split - T.x0 - 60, 'left', now, ed.pen);
    if (opts.caret && Math.floor(now / 530) % 2 === 0) {
        g.save();
        g.strokeStyle = ed.pen; g.lineWidth = 5; g.lineCap = 'round';
        line(g, end + 10, vy - 48, end + 4, vy + 52);
        g.restore();
    }
    CELLS.forEach((k, i) =>
        hand(g, k, v[k], tm[k], T.split + T.cw * (i + 0.5), vy, 155, T.cw - 22, 'center', now, ed.pen));

    if (ed.qsl === 'pse') drawCheck(g, BX, 1070, BS, prog(pen.check), ed.pen);
    if (ed.qsl === 'tnx') drawCheck(g, BX, 1178, BS, prog(pen.check), ed.pen);
    drawSignature(g, prog(pen.sig), ed.pen);
}

/* ---------- live state ---------- */

const live = {
    ed: null,              // edition on stage
    archived: false,
    values: {}, times: {}, check: null, sig: null,
    busyUntil: 0,          // last scheduled pen time, for the rAF loop
};

function dateValues(d) {
    return {
        day: pad2(d.getUTCDate()),
        month: pad2(d.getUTCMonth() + 1),
        year: pad2(d.getUTCFullYear() % 100),
        utc: pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()),
    };
}

/* write `text` into cell `key`, keeping ink that is already down.
   returns the time the pen lifts off this cell. */
function write(key, text, at) {
    const old = live.values[key] || '', oldT = live.times[key] || [];
    const a = [...old], b = [...text];
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k++;
    const times = oldT.slice(0, k);
    let t = Math.max(at, k ? times[k - 1] + CHAR_MS * 0.6 : at);
    for (let i = k; i < b.length; i++) {
        times.push(t);
        t += CHAR_MS * (b[i] === ' ' ? 0.4 : 0.85 + rng(hash(key + i))() * 0.3);
    }
    live.values[key] = text;
    live.times[key] = times;
    live.busyUntil = Math.max(live.busyUntil, t + CHAR_MS);
    return t;
}

function stage(ed, archived) {
    live.ed = ed;
    live.archived = archived;
    live.values = {}; live.times = {};
    const date = archived ? lastDayOf(ed) : new Date();
    const vals = { ...dateValues(date), mhz: ed.mhz, rst: ed.rst, mode: ed.mode };
    if (archived) vals.utc = '2359';

    // the card fills itself in, cell by cell, like someone at the desk
    let t = performance.now() + 450;
    for (const k of CELLS) t = write(k, vals[k], t) + GAP_MS;
    live.check = [t, 380]; t += 380 + GAP_MS;
    live.sig = [t, 1300]; t += 1300 + GAP_MS;
    write('to', toValue(), t);
    live.busyUntil = Math.max(live.busyUntil, t + 1600);

    toInput.disabled = archived;
    document.getElementById('download').hidden = archived;
    document.getElementById('back').hidden = !archived;
    document.getElementById('hint').hidden = archived;
    document.querySelectorAll('.log-item').forEach((b) =>
        b.setAttribute('aria-current', String(archived && b.dataset.no === String(ed.no))));
    updateBar();
    const note = document.getElementById('art-note');
    note.hidden = !ed.artName;
    note.innerHTML = ed.artName ? `<span class="art-tag">ON THE CARD</span> <i>${ed.artName}</i>${ed.artNote ? ` · ${ed.artNote}` : ''}` : '';
    kick();
}

const toValue = () => slash(up(toInput.value.trim()));

/* ---------- loop ---------- */

let raf = 0;
function frame(now) {
    raf = 0;
    const focused = document.activeElement === toInput && !live.archived;
    drawCard(ctx, live.ed, live, { now, caret: focused, hint: !live.archived && now > live.busyUntil - 1600 });
    if (now < live.busyUntil || focused) raf = requestAnimationFrame(frame);
}
function kick() { if (!raf) raf = requestAnimationFrame(frame); }

function updateBar() {
    const st = document.getElementById('state');
    const ed = live.ed;
    if (live.archived) {
        st.className = 'archived';
        st.textContent = `◼ LOGGED · QSL Nº ${pad2(ed.no)} · ${human(startOf(ed))} → ${human(lastDayOf(ed))}`;
    } else {
        st.className = '';
        st.innerHTML = `<span class="blink">●</span> LIVE · QSL Nº ${pad2(ed.no)} · SINCE ${human(startOf(ed))}`;
    }
}

/* the clock in the bar ticks every second; the card only cares when
   the minute (or the day, or the edition) actually changes */
function tick() {
    const d = new Date();
    document.getElementById('clock').textContent =
        `UTC ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
    if (live.archived || !live.ed) return;
    const cur = liveEdition(d);
    if (cur !== live.ed) { buildLog(); stage(cur, false); return; }
    const vals = dateValues(d);
    let t = performance.now();
    for (const k of ['day', 'month', 'year', 'utc']) {
        if (live.values[k] !== vals[k]) t = write(k, vals[k], t) + GAP_MS * 0.5;
    }
    kick();
}

/* ---------- log of past editions ---------- */

function buildLog() {
    const log = document.getElementById('log');
    const now = new Date();
    const cur = liveEdition(now);
    const past = EDITIONS.filter((ed) => ed.no !== cur.no && ed.from <= ymd(now)).reverse();
    log.textContent = '';
    if (!past.length) {
        const p = document.createElement('p');
        p.className = 'log-empty';
        p.textContent = `NOTHING LOGGED YET. QSL Nº ${pad2(cur.no)} IS THE FIRST. ` +
            `WHEN THE NEXT EDITION SHIPS, THIS ONE LANDS HERE, FROZEN ON ITS LAST DAY.`;
        log.appendChild(p);
        return;
    }
    const full = document.createElement('canvas');
    full.width = W; full.height = H;
    const fg = full.getContext('2d');
    for (const ed of past) {
        const last = lastDayOf(ed);
        drawCard(fg, ed, { values: frozenValues(ed), times: null }, {});
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'log-item';
        b.dataset.no = ed.no;
        const th = document.createElement('canvas');
        th.width = 630; th.height = 405;
        const tg = th.getContext('2d');
        tg.imageSmoothingQuality = 'high';
        tg.drawImage(full, 0, 0, th.width, th.height);
        const meta = document.createElement('span');
        meta.className = 'log-meta';
        meta.innerHTML = `<b>QSL Nº ${pad2(ed.no)}</b>${ed.artName ? ` · <i>${ed.artName}</i>` : ''}<br>${human(startOf(ed))} → ${human(last)}`;
        b.append(th, meta);
        b.addEventListener('click', () => {
            stage(ed, true);
            document.querySelector('.qsl-stage').scrollIntoView({ block: 'start' });
        });
        log.appendChild(b);
    }
}

function frozenValues(ed) {
    return { ...dateValues(lastDayOf(ed)), utc: '2359', mhz: ed.mhz, rst: ed.rst, mode: ed.mode, to: toValue() };
}

/* ---------- download ---------- */

function download() {
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    drawCard(out.getContext('2d'), live.ed, { values: { ...live.values, to: toValue() }, times: null }, {});
    out.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        const slug = (s) => up(s).replace(/Ø/g, '0').replace(/[^A-Z0-9]+/g, '') || 'SWL';
        const v = live.values;
        a.href = URL.createObjectURL(blob);
        a.download = `QSL_${slug(live.ed.call)}_${slug(toInput.value)}_20${v.year}${v.month}${v.day}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
}

/* ---------- wiring ---------- */

function init() {
    try { toInput.value = localStorage.getItem(TO_KEY) || ''; } catch { /* private mode */ }

    toInput.addEventListener('input', () => {
        toInput.value = toInput.value.replace(/[^\p{L}\p{N}\/\- ]/gu, '').toLocaleUpperCase('pt-BR');
        write('to', toValue(), performance.now());
        try { localStorage.setItem(TO_KEY, toInput.value); } catch { /* ignore */ }
        kick();
    });
    toInput.addEventListener('focus', kick);
    toInput.addEventListener('blur', kick);
    toInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') toInput.blur(); });

    document.getElementById('download').addEventListener('click', download);
    document.getElementById('back').addEventListener('click', () => stage(liveEdition(new Date()), false));

    const q = new URLSearchParams(location.search).get('edition');
    const now = new Date();
    const cur = liveEdition(now);
    const asked = EDITIONS.find((ed) => String(ed.no) === q && ed !== cur && ed.from <= ymd(now));

    // canvas text needs the faces actually loaded before the pen starts,
    // or the first characters get measured in a fallback font
    tick();
    Promise.all([`400 100px ${BLACK}`, `700 100px ${PRINT}`, `500 100px ${PRINT}`, `400 100px ${HAND}`].map((f) => document.fonts.load(f)))
        .catch(() => {})
        .finally(() => {
            buildLog();
            stage(asked || cur, !!asked);
            setInterval(tick, 1000);
        });
}

init();
