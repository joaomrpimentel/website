/* =========================================================
   JOTAVERSE: views, keyboard, small things.
   the card itself is drawn by qsl/qsl.js.
   ========================================================= */

const VIEWS = ['home', 'works', 'me', 'links'];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* screenshots that need a closer crop carry data-zoom / data-focus */
function initZoom() {
    for (const img of document.querySelectorAll('img[data-zoom]')) {
        img.style.transformOrigin = (img.dataset.focus || '50 0').split(' ').map(v => v + '%').join(' ');
        img.style.transform = `scale(${img.dataset.zoom})`;
        img.closest('.work')?.style.setProperty('--z', +img.dataset.zoom + 0.04);
    }
}

/* ---------------------------------------------------------
   views. the masthead menu swaps one view for another in
   place; 1–4 switch like workspaces. the hash keeps it
   linkable and the back button honest.
   --------------------------------------------------------- */
let current = null;

function show(name) {
    if (name === current) return;
    current = name;
    for (const v of document.querySelectorAll('.view')) {
        const on = v.id === name;
        v.hidden = !on;
        v.classList.toggle('enter', on && !reduced);
    }
    for (const a of document.querySelectorAll('.mast-menu a')) {
        if (a.dataset.go === name) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
    }
    window.scrollTo(0, 0);
}

function route() {
    const h = location.hash.slice(1);
    show(VIEWS.includes(h) && h !== 'home' ? h : 'home');
}

function go(name) {
    const url = name === 'home' ? location.pathname + location.search : '#' + name;
    history.pushState(null, '', url);
    route();
}

function initViews() {
    route();
    window.addEventListener('popstate', route);
    window.addEventListener('hashchange', route);
    document.querySelectorAll('[data-go]').forEach(a => a.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        go(a.dataset.go);
    }));
    document.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.target.closest('input, textarea, [contenteditable]')) return;
        if (document.querySelector('dialog[open]')) return;
        const i = '1234'.indexOf(e.key);
        if (i >= 0) { e.preventDefault(); go(VIEWS[i]); }
        else if (e.key === 'Escape' && current !== 'home') go('home');
    });
}

/* ---------------------------------------------------------
   small things
   --------------------------------------------------------- */
let toastTimer = 0;
function toast(text) {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function initCopy() {
    document.querySelectorAll('[data-copy]').forEach(a => {
        a.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await navigator.clipboard.writeText(a.dataset.copy);
                toast(window.jv?.t('js-copied') ?? 'email copied ✓');
            } catch {
                location.href = a.href;      // no clipboard here, open the mail app
            }
        });
    });
}

/* ---------------------------------------------------------
   the QSL card: a live thumbnail tossed on the home page,
   the real one in a dialog over a blurred page
   --------------------------------------------------------- */
