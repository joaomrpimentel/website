/**
 * effects/dithering.js
 * * Contém a lógica para o efeito de Dithering.
 * Inclui os padrões Floyd-Steinberg, Bayer e Modulate Diffuse X,
 * com suporte a paletas de cores customizadas e efeito de glow.
 */

// --- Paletas de Cores ---
const PALETTES = {
    'GameBoy': [{r:15,g:56,b:15}, {r:48,g:98,b:48}, {r:139,g:172,b:139}, {r:155,g:188,b:155}],
    'Rusty': [{r:46,g:34,b:34}, {r:87,g:56,b:34}, {r:168,g:78,b:49}, {r:224,g:142,b:86}],
    'Faded': [{r:43,g:43,b:64}, {r:86,g:74,b:102}, {r:156,g:127,b:148}, {r:222,g:202,b:202}],
    'Holo': [{r:25,g:9,b:51}, {r:92,g:22,b:125}, {r:255,g:48,b:150}, {r:255,g:135,b:158}, {r:255,g:213,b:182}, {r:232,g:255,b:222}],
    'Cyber': [{r:0,g:255,b:255}, {r:255,g:102,b:255}, {r:132,g:0,b:255}, {r:51,g:0,b:132}, {r:25,g:0,b:76}, {r:0,g:0,b:0}],
    'Auto': [] // Paleta gerada dinamicamente
};

// --- Funções Auxiliares ---
const colorDist = (c1, c2) => Math.pow((c1.r - c2.r) * 0.299, 2) + Math.pow((c1.g - c2.g) * 0.587, 2) + Math.pow((c1.b - c2.b) * 0.114, 2);

const findNearestColor = (pixel, palette) => {
    if (!palette || palette.length === 0) {
        return { r: pixel.r, g: pixel.g, b: pixel.b };
    }
    let nearest = palette[0];
    let minDist = Infinity;
    for (const color of palette) {
        const dist = colorDist(pixel, color);
        if (dist < minDist) {
            minDist = dist;
            nearest = color;
        }
    }
    return nearest;
};

