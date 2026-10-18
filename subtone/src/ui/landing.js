/**
 * src/ui/landing.js
 * * A tela inicial: uma bola quadriculada (a "boing ball" do Amiga) quicando
 * sobre um chão de grade, renderizada ao vivo através dos efeitos reais.
 * A cena ocupa a janela inteira: a própria página é a imagem processada.
 * * Responsabilidades:
 * - Desenhar a cena procedural a cada quadro, sem depender de arquivos.
 * - Dimensionar o canvas pela janela, em baixa resolução, para caber em GPUs fracas.
 * - Mandar cada quadro para um worker próprio com o efeito da vez.
 * - Alternar os efeitos sozinho, ou pelo clique nos chips da legenda.
 * - Usar o cursor como fonte de luz da bola e mostrar a lupa debaixo dele.
 * - Parar quando a aba some ou quando o sistema pede menos movimento.
 */
import { getInitialState } from '../core/state.js';
import { EFFECTS_LIBRARY, EFFECT_IDS } from '../core/effectsManager.js';

const SWITCH_MS = 4000;        // troca de efeito no modo automático
const IDLE_AFTER_CLICK_MS = 9000;
const MIN_FRAME_MS = 33;       // no máximo ~30 quadros por segundo
const LOUPE_ZOOM = 4;
const CSS_PX_PER_PIXEL = 3;    // cada pixel da cena vira 3x3 na tela
const MAX_PIXELS = 110000;     // teto de pixels por quadro, para o worker não engasgar

// Ajustes só da demonstração, para a cena ficar legível em baixa resolução.
const DEMO_OVERRIDES = {
    dithering: { colorMode: 'multi', multiColors: ['#190933', '#5c167d', '#ff3096', '#ff879e', '#ffd5b6', '#e8ffde'], pixelSize: 1 },
    halftone: { halftoneGridSize: 4 },
    ascii: { asciiResolution: 4, asciiIsColor: true },
};

/**
 * Desenha o fundo fixo: céu, um sol listrado e o chão em perspectiva.
 */
