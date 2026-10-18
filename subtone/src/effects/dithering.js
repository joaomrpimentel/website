/**
 * effects/dithering.js
 * * Contém a lógica para o efeito de Dithering.
 * * Algoritmos: difusão de erro (Floyd-Steinberg, Atkinson, Jarvis, Mod X),
 * ordenados (Bayer de vários tamanhos, pontos, linhas, diagonal, ruído)
 * e Riemersma (difusão ao longo de uma curva de Hilbert).
 * * Modos de cor:
 * - mono, duotone, tritone: o dither acontece na luminância, em 2 ou 3 níveis,
 *   e cada nível vira uma das cores escolhidas (sombras, meios-tons, luzes).
 * - multi: cor mais próxima numa lista livre de cores (as antigas paletas).
 * - rgb: cada canal é quantizado separadamente em N níveis.
 */

// --- Predefinições de cor ---
// Cada modo tem as suas, com exatamente o número de cores que ele usa.
// Duo e tri vão do mais escuro para o mais claro.
export const COLOR_PRESETS = {
    duotone: {
        'Ink':       ['#151412', '#7d93ff'],
        'Paper':     ['#22211e', '#f4f1ea'],
        'Blueprint': ['#0d1a4a', '#dce6ff'],
        'Riso':      ['#1d1b3a', '#ff4f7b'],
        'Amber':     ['#140a00', '#ffb000'],
        'Nokia':     ['#0f1a10', '#c7e3a8'],
        'Sepia':     ['#2b1d14', '#f1e3c8'],
        'Rose':      ['#3a0f1f', '#ffc2d1'],
    },
    tritone: {
        'Ink':       ['#151412', '#2440b3', '#ece8de'],
        'Paper':     ['#22211e', '#8d8a82', '#f4f1ea'],
        'Blueprint': ['#0d1a4a', '#3d63dd', '#dce6ff'],
        'Riso':      ['#1d1b3a', '#ff4f7b', '#ffe6d5'],
        'Amber':     ['#140a00', '#a3560a', '#ffb000'],
        'Moss':      ['#0f1a10', '#5b7d4a', '#d6e6b8'],
        'Sepia':     ['#2b1d14', '#9c7a5b', '#f1e3c8'],
        'Night':     ['#000000', '#3a2f6b', '#b8a9ff'],
    },
    multi: {
        'Game Boy':  ['#0f380f', '#306230', '#8bac8b', '#9bbc9b'],
        'Rusty':     ['#2e2222', '#573822', '#a84e31', '#e08e56'],
        'Faded':     ['#2b2b40', '#564a66', '#9c7f94', '#decaca'],
        'CGA':       ['#000000', '#55ffff', '#ff55ff', '#ffffff'],
        'Holo':      ['#190933', '#5c167d', '#ff3096', '#ff879e', '#ffd5b6', '#e8ffde'],
        'Cyber':     ['#000000', '#19004c', '#330084', '#8400ff', '#ff66ff', '#00ffff'],
        'PICO-8':    ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
                      '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
    },
};

export const MULTI_MIN = 2;
export const MULTI_MAX = 16;

// Núcleos de difusão de erro: [dx, dy, peso].
const KERNELS = {
    'F-S': [[1, 0, 7/16], [-1, 1, 3/16], [0, 1, 5/16], [1, 1, 1/16]],
    // Atkinson espalha só 6/8 do erro, o que estoura as luzes e sombras de propósito.
    'Atkinson': [[1, 0, 1/8], [2, 0, 1/8], [-1, 1, 1/8], [0, 1, 1/8], [1, 1, 1/8], [0, 2, 1/8]],
    'Jarvis': [
        [1, 0, 7/48], [2, 0, 5/48],
        [-2, 1, 3/48], [-1, 1, 5/48], [0, 1, 7/48], [1, 1, 5/48], [2, 1, 3/48],
        [-2, 2, 1/48], [-1, 2, 3/48], [0, 2, 5/48], [1, 2, 3/48], [2, 2, 1/48],
    ],
};

// --- Padrões ordenados ---
// Cada padrão é uma matriz de limiares normalizada para -0.5..0.5.

const normalize = (m) => {
    const n = m.length * m[0].length;
    return m.map(row => row.map(v => (v + 0.5) / n - 0.5));
};

