/* =========================================================
   JOTAGOTCHI: byte, a pixel owl in a rendered egg.
   64×48 lcd drawn pixel by pixel. click the egg to pick it
   up; the rest of the page steps back and hints follow the
   cursor. left feeds, middle plays (fly between the towers,
   every button flaps), right turns the light off. state is
   kept in this visitor's browser and drifts with real time.
   ========================================================= */

(() => {
    const cv = document.getElementById('pet');
    const egg = document.getElementById('egg');
    if (!cv || !egg) return;
    const g = cv.getContext('2d');
    const W = 64, H = 48;
    const hint = document.getElementById('pet-hint');
    const live = document.getElementById('pet-live');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t$ = (k, v) => window.jv?.t(k, v) ?? k;
    egg.classList.toggle('egg-sway', !reduced);

    const PAL = {
        on:  { lcd: '#d9dcc8', ghost: '#cfd3bd', ink: '#1f2b78' },
        off: { lcd: '#8f957f', ghost: '#878d77', ink: '#141a45' },
    };

    /* ---------- state, persisted per visitor ---------- */
    const KEY = 'jotagotchi.v2';
    const HOUR = 3600e3;
    const s = { hunger: 1, joy: 3, dark: false, best: 0, at: Date.now() };
    try { Object.assign(s, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* private mode */ }
    const away = Date.now() - s.at;                      // time passes while nobody looks
    s.hunger = Math.min(4, s.hunger + Math.floor(away / (3 * HOUR)));
    s.joy = Math.max(0, s.joy - Math.floor(away / (4 * HOUR)));
    const save = () => {
        s.at = Date.now();
        try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* fine */ }
    };
    save();
    const say = (text) => { live.textContent = text; };

    /* ---------- pixels ---------- */
    let pal = PAL.on;
    const px = (x, y) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < W && y < H) g.fillRect(x, y, 1, 1); };
    const rect = (x, y, w, h) => g.fillRect(x | 0, y | 0, w, h);
    const ellipse = (cx, cy, rx, ry) => {
        for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
            for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
                if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) px(x, y);
    };
    const erase = (fn) => { const k = g.fillStyle; g.fillStyle = pal.lcd; fn(); g.fillStyle = k; };
    const sprite = (rows, x, y) => rows.forEach((r, j) => [...r].forEach((b, i) => b === '#' && px(x + i, y + j)));

    // 3×5 digits and a couple of glyphs
    const FONT = {
        0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'],
        2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '.##', '..#', '###'],
        4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
        6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'],
        8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'],
        z: ['###', '..#', '.#.', '#..', '###'], '+': ['...', '.#.', '###', '.#.', '...'],
    };
    const text = (str, x, y) => [...String(str)].forEach((ch, i) => FONT[ch] && sprite(FONT[ch], x + i * 4, y));
    const heart = (x, y) => sprite(['.#.#.', '#####', '#####', '.###.', '..#..'], x, y);

    /* ---------- byte, big (idle) ---------- */
    let look = [0, 0], blinkUntil = 0, nextBlink = 40;
    function bigOwl(cx, cy, { sleeping, mouth, happy }) {
        ellipse(cx, cy, 12, 12.5);
        sprite(['##..', '###.', '.##.'], cx - 11, cy - 13);   // ear tufts
        sprite(['..##', '.###', '.##.'], cx + 7, cy - 13);
        erase(() => ellipse(cx, cy + 5, 6.5, 6));            // belly, with feather chevrons
        for (const [fx, fy] of [[-3, 2], [2, 2], [-1, 5]]) { px(cx + fx, cy + fy + 2); px(cx + fx + 1, cy + fy + 3); px(cx + fx + 2, cy + fy + 2); }
        rect(cx - 4, cy + 13, 2, 1); rect(cx + 2, cy + 13, 2, 1);   // feet
        const blink = t < blinkUntil;
        if (t >= nextBlink) { blinkUntil = t + 4; nextBlink = t + 90 + Math.floor(Math.random() * 120); }
        for (const ex of [cx - 5.5, cx + 5.5]) {
            erase(() => ellipse(ex, cy - 3, 4.3, 4.3));
            if (sleeping || blink) for (let i = -3; i <= 3; i++) px(ex + i, cy - 3 + (Math.abs(i) === 3 ? -1 : 0));
            else {
                const [lx, ly] = s.hunger >= 3 ? [0, 1] : look;
                rect(Math.round(ex - 1 + lx * 1.5), Math.round(cy - 4 + ly * 1.5), 2, 2);
            }
        }
        rect(cx - 1, cy + 1, 2, 1);                          // beak, open while eating
        if (mouth) rect(cx - 1, cy + 3, 2, 1); else px(cx - 1, cy + 2);
        if (happy) heart(cx + 13, cy - 16);
    }

    /* ---------- byte, small (flying): the big owl supersampled down to half
       size and cleaned by hand, so the two read as one character: same solid
       body and tufts, same light eye discs, a dark band, a light belly.
       little solid wings flap beside it. (x, y) is the top left of the body ---------- */
    const MINI = [
        '.#........#.',
        '.##......##.',
        '.##########.',
        '############',
        '##..####..##',
        '#....##....#',
        '#..#.##.#..#',
        '#....##....#',
        '##..####..##',
        '###..##..###',
        '##........##',
        '##..#..#..##',
        '.##......##.',
        '..########..',
        '...#....#...',
    ];
    const WINGS = {
        up:   { l: ['#..', '##.', '###', '.##'], r: ['..#', '.##', '###', '##.'], y: 4 },
        down: { l: ['.##', '###', '##.', '#..'], r: ['##.', '###', '.##', '..#'], y: 8 },
    };
    function miniOwl(x, y, up) {
        const w = WINGS[up ? 'up' : 'down'];
        sprite(MINI, x, y);
        sprite(w.l, x - 3, y + w.y);
        sprite(w.r, x + 12, y + w.y);
    }

    /* ---------- modes ---------- */
    let mode = 'idle';       // idle | fly | over
    let t = 0;
    let game = null;
    let anim = null;         // idle animations: { kind: 'feed' | 'nope', t0 }

    function startFly() {
        mode = 'fly';
        game = { y: 18, vy: 0, obs: [], score: 0, spawn: 0, started: false, flap: 0 };
        say(t$('pet-fly'));
    }
    function crash() {
        const score = game.score;
        s.joy = Math.min(4, s.joy + Math.min(2, Math.ceil(score / 3)));
        if (score > s.best) s.best = score;
        save();
        mode = 'over';
        game = { score, until: t + 30 * 4 };
        say(t$('pet-score', { s: score, b: s.best }));
    }

    function press(k) {
        flash(k);
        if (s.dark && k !== 'c' && mode === 'idle') return;
        if (mode === 'idle') {
            if (k === 'a') {
                if (s.hunger === 0) { anim = { kind: 'nope', t0: t }; say(t$('pet-full')); }
                else { anim = { kind: 'feed', t0: t }; s.hunger--; save(); say(t$('pet-ate')); }
            } else if (k === 'b') startFly();
            else { s.dark = !s.dark; save(); say(t$(s.dark ? 'pet-dark' : 'pet-light')); }
        } else if (mode === 'fly') {
            game.vy = -1.05; game.started = true; game.flap = t;
        } else if (mode === 'over' && t > game.until - 30 * 3) {
            mode = 'idle'; game = null;
        }
    }

    /* ---------- one tick, 30 a second ---------- */
    function frame() {
        pal = s.dark ? PAL.off : PAL.on;
        g.fillStyle = pal.lcd; g.fillRect(0, 0, W, H);
        g.fillStyle = pal.ghost;
        for (let y = 0; y < H; y += 2) for (let x = (y / 2) % 2; x < W; x += 2) px(x, y);
        g.fillStyle = pal.ink;
        t++;

        if (mode === 'idle') {
            for (let i = 0; i < 4; i++) {                    // pips: food left, joy right
                if (i < 4 - s.hunger) rect(2 + i * 3, 2, 2, 2); else px(2 + i * 3, 3);
                if (i < s.joy) rect(W - 4 - i * 3, 2, 2, 2); else px(W - 4 - i * 3, 3);
            }
            for (let x = 6; x < W - 6; x += (x % 5 ? 3 : 1)) px(x, 45);
            const at = anim ? t - anim.t0 : 0;
            if (anim && at > 36) anim = null;
            const shake = anim?.kind === 'nope' ? [0, -1, 1, -1, 1, 0][Math.min(Math.floor(at / 2), 5)] : 0;
            const breathe = s.dark ? 0 : Math.floor(t / 24) % 2;
            const cx = 32 + shake, cy = 29 + breathe;
            const eating = anim?.kind === 'feed' && at > 12 && at < 26;
            bigOwl(cx, cy, { sleeping: s.dark, mouth: eating && Math.floor(at / 3) % 2, happy: s.joy >= 4 && Math.floor(t / 15) % 2 });
            if (anim?.kind === 'feed' && at <= 13) rect(cx - 1, 6 + at * 2, 2, 2);   // the byte falls in
            if (anim?.kind === 'feed' && at > 20) text('+', cx + 12, cy - 12 - Math.floor((at - 20) / 2));
            if (s.dark) { const k = Math.floor(t / 18) % 3; text('z', 48 + k, 16 - k * 4); }
            return;
        }

        if (mode === 'fly') {
            const gm = game;
            if (gm.started) {
                gm.vy = Math.min(gm.vy + 0.1, 1.6); gm.y += gm.vy;
                if (gm.y < 0) { gm.y = 0; gm.vy = 0; }        // the top of the screen is a ceiling
            } else gm.y = 16 + Math.sin(t / 8) * 1.5;
            if (gm.started && t >= gm.spawn) {
                const gap = 24, top = 6 + Math.floor(Math.random() * (H - gap - 12));
                gm.obs.push({ x: W, top, bottom: top + gap, passed: false });
                gm.spawn = t + 56;
            }
            const ox = 8, oy = gm.y;
            for (const o of gm.obs) {
                o.x -= 0.7;
                for (let y = 0; y < o.top - 2; y++) rect(o.x + 2, y, 3, 1);          // a cloud hanging down
                ellipse(o.x + 3.5, o.top - 2, 4.5, 2.5);
                for (let y = o.bottom; y < H; y++) {                                 // a lattice radio tower
                    const k = (y - o.bottom) / (H - o.bottom);
                    px(o.x + 3 - k * 2.5, y); px(o.x + 4 + k * 2.5, y);
                    if ((y - o.bottom) % 3 === 0) rect(o.x + 3 - k * 2.5, y, 2 + k * 5, 1);
                }
                rect(o.x + 3, o.bottom - 2, 2, 2);
                if (!o.passed && o.x + 7 < ox) { o.passed = true; gm.score++; }
                // the body is the hitbox; wing tips may brush past
                const hitX = ox + 12 > o.x + 1 && ox < o.x + 7;
                if (hitX && (oy + 2 < o.top || oy + 14 > o.bottom)) return crash();
            }
            gm.obs = gm.obs.filter(o => o.x > -10);
            miniOwl(ox, Math.round(oy), t - gm.flap < 6 || !gm.started && Math.floor(t / 8) % 2);
            if (oy > H - 15) return crash();
            text(gm.score, W - 4 * String(gm.score).length - 1, 1);
            return;
        }

        if (mode === 'over') {
            const gm = game;
            text(gm.score, 32 - String(gm.score).length * 2, 10);
            heart(30, 19);
            rect(24, 28, 17, 1);
            text(s.best, 32 - String(s.best).length * 2, 31);
            miniOwl(5, 32, Math.floor(t / 8) % 2);
            if (t >= gm.until) { mode = 'idle'; game = null; }
        }
    }

    /* ---------- run only while visible ---------- */
    let timer = 0;
    const visible = () => !document.hidden && cv.offsetParent !== null;
    function run() {
        if (visible() && !timer) timer = setInterval(frame, reduced && mode === 'idle' ? 300 : 33);
        if (!visible() && timer) { clearInterval(timer); timer = 0; }
    }
    frame();
    run();
    document.addEventListener('visibilitychange', run);
    window.addEventListener('hashchange', () => setTimeout(run));
    window.addEventListener('popstate', () => setTimeout(run));
    document.addEventListener('click', () => setTimeout(run));

    /* ---------- pick up / put down ---------- */
    let focused = false;
    function pickUp() {
        if (focused) return;
        focused = true;
        egg.style.transform = '';
        const r = egg.getBoundingClientRect();
        const k = Math.min(1.8, (innerHeight * 0.8) / r.height, (innerWidth * 0.92) / r.width);
        const dx = innerWidth / 2 - (r.left + r.width / 2);
        const dy = innerHeight / 2 - (r.top + r.height / 2);
        egg.style.transform = `translate(${dx}px, ${dy}px) scale(${k})`;
        document.body.classList.add('pet-focus');
        hideHint();
        say(t$('pet-picked'));
    }
    function putDown() {
        if (!focused) return;
        focused = false;
        egg.style.transform = '';
        document.body.classList.remove('pet-focus');
        if (mode === 'fly') { mode = 'idle'; game = null; }
        hideHint();
    }

    function flash(k) {
        const img = egg.querySelector(`.egg-press[data-for="${k}"]`);
        if (!img) return;
        img.classList.add('down');
        setTimeout(() => img.classList.remove('down'), 110);
    }

    egg.querySelectorAll('.egg-key').forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!focused) { pickUp(); return; }      // the first click only picks it up
        press(b.dataset.key);
    }));
    egg.addEventListener('click', () => { if (!focused) pickUp(); });
    egg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !focused && e.target === egg) { e.preventDefault(); pickUp(); } });
    document.addEventListener('click', (e) => { if (focused && !egg.contains(e.target)) putDown(); });
    window.addEventListener('resize', () => { if (focused) { focused = false; pickUp(); } });

    // the keyboard presses the egg's buttons, it doesn't play on its own
    document.addEventListener('keydown', (e) => {
        if (!focused || e.target.closest('input, textarea')) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); putDown(); return; }
        const k = { ArrowLeft: 'a', ArrowDown: 'b', ' ': 'b', ArrowRight: 'c' }[e.key];
        if (!k) return;
        e.preventDefault();
        if (!e.repeat) press(k);
    }, true);

    /* ---------- cursor: the owl looks, hints follow ---------- */
    const LABEL = {
        idle: { a: 'pet-feed', b: 'pet-play', c: () => (s.dark ? 'pet-on' : 'pet-off') },
        fly: { a: 'pet-flap', b: 'pet-flap', c: 'pet-flap' },
        over: { a: 'pet-back', b: 'pet-back', c: 'pet-back' },
    };
    let hintText = '';
    function showHint(value, x, y) {
        if (!value) return hideHint();
        if (value !== hintText) { hint.textContent = value; hintText = value; }
        hint.style.transform = `translate(${x}px, ${y}px)`;
        hint.classList.add('show');
    }
    function hideHint() { hint.classList.remove('show'); hintText = ''; }

    window.addEventListener('pointermove', (e) => {
        const r = cv.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * 0.45);
        const d = Math.hypot(dx, dy) || 1;
        look = d < 24 ? [0, 0] : [Math.round(dx / d), Math.round(Math.max(-1, Math.min(1, dy / d * 1.4)))];

        if (!egg.contains(e.target)) return hideHint();
        if (!focused) return showHint(t$('pet-pick'), e.clientX, e.clientY);
        const key = e.target.closest('.egg-key')?.dataset.key;
        if (!key) return hideHint();
        if (s.dark && key !== 'c' && mode === 'idle') return showHint(t$('pet-zzz'), e.clientX, e.clientY);
        const l = LABEL[mode][key];
        showHint(t$(typeof l === 'function' ? l() : l), e.clientX, e.clientY);
    }, { passive: true });
    egg.addEventListener('pointerleave', hideHint);
})();