function initQsl() {
    const dlg = document.getElementById('qsl-dialog');
    const card = document.getElementById('card');
    const thumb = document.getElementById('card-thumb');
    if (!dlg || !card) return;

    // the thumbnail mirrors the card, so the pen is visible from the home page too
    const tg = thumb?.getContext('2d');
    if (tg) {
        tg.imageSmoothingQuality = 'high';
        card.addEventListener('qsl:draw', () => tg.drawImage(card, 0, 0, thumb.width, thumb.height));
    }

    // the card flies between the thumbnail on the page and its place in the dialog
    const wrap = document.getElementById('card-wrap');
    const tossed = document.getElementById('open-qsl');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function flight() {
        const a = thumb?.getBoundingClientRect(), b = wrap.getBoundingClientRect();
        if (!a?.width || !b.width) return null;
        // the rects are of the rotated boxes; close enough for a ~10° tilt
        const k = a.width / b.width;
        const dx = a.left + a.width / 2 - (b.left + b.width / 2);
        const dy = a.top + a.height / 2 - (b.top + b.height / 2);
        return [
            { transform: `translate(${dx}px, ${dy}px) rotate(9deg) scale(${k})` },
            { transform: 'rotate(-3deg)' },
        ];
    }
    const open = () => {
        if (dlg.open) return;
        dlg.showModal();
        // showModal focuses the close button; the reading position is a better start
        document.getElementById('qsl-text')?.focus({ preventScroll: true });
        dlg.scrollTop = 0;
        requestAnimationFrame(() => dlg.classList.add('shown'));
        const frames = !reduced && flight();
        if (frames) {
            tossed.style.visibility = 'hidden';
            wrap.animate(frames, { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
    };
    let closing = false;
    const close = () => {
        if (!dlg.open || closing) return;
        closing = true;
        dlg.classList.remove('shown');
        const frames = !reduced && flight();
        const done = () => { closing = false; tossed.style.visibility = ''; dlg.close(); };
        if (frames) wrap.animate([...frames].reverse(), { duration: 450, easing: 'cubic-bezier(.4,0,.2,1)' }).finished.then(done);
        else done();
    };
    tossed?.addEventListener('click', () => {
        open();
        history.replaceState(null, '', '#qsl');
    });
    document.getElementById('close-qsl')?.addEventListener('click', close);
    // a click on bare paper puts the card back
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });     // esc
    dlg.addEventListener('close', () => {
        if (location.hash === '#qsl') history.replaceState(null, '', location.pathname + location.search);
    });
    if (location.hash === '#qsl') open();
}

/* Last-Modified of the page, i.e. the last deploy */
function initUpdated() {
    const el = document.getElementById('updated');
    const d = new Date(document.lastModified);
    if (!el || isNaN(d)) return;
    el.dateTime = d.toISOString().slice(0, 10);
    el.textContent = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
}

initZoom();
initViews();
initCopy();
initUpdated();
initQsl();

/* ---------------------------------------------------------
   ichthys: on hover (or a tap) a fish slips out from under the
   word on the left, arcs over the letters nose first and dives
   back in on the right, throwing a few drops. the water is the
   baseline of the word; the fish is clipped below it.
   --------------------------------------------------------- */
function initIchthys() {
    const box = document.querySelector('.ichthys');
    const fish = box?.querySelector('.ichthys-fish');
    if (!fish || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const splashG = box.querySelector('.ichthys-splash');
    const NS = 'http://www.w3.org/2000/svg';
    const X0 = 22, X1 = 262, WATER = 128, PEAK = 88, DEPTH = 40, MS = 1300;
    let busy = false;

    /* a splash in two parts, the way splashes are drawn in 2d animation:
       a crown of thin sheets that rises out of the impact and falls back,
       then drops thrown off the tips of the crown that fly on a parabola
       under gravity, stretched along their speed, gone when they land */
    const CROWN = [            // [lean, height, spread]: left sheets lean left
        [-1, 15, 10], [-0.55, 21, 5], [0.55, 18, 6], [1, 12, 11],
    ];
    function splash(x) {
        for (const [lean, hgt, spread] of CROWN) {
            const p = document.createElementNS(NS, 'path');
            const tipX = x + lean * spread, tipY = WATER - hgt;
            p.setAttribute('d', `M${x + lean * 2} ${WATER} Q ${x + lean * spread * 0.2} ${WATER - hgt * 0.6} ${tipX} ${tipY}`);
            p.setAttribute('pathLength', '1');
            p.setAttribute('class', 'crown');
            splashG.append(p);
            // grow out of the water, then the base lets go and the sheet falls away
            p.animate([
                { strokeDasharray: '0 1', strokeDashoffset: 0 },
                { strokeDasharray: '1 1', strokeDashoffset: 0, offset: 0.35 },
                { strokeDasharray: '1 1', strokeDashoffset: -1 },
            ], { duration: 520, easing: 'cubic-bezier(.25,.8,.35,1)' }).finished.then(() => p.remove());
            drops(tipX, tipY, lean);
        }
    }
    function drops(x, y, lean) {
        const n = 1 + (Math.random() < 0.6);
        for (let i = 0; i < n; i++) {
            const d = document.createElementNS(NS, 'ellipse');
            splashG.append(d);
            let px = x, py = y;
            let vx = lean * (28 + Math.random() * 40), vy = -(45 + Math.random() * 55);
            const G = 420, r = 1.1 + Math.random() * 0.9;
            let last = performance.now() + 150 + i * 40;     // leave as the crown reaches its height
            (function fly(now) {
                const dt = Math.max(0, (now - last) / 1000); last = Math.max(last, now);
                vy += G * dt; px += vx * dt; py += vy * dt;
                const speed = Math.hypot(vx, vy);
                d.setAttribute('cx', px); d.setAttribute('cy', py);
                d.setAttribute('rx', r * (1 + Math.min(speed / 90, 1.6))); d.setAttribute('ry', r);
                d.setAttribute('transform', `rotate(${Math.atan2(vy, vx) * 180 / Math.PI} ${px} ${py})`);
                if (py > WATER) { d.remove(); return; }       // back in the water
                requestAnimationFrame(fly);
            })(performance.now());
        }
    }

    function leap() {
        if (busy) return;
        busy = true;
        fish.style.opacity = 1;
        const t0 = performance.now();
        let splashed = false;
        (function step(now) {
            const t = Math.min(1, (now - t0) / MS);
            const x = X0 + (X1 - X0) * t;
            const y = WATER - ((PEAK + DEPTH) * 4 * t * (1 - t) - DEPTH);
            const slope = -(PEAK + DEPTH) * 4 * (1 - 2 * t) / (X1 - X0);
            fish.setAttribute('transform', `translate(${x} ${y}) rotate(${Math.atan(slope) * 180 / Math.PI})`);
            if (!splashed && t > 0.5 && y > WATER - 4) { splashed = true; splash(x); }
            if (t < 1) requestAnimationFrame(step);
            else { fish.style.opacity = 0; busy = false; }
        })(t0);
    }
    box.addEventListener('pointerenter', leap);
    box.addEventListener('click', leap);
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); leap(); } });
}
initIchthys();
