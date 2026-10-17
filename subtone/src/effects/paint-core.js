/**
 * effects/paint-core.js
 * * Peças compartilhadas pelos efeitos de pintura (óleo, aquarela, acrílico).
 * Tudo trabalha com canais Float32Array separados (r, g, b), em 0..255.
 * * - Fluxo: tensor de estrutura suavizado, que dá a direção das bordas em cada
 *   pixel (Kyprianidis et al., "Image and Video Abstraction by Anisotropic
 *   Kuwahara Filtering", 2009). As pinceladas seguem essa direção.
 * - Kuwahara: simplifica a imagem em manchas preservando as bordas. Usa imagens
 *   integrais, então o custo por pixel não depende do raio.
 * - LIC (line integral convolution): média ao longo das linhas de fluxo. Aplicada
 *   em ruído, vira textura de cerdas; aplicada na cor, arrasta a tinta.
 * - Ruídos determinísticos (a mesma imagem sempre gera a mesma textura, então
 *   mexer num slider não faz a textura "piscar").
 * - Relevo: ilumina um mapa de altura, para o impasto e a trama da tela.
 */

const clampi = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function splitRGB(data, n) {
    const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        r[i] = data[i * 4]; g[i] = data[i * 4 + 1]; b[i] = data[i * 4 + 2];
    }
    return [r, g, b];
}

export function writeRGB(data, [r, g, b]) {
    for (let i = 0; i < r.length; i++) {
        data[i * 4] = r[i]; data[i * 4 + 1] = g[i]; data[i * 4 + 2] = b[i];
    }
}

export function luminance([r, g, b]) {
    const L = new Float32Array(r.length);
    for (let i = 0; i < L.length; i++) L[i] = r[i] * 0.299 + g[i] * 0.587 + b[i] * 0.114;
    return L;
}

// --- Desfoque (três passadas de caixa ≈ gaussiano) ---

function boxH(src, dst, w, h, r) {
    const size = r * 2 + 1;
    for (let y = 0; y < h; y++) {
        const o = y * w;
        let sum = 0;
        for (let i = -r; i <= r; i++) sum += src[o + clampi(i, 0, w - 1)];
        for (let x = 0; x < w; x++) {
            dst[o + x] = sum / size;
            sum += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
        }
    }
}

function boxV(src, dst, w, h, r) {
    const size = r * 2 + 1;
    for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let i = -r; i <= r; i++) sum += src[clampi(i, 0, h - 1) * w + x];
        for (let y = 0; y < h; y++) {
            dst[y * w + x] = sum / size;
            sum += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x];
        }
    }
}

export function blur(src, w, h, sigma) {
    const r = Math.max(1, Math.round(sigma));
    let a = Float32Array.from(src);
    const b = new Float32Array(src.length);
    for (let pass = 0; pass < 3; pass++) {
        boxH(a, b, w, h, r);
        boxV(b, a, w, h, r);
    }
    return a;
}

// --- Gradiente e fluxo ---

export function sobel(L, w, h) {
    const gx = new Float32Array(L.length), gy = new Float32Array(L.length);
    for (let y = 0; y < h; y++) {
        const ym = Math.max(0, y - 1) * w, y0 = y * w, yp = Math.min(h - 1, y + 1) * w;
        for (let x = 0; x < w; x++) {
            const xm = Math.max(0, x - 1), xp = Math.min(w - 1, x + 1);
            gx[y0 + x] = (L[ym + xp] + 2 * L[y0 + xp] + L[yp + xp]) - (L[ym + xm] + 2 * L[y0 + xm] + L[yp + xm]);
            gy[y0 + x] = (L[yp + xm] + 2 * L[yp + x] + L[yp + xp]) - (L[ym + xm] + 2 * L[ym + x] + L[ym + xp]);
        }
    }
    return { gx, gy };
}

/**
 * Direção tangente às bordas em cada pixel, a partir do tensor de estrutura.
 * @returns {{tx: Float32Array, ty: Float32Array}}
 */
