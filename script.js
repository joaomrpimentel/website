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
    initActiveNav();
    initOrb();
    const y = document.getElementById('year');
    if (y) y.textContent = new Date().getFullYear();
});

window.addEventListener('resize', fitAscii);
window.addEventListener('load', fitAscii);   // refit once fonts settle
