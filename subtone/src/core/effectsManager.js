/**
 * src/core/effectsManager.js
 * * Gerencia a lógica relacionada aos efeitos.
 * * Responsabilidades:
 * - Manter uma lista dos efeitos disponíveis, agrupados por categoria.
 * - Renderizar os botões de seleção de efeito na UI.
 * - Carregar dinamicamente os controles HTML do efeito ativo.
 * - Chamar a função de inicialização de um efeito, se existir.
 *
 * Para adicionar um efeito: crie o módulo em src/effects/, registre-o no
 * worker.js e no state.js, e acrescente uma entrada aqui. A ordem desta
 * lista define a ordem na UI e os atalhos de teclado (1-9).
 */

export const EFFECT_GROUPS = {
    dither: 'Dither',
    print: 'Print',
    paint: 'Paint',
    signal: 'Signal',
    glitch: 'Glitch',
};

export const EFFECTS_LIBRARY = {
    dithering: { name: 'Dithering', group: 'dither' },
    halftone: { name: 'Halftone', group: 'print' },
    ascii: { name: 'ASCII', group: 'print' },
    oil: { name: 'Oil', group: 'paint' },
    watercolor: { name: 'Watercolor', group: 'paint' },
    acrylic: { name: 'Acrylic', group: 'paint' },
    crt: { name: 'CRT', group: 'signal' },
    "pal-m": { name: 'PAL-M', group: 'signal' },
    'y2k-cam': { name: 'Y2K Cam', group: 'signal' },
    "pixel-sort": { name: 'Pixel Sort', group: 'glitch' },
};

export const EFFECT_IDS = Object.keys(EFFECTS_LIBRARY);

export class EffectsManager {
    constructor(domElements, onEffectChange) {
        this.dom = domElements;
        this.onEffectChange = onEffectChange;
        this.effectsLibrary = EFFECTS_LIBRARY;
    }

    renderEffectSelector() {
        this.dom.effectsMenu.innerHTML = '';

        for (const [groupId, groupName] of Object.entries(EFFECT_GROUPS)) {
            const ids = EFFECT_IDS.filter(id => this.effectsLibrary[id].group === groupId);
            if (ids.length === 0) continue;

            const group = document.createElement('div');
            group.className = 'effect-group';
            group.innerHTML = `<p class="label">${groupName}</p><div class="effect-group-items"></div>`;
            const items = group.querySelector('.effect-group-items');

            for (const id of ids) {
                const index = EFFECT_IDS.indexOf(id);
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'effect-item';
                item.dataset.effect = id;
                item.innerHTML = `
                    <span class="effect-thumb-wrap">
                        <canvas class="effect-thumb" data-thumb="${id}" width="208" height="156"></canvas>
                        ${index < 9 ? `<kbd>${index + 1}</kbd>` : ''}
                    </span>
                    <span class="effect-name">${this.effectsLibrary[id].name}</span>`;
                item.addEventListener('click', () => this.onEffectChange(id));
                items.appendChild(item);
            }
            this.dom.effectsMenu.appendChild(group);
        }
    }

    async renderEffectControls(effectId, app) {
        const info = this.effectsLibrary[effectId];
        this.dom.activeEffectName.textContent = info.name;
        this.dom.activeEffectGroup.textContent = EFFECT_GROUPS[info.group];
        try {
            const effectModule = await import(`../effects/${effectId}.js`);
            // Um módulo pode exportar outras coisas além do efeito (presets, constantes),
            // então procura o export que tem os controles.
            const effect = Object.values(effectModule).find(e => typeof e?.getControlsHTML === 'function');

            if (!effect || !effect.getControlsHTML) {
                this.dom.effectControlsContainer.innerHTML = '';
                return;
            }

            this.dom.effectControlsContainer.innerHTML = effect.getControlsHTML();

            if (effect.init) {
                effect.init(app);
            }

        } catch (error) {
            console.error(`Failed to load controls for effect ${effectId}:`, error);
            this.dom.effectControlsContainer.innerHTML = '';
        }
    }
}