export function flowField(L, w, h, sigma) {
    const { gx, gy } = sobel(L, w, h);
    const n = L.length;
    let E = new Float32Array(n), F = new Float32Array(n), G = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        E[i] = gx[i] * gx[i]; F[i] = gx[i] * gy[i]; G[i] = gy[i] * gy[i];
    }
    E = blur(E, w, h, sigma); F = blur(F, w, h, sigma); G = blur(G, w, h, sigma);

    const tx = new Float32Array(n), ty = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const e = E[i], f = F[i], g = G[i];
        const l1 = (e + g + Math.sqrt((e - g) * (e - g) + 4 * f * f)) / 2;
        let vx = l1 - e, vy = -f;
        const len = Math.hypot(vx, vy);
        if (len > 1e-6) { vx /= len; vy /= len; } else { vx = 0; vy = 1; }
        tx[i] = vx; ty[i] = vy;
    }
    return { tx, ty };
}

// --- Kuwahara ---

function integral(src, w, h) {
    const W = w + 1;
    const I = new Float64Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) {
            row += src[y * w + x];
            I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row;
        }
    }
    return I;
}

/**
 * Kuwahara clássico de 4 quadrantes: cada pixel recebe a média do quadrante
 * de menor variância à sua volta.
 */
export function kuwahara(channels, L, w, h, radius) {
    const W = w + 1;
    const I = channels.map(c => integral(c, w, h));
    const IL = integral(L, w, h);
    const L2 = new Float32Array(L.length);
    for (let i = 0; i < L.length; i++) L2[i] = L[i] * L[i];
    const IL2 = integral(L2, w, h);
    const outs = channels.map(() => new Float32Array(L.length));
    const sum = (T, x0, y0, x1, y1) => T[(y1 + 1) * W + x1 + 1] - T[y0 * W + x1 + 1] - T[(y1 + 1) * W + x0] + T[y0 * W + x0];

    for (let y = 0; y < h; y++) {
        const ya = Math.max(0, y - radius), yb = Math.min(h - 1, y + radius);
        for (let x = 0; x < w; x++) {
            const xa = Math.max(0, x - radius), xb = Math.min(w - 1, x + radius);
            const quads = [[xa, ya, x, y], [x, ya, xb, y], [xa, y, x, yb], [x, y, xb, yb]];
            let best = null, bestVar = Infinity;
            for (const q of quads) {
                const area = (q[2] - q[0] + 1) * (q[3] - q[1] + 1);
                const mean = sum(IL, q[0], q[1], q[2], q[3]) / area;
                const variance = sum(IL2, q[0], q[1], q[2], q[3]) / area - mean * mean;
                if (variance < bestVar) { bestVar = variance; best = q; }
            }
            const area = (best[2] - best[0] + 1) * (best[3] - best[1] + 1);
            const i = y * w + x;
            for (let c = 0; c < channels.length; c++) outs[c][i] = sum(I[c], best[0], best[1], best[2], best[3]) / area;
        }
    }
    return outs;
}

// --- LIC ---

/**
 * Média de cada canal ao longo da linha de fluxo que passa pelo pixel,
 * `length` passos para cada lado.
 */
export function lic(channels, { tx, ty }, w, h, length) {
    const nc = channels.length;
    const outs = channels.map(() => new Float32Array(w * h));
    const acc = new Float32Array(nc);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            for (let c = 0; c < nc; c++) acc[c] = channels[c][i];
            let count = 1;
            for (let sgn = -1; sgn <= 1; sgn += 2) {
                let px = x + 0.5, py = y + 0.5;
                let dx = tx[i] * sgn, dy = ty[i] * sgn;
                for (let s = 0; s < length; s++) {
                    px += dx; py += dy;
                    if (px < 0 || py < 0 || px >= w || py >= h) break;
                    const j = (py | 0) * w + (px | 0);
                    for (let c = 0; c < nc; c++) acc[c] += channels[c][j];
                    count++;
                    // Mantém o sentido da caminhada: o tensor não distingue t de -t.
                    let nx = tx[j], ny = ty[j];
                    if (nx * dx + ny * dy < 0) { nx = -nx; ny = -ny; }
                    dx = nx; dy = ny;
                }
            }
            for (let c = 0; c < nc; c++) outs[c][i] = acc[c] / count;
        }
    }
    return outs;
}

// --- Ruídos ---

const hash = (x, y, seed) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
};

export function whiteNoise(w, h, seed) {
    const n = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) n[y * w + x] = hash(x, y, seed);
    return n;
}