function drawBackdrop(ctx, w, h, horizon) {
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#0e0c22');
    sky.addColorStop(0.6, '#3a1f5c');
    sky.addColorStop(1, '#c8607a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon);

    // Sol cortado por faixas que engrossam perto do horizonte. As faixas são
    // pintadas com o próprio céu (e não recortadas), para o fundo continuar opaco.
    const sunR = Math.min(h * 0.3, w * 0.42);
    const sun = ctx.createLinearGradient(0, horizon - sunR, 0, horizon);
    sun.addColorStop(0, '#fff1c4');
    sun.addColorStop(1, '#ff7a8a');
    ctx.save();
    ctx.beginPath();
    ctx.arc(w * 0.5, horizon, sunR, Math.PI, 0);
    ctx.clip();
    ctx.fillStyle = sun;
    ctx.fillRect(0, horizon - sunR, w, sunR);
    ctx.fillStyle = sky;
    for (let i = 0; i < 6; i++) {
        const y = horizon - sunR * 0.55 + i * i * 2.2 + i * 6;
        ctx.fillRect(0, y, w, 1 + i * 0.9);
    }
    ctx.restore();

    const floor = ctx.createLinearGradient(0, horizon, 0, h);
    floor.addColorStop(0, '#2a1840');
    floor.addColorStop(1, '#0d0b18');
    ctx.fillStyle = floor;
    ctx.fillRect(0, horizon, w, h - horizon);

    ctx.strokeStyle = 'rgba(125, 147, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 1; k <= 9; k++) {
        const y = horizon + (h - horizon) * Math.pow(k / 9, 2.2);
        ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    for (let k = -12; k <= 12; k++) {
        ctx.moveTo(w * 0.5, horizon);
        ctx.lineTo(w * 0.5 + k * w * 0.16, h);
    }
    ctx.stroke();
}

/**
 * Desenha a sombra e a bola por cima de uma cópia do fundo.
 * A bola é calculada pixel a pixel: esfera girando num eixo inclinado,
 * quadriculado em latitude/longitude, com luz difusa e especular.
 * `light` é o ponto (em pixels da cena) de onde vem a luz, ou null para a luz padrão.
 */
function drawBall(data, w, h, t, floorY, light) {
    const R = Math.min(h * 0.17, w * 0.2);
    const margin = R + w * 0.04;
    const travel = w - margin * 2;
    const phase = (t * 0.11) % 2;
    const dir = phase < 1 ? 1 : -1;
    const cx = margin + travel * (phase < 1 ? phase : 2 - phase);
    const maxLift = Math.min(h * 0.4, floorY * 0.45);
    const lift = Math.abs(Math.sin(t * 2.3)) * maxLift;
    const cy = floorY - R - lift;

    // Sombra: elipse escurecida no chão, menor quando a bola sobe.
    const s = 1 - 0.45 * (lift / maxLift);
    const sx = cx + R * 0.25, rx = R * 1.15 * s, ry = R * 0.24 * s;
    for (let y = Math.max(0, Math.floor(floorY - ry)); y < Math.min(h, floorY + ry); y++) {
        for (let x = Math.max(0, Math.floor(sx - rx)); x < Math.min(w, sx + rx); x++) {
            const d = ((x - sx) / rx) ** 2 + ((y - floorY) / ry) ** 2;
            if (d > 1) continue;
            const k = 1 - 0.6 * (1 - d) * s;
            const i = (y * w + x) * 4;
            data[i] *= k; data[i + 1] *= k; data[i + 2] *= k;
        }
    }

    const tilt = 0.4, cosT = Math.cos(tilt), sinT = Math.sin(tilt);
    const spin = t * 2.4 * dir, cosA = Math.cos(spin), sinA = Math.sin(spin);
    const L = light
        ? [(light.x - cx) / (R * 2.5), (light.y - cy) / (R * 2.5), 0.6]
        : [-0.5, -0.62, 0.6];
    const ln = Math.hypot(...L);
    const lx = L[0] / ln, ly = L[1] / ln, lz = L[2] / ln;
    const seg = Math.PI / 8;

    for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(h, cy + R); y++) {
        for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(w, cx + R); x++) {
            const nx = (x + 0.5 - cx) / R, ny = (y + 0.5 - cy) / R;
            const r2 = nx * nx + ny * ny;
            if (r2 > 1) continue;
            const nz = Math.sqrt(1 - r2);

            const x1 = nx * cosT - ny * sinT, y1 = nx * sinT + ny * cosT;
            const x2 = x1 * cosA + nz * sinA, z2 = -x1 * sinA + nz * cosA;
            const lon = Math.atan2(x2, z2), lat = Math.asin(Math.max(-1, Math.min(1, y1)));
            const red = ((Math.floor((lon + Math.PI) / seg) + Math.floor((lat + Math.PI / 2) / seg)) & 1) === 0;

            const d = Math.max(0, nx * lx + ny * ly + nz * lz);
            const shade = 0.2 + 0.8 * d;
            const spec = Math.pow(d, 28) * 200;
            const i = (y * w + x) * 4;
            data[i]     = (red ? 220 : 238) * shade + spec;
            data[i + 1] = (red ? 36 : 232) * shade + spec;
            data[i + 2] = (red ? 56 : 222) * shade + spec;
        }
    }
}