// Bayer de lado `size` (potência de 2), construído recursivamente a partir do 2x2.
const bayer = (size) => {
    let m = [[0, 2], [3, 1]];
    while (m.length < size) {
        const n = m.length;
        const next = Array.from({ length: n * 2 }, () => new Array(n * 2));
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const v = m[y][x] * 4;
                next[y][x] = v;
                next[y][x + n] = v + 2;
                next[y + n][x] = v + 3;
                next[y + n][x + n] = v + 1;
            }
        }
        m = next;
    }
    return normalize(m);
};

// Ordena as células de uma matriz NxN por uma "função de ponto": as de valor
// mais alto acendem primeiro. Empates são resolvidos pelo Bayer do mesmo tamanho.
const fromSpot = (size, spot) => {
    const tie = bayer(size);
    const cells = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) cells.push({ x, y, v: spot(x, y, size) - tie[y][x] * 1e-3 });
    }
    cells.sort((a, b) => b.v - a.v);
    const m = Array.from({ length: size }, () => new Array(size));
    cells.forEach((c, rank) => { m[c.y][c.x] = rank; });
    return normalize(m);
};

const ORDERED = {
    'Bayer2': bayer(2),
    'Bayer4': bayer(4),
    'Bayer': bayer(8),
    'Bayer16': bayer(16),
    // Pontos que crescem a partir do centro, como uma retícula de impressão.
    'Cluster': fromSpot(8, (x, y, n) => Math.cos(2 * Math.PI * (x + 0.5) / n) + Math.cos(2 * Math.PI * (y + 0.5) / n)),
    'Lines': fromSpot(6, (x, y, n) => -Math.abs(y + 0.5 - n / 2)),
    'Diagonal': fromSpot(8, (x, y, n) => -Math.abs(((x + y) % n) + 0.5 - n / 2)),
};

// Ruído de gradiente intercalado (Jimenez): parece ruído azul, sem matriz que se repete.
const ign = (x, y) => {
    const f = 0.06711056 * x + 0.00583715 * y;
    const g = 52.9829189 * (f - Math.floor(f));
    return g - Math.floor(g) - 0.5;
};

const RIEMERSMA_QUEUE = 16;
const RIEMERSMA_RATIO = 16; // o erro mais recente pesa 16x o mais antigo

// --- Funções Auxiliares ---
const hexToRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

const colorDist = (r, g, b, c) => ((r - c.r) * 0.299) ** 2 + ((g - c.g) * 0.587) ** 2 + ((b - c.b) * 0.114) ** 2;

/**
 * Converte a distância d em coordenadas (x, y) numa curva de Hilbert de lado n.
 */
const hilbertPoint = (n, d) => {
    let x = 0, y = 0, t = d;
    for (let s = 1; s < n; s *= 2) {
        const rx = 1 & (t / 2);
        const ry = 1 & (t ^ rx);
        if (ry === 0) {
            if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
            [x, y] = [y, x];
        }
        x += s * rx;
        y += s * ry;
        t = Math.floor(t / 4);
    }
    return [x, y];
};

const boxBlur = (data, width, height, radius) => {
    const temp_data = new Uint8ClampedArray(data);
    const w = width, h = height, r = radius;
    const size = (r * 2 + 1);

    // Passada Horizontal
    for (let y = 0; y < h; y++) {
        let r_sum = 0, g_sum = 0, b_sum = 0;
        const offset = y * w * 4;

        for (let i = -r; i <= r; i++) {
            const xi = Math.max(0, Math.min(w - 1, i));
            const idx = offset + xi * 4;
            r_sum += temp_data[idx];
            g_sum += temp_data[idx + 1];
            b_sum += temp_data[idx + 2];
        }

        for (let x = 0; x < w; x++) {
            const idx = offset + x * 4;
            data[idx] = r_sum / size;
            data[idx + 1] = g_sum / size;
            data[idx + 2] = b_sum / size;

            const old_xi = Math.max(0, x - r);
            const new_xi = Math.min(w - 1, x + r + 1);
            const old_idx = offset + old_xi * 4;
            const new_idx = offset + new_xi * 4;

            r_sum += temp_data[new_idx] - temp_data[old_idx];
            g_sum += temp_data[new_idx + 1] - temp_data[old_idx + 1];
            b_sum += temp_data[new_idx + 2] - temp_data[old_idx + 2];
        }
    }

    // Passada Vertical
    temp_data.set(data);
    for (let x = 0; x < w; x++) {
        let r_sum = 0, g_sum = 0, b_sum = 0;

        for (let i = -r; i <= r; i++) {
            const yi = Math.max(0, Math.min(h - 1, i));
            const idx = yi * w * 4 + x * 4;
            r_sum += temp_data[idx];
            g_sum += temp_data[idx + 1];
            b_sum += temp_data[idx + 2];
        }

        for (let y = 0; y < h; y++) {
            const idx = y * w * 4 + x * 4;
            data[idx] = r_sum / size;
            data[idx + 1] = g_sum / size;
            data[idx + 2] = b_sum / size;

            const old_yi = Math.max(0, y - r);
            const new_yi = Math.min(h - 1, y + r + 1);
            const old_idx = old_yi * w * 4 + x * 4;
            const new_idx = new_yi * w * 4 + x * 4;

            r_sum += temp_data[new_idx] - temp_data[old_idx];
            g_sum += temp_data[new_idx + 1] - temp_data[old_idx + 1];
            b_sum += temp_data[new_idx + 2] - temp_data[old_idx + 2];
        }
    }
};

