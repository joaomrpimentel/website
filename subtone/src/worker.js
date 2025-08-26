/**
 * src/worker.js
 * * Este Web Worker é responsável por todo o processamento de imagem pesado.
 * Ele opera em uma thread separada para não bloquear a interface do usuário.
 * * Responsabilidades:
 * - Receber o `ImageData` original e o estado da aplicação da thread principal.
 * - Importar e aplicar a lógica de pré-processamento.
 * - Importar e aplicar a lógica do efeito ativo.
 * - Devolver o `ImageData` processado para a thread principal.
 */

// Importa todos os módulos de efeitos.
import { ditheringEffect } from './effects/dithering.js';
import { crtEffect } from './effects/crt.js';
import { halftoneEffect } from './effects/halftone.js';
import { palMEffect } from './effects/pal-m.js';
import { asciiEffect } from './effects/ascii.js';
import { pixelSortingEffect } from './effects/pixel-sort.js';
import { y2kCamEffect } from './effects/y2k-cam.js';

// Mapeia os efeitos importados para um objeto para fácil acesso.
const EFFECTS_LIBRARY = {
    dithering: ditheringEffect,
    crt: crtEffect,
    "pal-m": palMEffect,
    halftone: halftoneEffect,
    ascii: asciiEffect,
    "pixel-sort": pixelSortingEffect,
    "y2k-cam": y2kCamEffect,
};

/**
 * Helper de Box Blur para o efeito de clareza.
 * Uma implementação rápida que lida corretamente com as bordas.
 */
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
 * Aplica ajustes de pré-processamento à imagem.
 * @param {Uint8ClampedArray} pixels - O array de pixels do ImageData.
 * @param {number} width - A largura da imagem.
 * @param {number} height - A altura da imagem.
 * @param {Object} prepState - O objeto de estado contendo os valores de pré-processamento.
 */
function applyPreprocessing(pixels, width, height, prepState) {
    const { contrast, gamma, grain, clarity } = prepState;

    // Aplica o efeito de Clareza (Unsharp Mask)
    if (clarity > 0) {
        const blurred = new Uint8ClampedArray(pixels);
        boxBlur(blurred, width, height, 3); // Raio do blur de 3px
        for (let i = 0; i < pixels.length; i += 4) {
            const detailR = pixels[i] - blurred[i];
            const detailG = pixels[i+1] - blurred[i+1];
            const detailB = pixels[i+2] - blurred[i+2];

            pixels[i]   += detailR * clarity;
            pixels[i+1] += detailG * clarity;
            pixels[i+2] += detailB * clarity;
        }
    }

    for (let i = 0; i < pixels.length; i += 4) {
        // Aplica o ajuste de contraste.
        pixels[i]   = contrast * (pixels[i]   - 128) + 128;
        pixels[i+1] = contrast * (pixels[i+1] - 128) + 128;
        pixels[i+2] = contrast * (pixels[i+2] - 128) + 128;

        // Aplica a correção de gama.
        pixels[i]   = 255 * Math.pow(pixels[i] / 255, gamma);
        pixels[i+1] = 255 * Math.pow(pixels[i+1] / 255, gamma);
        pixels[i+2] = 255 * Math.pow(pixels[i+2] / 255, gamma);
        
        // Adiciona ruído (granulação).
        if (grain > 0) {
            const noise = (Math.random() - 0.5) * grain;
            pixels[i]   = pixels[i] + noise;
            pixels[i+1] = pixels[i+1] + noise;
            pixels[i+2] = pixels[i+2] + noise;
        }
    }
}

/**
 * Listener para mensagens recebidas da thread principal.
 */
self.onmessage = (e) => {
    const { imageData, state } = e.data;
    const { width, height } = imageData;

    const processedData = new Uint8ClampedArray(imageData.data);
    const newImageData = new ImageData(processedData, width, height);

    // 1. Aplica o pré-processamento.
    applyPreprocessing(newImageData.data, width, height, state.preprocessing);

    // 2. Aplica o efeito atualmente selecionado.
    const activeEffect = EFFECTS_LIBRARY[state.activeEffect];
    if (activeEffect && activeEffect.apply) {
        const effectState = state.effects[state.activeEffect];
        activeEffect.apply(newImageData, effectState);
    }

    // 3. Envia o resultado de volta para a thread principal.
    postMessage(newImageData, [newImageData.data.buffer]);
};
