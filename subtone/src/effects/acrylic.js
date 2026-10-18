/**
 * effects/acrylic.js
 * * Acrílico: cores chapadas e saturadas, pinceladas curtas, pouco relevo
 * e a trama da tela aparecendo através da tinta fina.
 */
import {
    splitRGB, writeRGB, luminance, flowField, kuwahara, lic,
    whiteNoise, normalize, canvasWeave, relief, saturate,
} from './paint-core.js';

export const acrylicEffect = {
    name: 'ACRYLIC',
    getControlsHTML: () => `
        <div class="control-panel">
            <div class="controls-section">
                <div>
                    <div class="control-row-flex"><label for="acrBrush">Brush size</label><span id="acrBrushValue">4</span></div>
                    <input type="range" id="acrBrush" name="acrBrush" min="1" max="12" value="4" step="1" class="slider">
                </div>
                <div>
                    <div class="control-row-flex"><label for="acrStroke">Stroke length</label><span id="acrStrokeValue">6</span></div>
                    <input type="range" id="acrStroke" name="acrStroke" min="2" max="16" value="6" step="1" class="slider">
                </div>
                <div>
                    <div class="control-row-flex"><label for="acrLevels">Color levels</label><span id="acrLevelsValue">9</span></div>
                    <input type="range" id="acrLevels" name="acrLevels" min="2" max="16" value="9" step="1" class="slider">
                </div>
                <div>
                    <div class="control-row-flex"><label for="acrSaturation">Saturation</label><span id="acrSaturationValue">1.3</span></div>
                    <input type="range" id="acrSaturation" name="acrSaturation" min="0" max="2" value="1.3" step="0.05" class="slider">
                </div>
                <div>
                    <div class="control-row-flex"><label for="acrTexture">Texture</label><span id="acrTextureValue">0.5</span></div>
                    <input type="range" id="acrTexture" name="acrTexture" min="0" max="1" value="0.5" step="0.05" class="slider">
                </div>
            </div>
        </div>`,
    apply(imageData, state) {
        const { acrBrush, acrStroke, acrLevels, acrSaturation, acrTexture } = state;
        const { width: w, height: h, data } = imageData;
        const n = w * h;

        const rgb = splitRGB(data, n);
        const flow = flowField(luminance(rgb), w, h, 2 + acrBrush / 2);

        const patches = kuwahara(rgb, luminance(rgb), w, h, acrBrush);
        let paint = lic(patches, flow, w, h, Math.ceil(acrStroke / 2));
        saturate(paint, acrSaturation);

        // Cores chapadas: poucos níveis por canal, com as fronteiras
        // suavizadas de novo ao longo das pinceladas.
        const step = 255 / (acrLevels - 1);
        for (const ch of paint) {
            for (let i = 0; i < n; i++) ch[i] = Math.round(ch[i] / step) * step;
        }
        paint = lic(paint, flow, w, h, 2);

        // Pinceladas curtas e a trama da tela por baixo.
        const strokes = normalize(lic([whiteNoise(w, h, 5)], flow, w, h, acrStroke)[0], 0.16);
        const weave = canvasWeave(w, h, 2.5);
        const height = new Float32Array(n);
        for (let i = 0; i < n; i++) height[i] = strokes[i] * 0.55 + weave[i] * 0.45;

        const { diffuse, spec } = relief(height, w, h, 1 + acrTexture * 5);
        for (let c = 0; c < 3; c++) {
            const ch = paint[c];
            for (let i = 0; i < n; i++) ch[i] = ch[i] * (1 + diffuse[i] * acrTexture * 1.2) + spec[i] * acrTexture * 60;
        }
        writeRGB(data, paint);
    },
};