export function initLanding() {
    const landing = document.getElementById('landing');
    const canvas = document.getElementById('demoCanvas');
    const loupe = document.getElementById('demoLoupe');
    const chips = document.getElementById('demo-effects');
    const indexEl = document.getElementById('demo-index');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const lctx = loupe.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Cena: refeita sempre que a janela muda de tamanho
    let w, h, floorY, backdrop, frame;
    const layout = () => {
        let cw = Math.max(1, Math.round(window.innerWidth / CSS_PX_PER_PIXEL));
        let ch = Math.max(1, Math.round(landing.clientHeight / CSS_PX_PER_PIXEL));
        const over = Math.sqrt((cw * ch) / MAX_PIXELS);
        if (over > 1) { cw = Math.round(cw / over); ch = Math.round(ch / over); }
        if (cw === w && ch === h) return false;
        w = canvas.width = cw;
        h = canvas.height = ch;
        // em pé (celular), a cena sobe para a bola quicar no vão entre os textos
        const portrait = h > w;
        floorY = h * (portrait ? 0.6 : 0.86);
        drawBackdrop(ctx, w, h, Math.round(h * (portrait ? 0.45 : 0.6)));
        backdrop = ctx.getImageData(0, 0, w, h);
        frame = new ImageData(w, h);
        return true;
    };
    layout();

    const state = getInitialState();
    for (const [id, overrides] of Object.entries(DEMO_OVERRIDES)) Object.assign(state.effects[id], overrides);

    let current = 0;
    let lastSwitch = performance.now();
    let pausedUntil = 0;
    let busy = false;
    let lastPost = 0;
    let lastT = 1.2;
    let pointer = null;   // em pixels de tela, relativo ao canvas
    let light = null;     // o mesmo ponto, em pixels da cena

    chips.innerHTML = EFFECT_IDS.map((id, i) =>
        `<button type="button" class="demo-chip" data-index="${i}">${EFFECTS_LIBRARY[id].name}</button>`).join('');

    const select = (i) => {
        current = i;
        state.activeEffect = EFFECT_IDS[i];
        indexEl.textContent = String(i + 1).padStart(2, '0');
        chips.querySelectorAll('.demo-chip').forEach((chip, n) => chip.classList.toggle('active', n === i));
    };

    const worker = new Worker('src/worker.js', { type: 'module' });
    worker.onmessage = (e) => {
        busy = false;
        // um quadro pedido antes de um resize chega com o tamanho antigo: descarta
        if (e.data.width !== w || e.data.height !== h) return;
        ctx.putImageData(e.data, 0, 0);
        if (pointer) drawLoupe();
    };

    const render = (t) => {
        lastT = t;
        frame.data.set(backdrop.data);
        drawBall(frame.data, w, h, t, floorY, light);
        busy = true;
        lastPost = performance.now();
        worker.postMessage({ imageData: frame, state });
    };

    // com pouco movimento, só um quadro parado, refeito quando algo muda
    const still = () => { if (!busy) render(lastT); };

    const loop = (now) => {
        requestAnimationFrame(loop);
        if (landing.hidden || document.hidden || busy || now - lastPost < MIN_FRAME_MS) return;
        if (stale) { layout(); stale = false; }
        if (now > pausedUntil && now - lastSwitch > SWITCH_MS) {
            select((current + 1) % EFFECT_IDS.length);
            lastSwitch = now;
        }
        render(now / 1000);
    };

    chips.addEventListener('click', (e) => {
        const chip = e.target.closest('.demo-chip');
        if (!chip) return;
        select(Number(chip.dataset.index));
        lastSwitch = performance.now();
        pausedUntil = lastSwitch + IDLE_AFTER_CLICK_MS;
        if (reduceMotion) still();
    });

    // Lupa e luz
    const drawLoupe = () => {
        const rect = canvas.getBoundingClientRect();
        const scale = canvas.width / rect.width;
        const size = loupe.width;
        const src = (size / LOUPE_ZOOM) * scale;
        lctx.imageSmoothingEnabled = false;
        lctx.fillStyle = '#151412';
        lctx.fillRect(0, 0, size, size);
        lctx.drawImage(canvas, pointer.x * scale - src / 2, pointer.y * scale - src / 2, src, src, 0, 0, size, size);
    };
    canvas.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        light = { x: pointer.x * (w / rect.width), y: pointer.y * (h / rect.height) };
        if (e.pointerType !== 'touch') {
            loupe.style.translate = `${e.clientX - loupe.offsetWidth / 2}px ${e.clientY - loupe.offsetHeight / 2}px`;
            loupe.classList.add('on');
            drawLoupe();
        }
        if (reduceMotion) still();
    });
    canvas.addEventListener('pointerleave', () => {
        pointer = null;
        loupe.classList.remove('on');
    });

    // escondida (no editor) a landing mede zero: só remede quando volta a aparecer
    let stale = false;
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            stale = true;
            if (reduceMotion && !landing.hidden) { layout(); stale = false; still(); }
        }, 120);
    });

    select(0);
    if (reduceMotion) {
        render(lastT);
    } else {
        requestAnimationFrame(loop);
    }
}