/** Ruído fractal (fbm) em 0..1, com `scale` em pixels na oitava mais grossa. */
export function fbm(w, h, scale, octaves, seed) {
    const out = new Float32Array(w * h);
    let amp = 1, total = 0, s = scale;
    for (let o = 0; o < octaves; o++) {
        for (let y = 0; y < h; y++) {
            const fy = y / s, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
            for (let x = 0; x < w; x++) {
                const fx = x / s, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
                const a = hash(x0, y0, seed + o), b = hash(x0 + 1, y0, seed + o);
                const c = hash(x0, y0 + 1, seed + o), d = hash(x0 + 1, y0 + 1, seed + o);
                out[y * w + x] += amp * ((a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy);
            }
        }
        total += amp; amp *= 0.5; s /= 2;
    }
    for (let i = 0; i < out.length; i++) out[i] /= total;
    return out;
}

/** Trama de tela: fios alternando por cima e por baixo, com um pouco de irregularidade. */
export function canvasWeave(w, h, thread) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const cx = x / thread, cy = y / thread;
            const ix = Math.floor(cx), iy = Math.floor(cy);
            const over = ((ix + iy) & 1) === 0;
            const v = over ? Math.sin(Math.PI * (cy - iy)) : Math.sin(Math.PI * (cx - ix));
            out[y * w + x] = v * 0.8 + hash(x, y, 77) * 0.2;
        }
    }
    return out;
}

/** Normaliza para média 0.5 e desvio `spread`. A LIC achata o contraste do ruído. */
export function normalize(src, spread) {
    let mean = 0;
    for (let i = 0; i < src.length; i++) mean += src[i];
    mean /= src.length;
    let variance = 0;
    for (let i = 0; i < src.length; i++) variance += (src[i] - mean) ** 2;
    const std = Math.sqrt(variance / src.length) || 1;
    const out = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) out[i] = 0.5 + (src[i] - mean) / std * spread;
    return out;
}

// --- Relevo ---

const LIGHT = (() => { const l = [-0.45, -0.55, 0.7], n = Math.hypot(...l); return l.map(v => v / n); })();
const HALF = (() => { const v = [LIGHT[0], LIGHT[1], LIGHT[2] + 1], n = Math.hypot(...v); return v.map(c => c / n); })();
const SPEC_POWER = 24;
const SPEC_FLAT = Math.pow(HALF[2], SPEC_POWER);

/**
 * Ilumina um mapa de altura vindo do canto superior esquerdo.
 * @returns {{diffuse: Float32Array, spec: Float32Array}} diffuse é 0 numa
 * superfície plana, positivo nas faces voltadas para a luz; spec é só o brilho extra.
 */
export function relief(height, w, h, strength) {
    const diffuse = new Float32Array(w * h), spec = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        const ym = Math.max(0, y - 1) * w, yp = Math.min(h - 1, y + 1) * w;
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const nx = -(height[y * w + Math.min(w - 1, x + 1)] - height[y * w + Math.max(0, x - 1)]) * strength;
            const ny = -(height[yp + x] - height[ym + x]) * strength;
            const len = Math.hypot(nx, ny, 1);
            const d = (nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / len;
            diffuse[i] = d - LIGHT[2];
            const hDot = Math.max(0, (nx * HALF[0] + ny * HALF[1] + HALF[2]) / len);
            spec[i] = Math.max(0, Math.pow(hDot, SPEC_POWER) - SPEC_FLAT);
        }
    }
    return { diffuse, spec };
}

export function saturate([r, g, b], amount) {
    for (let i = 0; i < r.length; i++) {
        const l = r[i] * 0.299 + g[i] * 0.587 + b[i] * 0.114;
        r[i] = l + (r[i] - l) * amount;
        g[i] = l + (g[i] - l) * amount;
        b[i] = l + (b[i] - l) * amount;
    }
}

export function sampleBilinear(src, w, h, x, y) {
    x = clampi(x, 0, w - 1.001); y = clampi(y, 0, h - 1.001);
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
    const i = y0 * w + x0;
    const a = src[i], b = src[i + 1], c = src[i + w], d = src[i + w + 1];
    return a + (b - a) * fx + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}