const generateAutoPalette = (count) => {
    let palette = [{r: 0, g: 0, b: 0}, {r: 255, g: 255, b: 255}];
    if (count <= 2) return palette;
    const points = Math.ceil(Math.pow(count - 2, 1 / 3));
    const step = 255 / (points > 1 ? points - 1 : 1);
    for (let r = 0; r < points; r++) {
        for (let g = 0; g < points; g++) {
            for (let b = 0; b < points; b++) {
                if (palette.length < count) {
                     const newColor = { r: Math.round(r * step), g: Math.round(g * step), b: Math.round(b * step) };
                     if (!palette.some(c => c.r === newColor.r && c.g === newColor.g && c.b === newColor.b)) {
                        palette.push(newColor);
                     }
                }
            }
        }
    }
    return palette;
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

// --- Objeto Principal do Efeito ---
export const ditheringEffect = {
    name: 'DITHERING',
    getControlsHTML: () => `
        <div class="control-panel">
            <h3 class="panel-title">--Effect Controls--</h3>
            <div class="controls-section">
                <div>
                    <label>Pattern</label>
                    <div id="dithering-pattern-selector" class="pattern-selector">
                        <button class="pattern-btn active" data-pattern="F-S">F-S</button>
                        <button class="pattern-btn" data-pattern="Bayer">Bayer</button>
                        <button class="pattern-btn" data-pattern="ModX">Mod X</button>
                    </div>
                </div>
                <div>
                    <div class="control-row-flex"><label for="pixelSize">Pixel Size</label><span id="pixelSizeValue">1</span></div>
                    <input type="range" id="pixelSize" name="pixelSize" min="1" max="20" value="1" class="slider">
                </div>
                <div class="control-row-flex">
                    <label for="usePalette">Use Color Palette</label>
                    <label class="switch"><input type="checkbox" id="usePalette" name="usePalette" checked><span class="switch-slider"></span></label>
                </div>

                <div id="palette-controls" class="control-row">
                    <div>
                        <label for="palette">Color Palette</label>
                        <select id="palette" name="palette" class="text-input">
                            <option value="GameBoy">Game Boy</option>
                            <option value="Rusty">Rusty</option>
                            <option value="Faded">Faded</option>
                            <option value="Holo">Holo</option>
                            <option value="Cyber">Cyber</option>
                            <option value="Auto">Auto-Generate</option>
                        </select>
                    </div>
                    <div id="colorCount-control" class="control-row hidden">
                        <div class="control-row-flex"><label for="colorCount">Color Count</label><span id="colorCountValue">8</span></div>
                        <input type="range" id="colorCount" name="colorCount" min="2" max="32" value="8" class="slider">
                    </div>
                </div>

                <div id="threshold-control" class="control-row hidden">
                    <div class="control-row-flex"><label for="threshold">Threshold</label><span id="thresholdValue">128</span></div>
                    <input type="range" id="threshold" name="threshold" min="0" max="255" value="128" class="slider">
                </div>

                <div>
                    <div class="control-row-flex"><label for="glow">Glow</label><span id="glowValue">0</span></div>
                    <input type="range" id="glow" name="glow" min="0" max="1" value="0" step="0.05" class="slider">
                </div>
            </div>
        </div>`,
    init(app) {
        document.getElementById('dithering-pattern-selector').addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                document.querySelector('#dithering-pattern-selector .active')?.classList.remove('active');
                e.target.classList.add('active');
                app.updateState({ ditheringPattern: e.target.dataset.pattern });
            }
        });
        
        const usePaletteCheckbox = document.getElementById('usePalette');
        const paletteControls = document.getElementById('palette-controls');
        const thresholdControl = document.getElementById('threshold-control');
        const colorCountControl = document.getElementById('colorCount-control');
        const paletteSelector = document.getElementById('palette');

        const toggleControls = () => {
            const usePalette = usePaletteCheckbox.checked;
            paletteControls.classList.toggle('hidden', !usePalette);
            thresholdControl.classList.toggle('hidden', usePalette);
            
            if (usePalette) {
                const isAuto = paletteSelector.value === 'Auto';
                colorCountControl.classList.toggle('hidden', !isAuto);
            } else {
                colorCountControl.classList.add('hidden');
            }
        };
        
        usePaletteCheckbox.addEventListener('change', (e) => {
            app.updateState({ usePalette: e.target.checked });
            toggleControls();
        });
        
        paletteSelector.addEventListener('change', (e) => {
            app.updateState({ palette: e.target.value });
            toggleControls();
        });

        toggleControls();
    },
    apply(imageData, state) {
        const { pixelSize, usePalette, ditheringPattern, threshold, colorCount, palette, glow } = state;
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const gridW = Math.floor(width / pixelSize);
        const gridH = Math.floor(height / pixelSize);
        const pixelGrid = new Array(gridW * gridH);
        
        for (let y = 0; y < gridH; y++) {
            for (let x = 0; x < gridW; x++) {
                let r = 0, g = 0, b = 0, count = 0;
                for (let py = 0; py < pixelSize; py++) {
                    for (let px = 0; px < pixelSize; px++) {
                        const ix = x * pixelSize + px;
                        const iy = y * pixelSize + py;
                        if (ix < width && iy < height) {
                            const i = (iy * width + ix) * 4;
                            r += data[i]; g += data[i+1]; b += data[i+2];
                            count++;
                        }
                    }
                }
                if (count > 0) {
                    if (usePalette) {
                        pixelGrid[y * gridW + x] = { r: r / count, g: g / count, b: b / count };
                    } else {
                        const avg = (r / count * 0.299) + (g / count * 0.587) + (b / count * 0.114);
                        pixelGrid[y * gridW + x] = avg;
                    }
                }
            }
        }

        const colorPalette = usePalette 
            ? (palette === 'Auto' ? generateAutoPalette(colorCount) : PALETTES[palette]) 
            : [];

        if (ditheringPattern === 'F-S' || ditheringPattern === 'ModX') {
            const sourceGrid = JSON.parse(JSON.stringify(pixelGrid));
            const isModulate = ditheringPattern === 'ModX';

            for (let y = 0; y < gridH; y++) {
                for (let x = 0; x < gridW; x++) {
                    const i = y * gridW + x;
                    const originalPixel = sourceGrid[i];
                    
                    const newPixel = usePalette ? findNearestColor(originalPixel, colorPalette) : (originalPixel < threshold ? 0 : 255);
                    pixelGrid[i] = newPixel;
                    
                    const errR = usePalette ? originalPixel.r - newPixel.r : originalPixel - newPixel;
                    const errG = usePalette ? originalPixel.g - newPixel.g : errR;
                    const errB = usePalette ? originalPixel.b - newPixel.b : errR;

                    const setError = (dx, dy, factor) => {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
                            const ni = ny * gridW + nx;
                            if (usePalette) {
                                sourceGrid[ni].r += errR * factor;
                                sourceGrid[ni].g += errG * factor;
                                sourceGrid[ni].b += errB * factor;
                            } else {
                                sourceGrid[ni] += errR * factor;
                            }
                        }
                    };
                    
                    if (isModulate) {
                        const modulation = Math.sin(y * 0.5 + x * 0.1) * 0.5 + 0.5;
                        const factor1 = 7/16 * (1 - modulation);
                        const factor2 = 7/16 * modulation;
                        setError(1, 0, factor1);
                        setError(0, 1, factor2);
                        setError(-1, 1, 3/16);
                        setError(1, 1, 5/16 - factor2);
                    } else {
                        setError(1, 0, 7 / 16);
                        setError(-1, 1, 3 / 16);
                        setError(0, 1, 5 / 16);
                        setError(1, 1, 1 / 16);
                    }
                }
            }
        } else if (ditheringPattern === 'Bayer') { 
            const bayerMatrix = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
            const bayerSize = 4;
            for (let y = 0; y < gridH; y++) {
                for (let x = 0; x < gridW; x++) {
                    const i = y * gridW + x;
                    const oldPixel = pixelGrid[i];
                    if (usePalette) {
                        let ditheredPixel = { ...oldPixel };
                        let adjustment = (bayerMatrix[y % bayerSize][x % bayerSize] / 16.0 - 0.5) * (255.0 / (colorPalette.length || 1));
                        ditheredPixel.r += adjustment;
                        ditheredPixel.g += adjustment;
                        ditheredPixel.b += adjustment;
                        pixelGrid[i] = findNearestColor(ditheredPixel, colorPalette);
                    } else {
                        let ditherThreshold = (bayerMatrix[y % bayerSize][x % bayerSize] / 16.0) * 255.0;
                        pixelGrid[i] = oldPixel > ditherThreshold ? 255 : 0;
                    }
                }
            }
        }
        
        for (let y = 0; y < gridH; y++) {
            for (let x = 0; x < gridW; x++) {
                const val = pixelGrid[y * gridW + x];
                const color = usePalette ? val : { r: val, g: val, b: val };
                for (let py = 0; py < pixelSize; py++) {
                    for (let px = 0; px < pixelSize; px++) {
                        const ix = x * pixelSize + px;
                        const iy = y * pixelSize + py;
                        if (ix < width && iy < height) {
                            const i = (iy * width + ix) * 4;
                            data[i] = color.r; data[i+1] = color.g; data[i+2] = color.b;
                        }
                    }
                }
            }
        }

        if (glow > 0) {
            let maxBrightness = 0;
            if (usePalette && colorPalette.length > 0) {
                for (const color of colorPalette) {
                    const brightness = (color.r*0.299 + color.g*0.587 + color.b*0.114);
                    if (brightness > maxBrightness) maxBrightness = brightness;
                }
            } else {
                maxBrightness = 255;
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