/**
 * Monta o quantizador do modo de cor escolhido.
 * Cada quantizador lê o valor (já com erro somado) de `buf` na célula i,
 * escreve a cor final em `out` e devolve em `err` o erro de cada canal.
 */
const createQuantizer = (state) => {
    const { colorMode, threshold, rgbLevels } = state;

    if (colorMode === 'mono' || colorMode === 'duotone' || colorMode === 'tritone') {
        const colors = colorMode === 'mono'
            ? [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }]
            : (colorMode === 'duotone' ? state.duoColors : state.triColors).map(hexToRgb);
        const steps = colors.length - 1;
        return {
            channels: 1,
            spread: 255 / steps,
            quantize(buf, i, out, o, err) {
                const v = buf[i];
                // Com dois tons, o limiar decide; com três, o nível mais próximo.
                const level = steps === 1
                    ? (v < threshold ? 0 : 1)
                    : Math.max(0, Math.min(steps, Math.round(v / (255 / steps))));
                const c = colors[level];
                out[o] = c.r; out[o + 1] = c.g; out[o + 2] = c.b;
                err[0] = v - level * (255 / steps);
            },
        };
    }

    if (colorMode === 'rgb') {
        const step = 255 / (rgbLevels - 1);
        return {
            channels: 3,
            spread: step,
            quantize(buf, i, out, o, err) {
                for (let c = 0; c < 3; c++) {
                    const v = buf[i + c];
                    const q = Math.max(0, Math.min(255, Math.round(v / step) * step));
                    out[o + c] = q;
                    err[c] = v - q;
                }
            },
        };
    }

    const colors = state.multiColors.map(hexToRgb);
    return {
        channels: 3,
        // As cores ficam espalhadas em 3D, então a distância entre vizinhas
        // cai com a raiz cúbica da quantidade, não com a quantidade.
        spread: 255 / Math.max(1, Math.cbrt(colors.length)),
        quantize(buf, i, out, o, err) {
            const r = buf[i], g = buf[i + 1], b = buf[i + 2];
            let nearest = colors[0], min = Infinity;
            for (const c of colors) {
                const d = colorDist(r, g, b, c);
                if (d < min) { min = d; nearest = c; }
            }
            out[o] = nearest.r; out[o + 1] = nearest.g; out[o + 2] = nearest.b;
            err[0] = r - nearest.r; err[1] = g - nearest.g; err[2] = b - nearest.b;
        },
    };
};

