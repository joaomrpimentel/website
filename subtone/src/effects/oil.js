/**
 * effects/oil.js
 * * Pintura a óleo: manchas de Kuwahara arrastadas ao longo das bordas,
 * textura de cerdas (ruído convolvido no fluxo) e impasto iluminado.
 */
import {
    splitRGB, writeRGB, luminance, flowField, kuwahara, lic,
    whiteNoise, blur, normalize, canvasWeave, relief, saturate,
} from './paint-core.js';

export const oilEffect = {
    name: 'OIL',
    getControlsHTML: () => `
        <div class="control-panel">
            <div class="controls-section">
                <div>
                    <div class="control-row-flex"><label for="oilBrush">Brush size</label><span id="oilBrushValue">5</span></div>
                    <input type="range" id="oilBrush" name="oilBrush" min="1" max="12" value="5" step="1" class="slider">
                </div>
                <div>
                    <div class="control-row-flex"><label for="oilStroke">Stroke length</label><span id="oilStrokeValue">10</span></div>
                    <input type="range" id="oilStroke" name="oilStroke" min="2" max="24" value="10" step="1" class="slider">
                </div>
                <div>
                    <div class="control-row-flex"><label for="oilImpasto">Impasto</label><span id="oilImpastoValue">0.6</span></div>
                    <input type="range" id="oilImpasto" name="oilImpasto" min="0" max="1" value="0.6" step="0.05" class="slider">
                </div>
                <div>
                    <div class="control-row-flex"><label for="oilCanvas">Canvas texture</label><span id="oilCanvasValue">0.25</span></div>
                    <input type="range" id="oilCanvas" name="oilCanvas" min="0" max="1" value="0.25" step="0.05" class="slider">
                </div>
                <div>
                    <div class="control-row-flex"><label for="oilSaturation">Saturation</label><span id="oilSaturationValue">1.15</span></div>
                    <input type="range" id="oilSaturation" name="oilSaturation" min="0" max="2" value="1.15" step="0.05" class="slider">
                </div>
            </div>
        </div>`,
    apply(imageData, state) {
        const { oilBrush, oilStroke, oilImpasto, oilCanvas, oilSaturation } = state;
        const { width: w, height: h, data } = imageData;
        const n = w * h;

        const rgb = splitRGB(data, n);
        const flow = flowField(luminance(rgb), w, h, 2 + oilBrush / 2);

        // Manchas de cor, depois arrastadas ao longo do fluxo.
        const patches = kuwahara(rgb, luminance(rgb), w, h, oilBrush);
        const paint = lic(patches, flow, w, h, Math.ceil(oilStroke / 2));
        saturate(paint, oilSaturation);

        // Cerdas: ruído fino convolvido ao longo do fluxo vira riscos paralelos;
        // o desfoque final arredonda os sulcos.
        const bristles = blur(normalize(lic([whiteNoise(w, h, 3)], flow, w, h, oilStroke)[0], 0.12), w, h, 1);
        const weave = canvasWeave(w, h, 3);
        const L = luminance(paint);
        const height = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            height[i] = bristles[i] * 0.75 + (L[i] / 255) * 0.25 + weave[i] * oilCanvas * 0.35;
        }

        const { diffuse, spec } = relief(height, w, h, 1 + oilImpasto * 4);
        const shade = 0.4 + oilImpasto * 0.7;
        for (let c = 0; c < 3; c++) {
            const ch = paint[c];
            for (let i = 0; i < n; i++) {
                // Cada cerda carrega um pouco mais ou menos de tinta.
                const load = 0.94 + bristles[i] * 0.12;
                ch[i] = ch[i] * load * (1 + diffuse[i] * shade) + spec[i] * oilImpasto * 90;
            }
        }
        writeRGB(data, paint);
    },
};
