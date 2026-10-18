/**
 * effects/watercolor.js
 * * Aquarela, seguindo Bousseau et al., "Interactive Watercolor Rendering
 * with Temporal Coherence and Abstraction" (2006):
 * - abstração: manchas de Kuwahara suavizadas;
 * - borda tremida: a imagem é amostrada com um deslocamento de ruído suave;
 * - pigmento: a cor é escurecida ou clareada por mapas de densidade
 *   (fluxo turbulento, granulação, papel e acúmulo nas bordas), com
 *   C' = C - (C - C²)(d - 1), onde d > 1 escurece e d < 1 clareia.
 */
import {
    splitRGB, writeRGB, luminance, kuwahara, blur, fbm, sobel, sampleBilinear,
} from './paint-core.js';

const PAPER_TINT = [0.98, 0.96, 0.91];

const pigment = (c, d) => c - (c - c * c) * (d - 1);

export const watercolorEffect = {
    name: 'WATERCOLOR',
    getControlsHTML: () => `
        <div class="control-panel">
            <div class="controls-section">
                <div>
                    <div class="control-row-flex"><label for="wcSimplify">Simplify</label><span id="wcSimplifyValue">4</span></div>
                    <input type="range" id="wcSimplify" name="wcSimplify" min="1" max="10" value="4" step="1" class="slider">
                </div>
                <div>
                    <div class="control-row-flex"><label for="wcWobble">Wobble</label><span id="wcWobbleValue">3</span></div>
                    <input type="range" id="wcWobble" name="wcWobble" min="0" max="12" value="3" step="0.5" class="slider">
                </div>
                <div>
                    <div class="control-row-flex"><label for="wcEdges">Edge darkening</label><span id="wcEdgesValue">0.5</span></div>
                    <input type="range" id="wcEdges" name="wcEdges" min="0" max="1" value="0.5" step="0.05" class="slider">
                </div>
                <div>
                    <div class="control-row-flex"><label for="wcGranulation">Granulation</label><span id="wcGranulationValue">0.5</span></div>
                    <input type="range" id="wcGranulation" name="wcGranulation" min="0" max="1" value="0.5" step="0.05" class="slider">
                </div>
                <div>
                    <div class="control-row-flex"><label for="wcPaper">Paper texture</label><span id="wcPaperValue">0.5</span></div>
                    <input type="range" id="wcPaper" name="wcPaper" min="0" max="1" value="0.5" step="0.05" class="slider">
                </div>
                <div>
                    <div class="control-row-flex"><label for="wcWash">Wash</label><span id="wcWashValue">0.3</span></div>
                    <input type="range" id="wcWash" name="wcWash" min="0" max="1" value="0.3" step="0.05" class="slider">
                </div>
            </div>
        </div>`,
    apply(imageData, state) {
        const { wcSimplify, wcWobble, wcEdges, wcGranulation, wcPaper, wcWash } = state;
        const { width: w, height: h, data } = imageData;
        const n = w * h;

        const rgb = splitRGB(data, n);
        // Duas passadas de Kuwahara achatam a imagem em lavagens de cor quase lisas.
        let base = kuwahara(rgb, luminance(rgb), w, h, wcSimplify);
        base = kuwahara(base, luminance(base), w, h, Math.max(1, wcSimplify - 1)).map(c => blur(c, w, h, 1));

        // Borda tremida: amostra a imagem deslocada por um ruído grosso.
        if (wcWobble > 0) {
            const ox = fbm(w, h, 48, 2, 11), oy = fbm(w, h, 48, 2, 23);
            base = base.map(src => {
                const out = new Float32Array(n);
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const i = y * w + x;
                        out[i] = sampleBilinear(src, w, h, x + (ox[i] - 0.5) * 2 * wcWobble, y + (oy[i] - 0.5) * 2 * wcWobble);
                    }
                }
                return out;
            });
        }

        // Bordas das manchas, onde o pigmento se acumula ao secar.
        const { gx, gy } = sobel(luminance(base), w, h);

        const flow = fbm(w, h, 90, 3, 5);       // fluxo turbulento, manchas grandes
        const grain = fbm(w, h, 2.5, 2, 7);     // granulação do pigmento
        const paper = fbm(w, h, 7, 3, 9);       // fibra do papel

        for (let i = 0; i < n; i++) {
            const e = Math.min(1, Math.hypot(gx[i], gy[i]) / 90);
            const edge = e * e * (3 - 2 * e);
            const dFlow = 1 + wcGranulation * 0.5 * (flow[i] - 0.5) * 2;
            const dGrain = 1 + wcGranulation * 0.4 * (grain[i] - 0.5) * 2;
            const dPaper = 1 + wcPaper * 0.5 * (paper[i] - 0.5) * 2;
            const dEdge = 1 + wcEdges * edge * 0.9;
            const paperShade = 1 - wcPaper * 0.07 * (1 - paper[i]);

            for (let c = 0; c < 3; c++) {
                // Lavagem: a tinta é transparente, o papel aparece por baixo.
                let v = base[c][i] / 255;
                v = v + (1 - v) * wcWash * 0.6;
                v = pigment(v, dFlow);
                v = pigment(v, dGrain);
                v = pigment(v, dPaper);
                v = pigment(v, dEdge);
                base[c][i] = Math.max(0, Math.min(1, v)) * PAPER_TINT[c] * paperShade * 255;
            }
        }
        writeRGB(data, base);
    },
};