// --- Objeto Principal do Efeito ---
export const ditheringEffect = {
    name: 'DITHERING',
    getControlsHTML: () => `
        <div class="control-panel">
            <div class="controls-section">
                <div>
                    <label for="ditheringPattern">Algorithm</label>
                    <select id="ditheringPattern" name="ditheringPattern" class="text-input">
                        <optgroup label="Error diffusion">
                            <option value="F-S">Floyd-Steinberg</option>
                            <option value="Atkinson">Atkinson</option>
                            <option value="Jarvis">Jarvis-Judice-Ninke</option>
                        </optgroup>
                        <optgroup label="Ordered">
                            <option value="Bayer2">Bayer 2×2</option>
                            <option value="Bayer4">Bayer 4×4</option>
                            <option value="Bayer">Bayer 8×8</option>
                            <option value="Bayer16">Bayer 16×16</option>
                            <option value="Cluster">Cluster dot</option>
                            <option value="Lines">Lines</option>
                            <option value="Diagonal">Diagonal</option>
                            <option value="IGN">Noise</option>
                        </optgroup>
                        <optgroup label="Path">
                            <option value="Riemersma">Riemersma</option>
                            <option value="ModX">Modulated (Mod X)</option>
                        </optgroup>
                    </select>
                </div>

                <div>
                    <label>Color mode</label>
                    <div id="dither-color-mode" class="pattern-selector">
                        <button type="button" class="pattern-btn" data-mode="mono">Mono</button>
                        <button type="button" class="pattern-btn" data-mode="duotone">Duo</button>
                        <button type="button" class="pattern-btn" data-mode="tritone">Tri</button>
                        <button type="button" class="pattern-btn" data-mode="multi">Multi</button>
                        <button type="button" class="pattern-btn" data-mode="rgb">RGB</button>
                    </div>
                </div>

                <div id="tone-controls" class="control-row">
                    <div id="tone-swatches" class="tone-swatches"></div>
                    <p id="tone-note" class="mono-s"></p>
                    <div>
                        <p class="label">presets</p>
                        <div id="tone-presets" class="tone-presets"></div>
                    </div>
                </div>

                <div id="rgb-controls" class="control-row">
                    <div class="control-row-flex"><label for="rgbLevels">Levels per channel</label><span id="rgbLevelsValue">2</span></div>
                    <input type="range" id="rgbLevels" name="rgbLevels" min="2" max="6" value="2" step="1" class="slider">
                </div>

                <div id="threshold-control" class="control-row">
                    <div class="control-row-flex"><label for="threshold">Threshold</label><span id="thresholdValue">128</span></div>
                    <input type="range" id="threshold" name="threshold" min="0" max="255" value="128" class="slider">
                </div>

                <div>
                    <div class="control-row-flex"><label for="pixelSize">Pixel size</label><span id="pixelSizeValue">1</span></div>
                    <input type="range" id="pixelSize" name="pixelSize" min="1" max="20" value="1" class="slider">
                </div>

                <div>
                    <div class="control-row-flex"><label for="glow">Glow</label><span id="glowValue">0</span></div>
                    <input type="range" id="glow" name="glow" min="0" max="1" value="0" step="0.05" class="slider">
                </div>
            </div>
        </div>`,
    init(app) {
        const state = app.state.effects.dithering;
        const modeSelector = document.getElementById('dither-color-mode');
        const swatches = document.getElementById('tone-swatches');
        const presets = document.getElementById('tone-presets');
        const note = document.getElementById('tone-note');

        // Cada modo guarda as próprias cores no estado.
        const COLOR_KEYS = { duotone: 'duoColors', tritone: 'triColors', multi: 'multiColors' };
        const TONE_NAMES = { duotone: ['Shadows', 'Highlights'], tritone: ['Shadows', 'Midtones', 'Highlights'] };
        const NOTES = {
            duotone: 'brightness is split in two and mapped to these colors.',
            tritone: 'brightness is split in three and mapped to these colors.',
            multi: 'each pixel takes the closest color in this list.',
        };

        const renderColors = () => {
            const mode = state.colorMode;
            const key = COLOR_KEYS[mode];
            if (!key) return;
            const colors = state[key];
            const names = TONE_NAMES[mode];

            swatches.classList.toggle('is-multi', mode === 'multi');
            swatches.innerHTML = colors.map((c, i) => `
                <label class="tone-swatch">
                    <input type="color" value="${c}" data-index="${i}" aria-label="${names ? names[i] : `Color ${i + 1}`}">
                    ${names ? `<span>${names[i]}</span>` : ''}
                </label>`).join('')
                + (mode === 'multi' ? `
                <div class="swatch-count">
                    <button type="button" class="swatch-btn" data-step="-1" aria-label="Remove a color" ${colors.length <= MULTI_MIN ? 'disabled' : ''}>−</button>
                    <button type="button" class="swatch-btn" data-step="1" aria-label="Add a color" ${colors.length >= MULTI_MAX ? 'disabled' : ''}>+</button>
                </div>` : '');

            presets.innerHTML = Object.entries(COLOR_PRESETS[mode]).map(([name, preset]) => `
                <button type="button" class="tone-preset" data-preset="${name}" title="${name}">
                    <span class="tone-preset-chips">${preset.map(c => `<i style="background:${c}"></i>`).join('')}</span>
                    <span>${name}</span>
                </button>`).join('');
            note.textContent = NOTES[mode];
        };

        const toggleControls = () => {
            const mode = state.colorMode;
            document.getElementById('tone-controls').classList.toggle('hidden', !COLOR_KEYS[mode]);
            document.getElementById('rgb-controls').classList.toggle('hidden', mode !== 'rgb');
            // O limiar só faz sentido com dois tons.
            document.getElementById('threshold-control').classList.toggle('hidden', mode !== 'mono' && mode !== 'duotone');
            renderColors();
        };

        modeSelector.addEventListener('click', (e) => {
            const btn = e.target.closest('.pattern-btn');
            if (!btn) return;
            modeSelector.querySelectorAll('.pattern-btn').forEach(b => b.classList.toggle('active', b === btn));
            app.updateState({ colorMode: btn.dataset.mode });
            toggleControls();
        });

        // Os seletores de cor não têm id, então o listener genérico os ignora; tratamos aqui.
        swatches.addEventListener('input', (e) => {
            const index = e.target.dataset.index;
            if (index === undefined) return;
            const key = COLOR_KEYS[state.colorMode];
            const colors = [...state[key]];
            colors[index] = e.target.value;
            app.updateState({ [key]: colors });
        });

        swatches.addEventListener('click', (e) => {
            const btn = e.target.closest('.swatch-btn');
            if (!btn) return;
            const colors = [...state.multiColors];
            if (btn.dataset.step === '1') {
                colors.push(colors[colors.length - 1]);
            } else {
                colors.pop();
            }
            app.updateState({ multiColors: colors });
            renderColors();
        });

        presets.addEventListener('click', (e) => {
            const btn = e.target.closest('.tone-preset');
            if (!btn) return;
            const mode = state.colorMode;
            app.updateState({ [COLOR_KEYS[mode]]: [...COLOR_PRESETS[mode][btn.dataset.preset]] });
            renderColors();
        });

        toggleControls();
    },
    apply(imageData, state) {
        const { pixelSize, ditheringPattern, glow } = state;
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const gridW = Math.floor(width / pixelSize);
        const gridH = Math.floor(height / pixelSize);
        const cells = gridW * gridH;

        const quantizer = createQuantizer(state);
        const ch = quantizer.channels;

        // Média de cada bloco pixelSize x pixelSize, em luminância ou RGB.
        const buf = new Float32Array(cells * ch);
        for (let y = 0; y < gridH; y++) {
            for (let x = 0; x < gridW; x++) {
                let r = 0, g = 0, b = 0, count = 0;
                for (let py = 0; py < pixelSize; py++) {
                    for (let px = 0; px < pixelSize; px++) {
                        const i = ((y * pixelSize + py) * width + x * pixelSize + px) * 4;
                        r += data[i]; g += data[i + 1]; b += data[i + 2];
                        count++;
                    }
                }
                const c = (y * gridW + x) * ch;
                if (ch === 1) {
                    buf[c] = (r * 0.299 + g * 0.587 + b * 0.114) / count;
                } else {
                    buf[c] = r / count; buf[c + 1] = g / count; buf[c + 2] = b / count;
                }
            }
        }

        const out = new Uint8ClampedArray(cells * 3);
        const err = new Float32Array(3);

        if (KERNELS[ditheringPattern] || ditheringPattern === 'ModX') {
            const kernel = KERNELS[ditheringPattern];
            const isModulate = ditheringPattern === 'ModX';
            const spread = (x, y, dx, dy, factor) => {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || nx >= gridW || ny >= gridH) return;
                const n = (ny * gridW + nx) * ch;
                for (let c = 0; c < ch; c++) buf[n + c] += err[c] * factor;
            };

            for (let y = 0; y < gridH; y++) {
                // Serpentina: linhas alternam a direção, o que evita "vermes" diagonais.
                const reverse = !isModulate && (y & 1) === 1;
                const dir = reverse ? -1 : 1;
                for (let k = 0; k < gridW; k++) {
                    const x = reverse ? gridW - 1 - k : k;
                    const cell = y * gridW + x;
                    quantizer.quantize(buf, cell * ch, out, cell * 3, err);

                    if (isModulate) {
                        const modulation = Math.sin(y * 0.5 + x * 0.1) * 0.5 + 0.5;
                        const factor2 = 7/16 * modulation;
                        spread(x, y, 1, 0, 7/16 * (1 - modulation));
                        spread(x, y, 0, 1, factor2);
                        spread(x, y, -1, 1, 3/16);
                        spread(x, y, 1, 1, 5/16 - factor2);
                    } else {
                        for (const [dx, dy, f] of kernel) spread(x, y, dx * dir, dy, f);
                    }
                }
            }
        } else if (ditheringPattern === 'Riemersma') {
            // Percorre a grade pela curva de Hilbert e carrega uma fila com os
            // últimos erros; os mais recentes pesam mais.
            const weights = Array.from({ length: RIEMERSMA_QUEUE },
                (_, i) => Math.pow(RIEMERSMA_RATIO, i / (RIEMERSMA_QUEUE - 1)));
            const total = weights.reduce((a, b) => a + b, 0);
            for (let i = 0; i < weights.length; i++) weights[i] /= total;
            const history = Array.from({ length: RIEMERSMA_QUEUE }, () => new Float32Array(ch));

            let side = 1;
            while (side < Math.max(gridW, gridH)) side *= 2;
            for (let d = 0; d < side * side; d++) {
                const [x, y] = hilbertPoint(side, d);
                if (x >= gridW || y >= gridH) continue;
                const cell = y * gridW + x;
                for (let c = 0; c < ch; c++) {
                    let carried = 0;
                    for (let q = 0; q < RIEMERSMA_QUEUE; q++) carried += history[q][c] * weights[q];
                    buf[cell * ch + c] += carried;
                }
                quantizer.quantize(buf, cell * ch, out, cell * 3, err);
                const oldest = history.shift();
                for (let c = 0; c < ch; c++) oldest[c] = err[c];
                history.push(oldest);
            }
        } else {
            // Ordenados: desloca cada valor pelo limiar do padrão, sem propagar erro.
            const amount = quantizer.spread;
            const matrix = ORDERED[ditheringPattern] || ORDERED['Bayer'];
            const size = matrix.length;
            const isNoise = ditheringPattern === 'IGN';
            for (let y = 0; y < gridH; y++) {
                const row = matrix[y % size];
                for (let x = 0; x < gridW; x++) {
                    const cell = y * gridW + x;
                    const offset = (isNoise ? ign(x, y) : row[x % size]) * amount;
                    for (let c = 0; c < ch; c++) buf[cell * ch + c] += offset;
                    quantizer.quantize(buf, cell * ch, out, cell * 3, err);
                }
            }
        }

        // Expande cada célula de volta para o bloco de pixels.
        for (let y = 0; y < gridH * pixelSize; y++) {
            const gy = Math.floor(y / pixelSize);
            for (let x = 0; x < gridW * pixelSize; x++) {
                const o = (gy * gridW + Math.floor(x / pixelSize)) * 3;
                const i = (y * width + x) * 4;
                data[i] = out[o]; data[i + 1] = out[o + 1]; data[i + 2] = out[o + 2];
            }
        }

        if (glow > 0) {
            let maxBrightness = 0;
            for (let o = 0; o < out.length; o += 3) {
                const brightness = out[o] * 0.299 + out[o + 1] * 0.587 + out[o + 2] * 0.114;
                if (brightness > maxBrightness) maxBrightness = brightness;
            }
            const glowThreshold = maxBrightness * 0.8;
            const glowMap = new Uint8ClampedArray(data.length);
            for (let i = 0; i < data.length; i += 4) {
                const brightness = (data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114);
                if (brightness >= glowThreshold) {
                    glowMap[i] = data[i]; glowMap[i+1] = data[i+1]; glowMap[i+2] = data[i+2];
                }
            }
            boxBlur(glowMap, width, height, 10);
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 255 - (255 - data[i]) * (255 - glowMap[i] * glow) / 255;
                data[i+1] = 255 - (255 - data[i+1]) * (255 - glowMap[i+1] * glow) / 255;
                data[i+2] = 255 - (255 - data[i+2]) * (255 - glowMap[i+2] * glow) / 255;
            }
        }
    }
};
