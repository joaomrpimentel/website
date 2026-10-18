/**
 * src/app.js
 * * Ponto de entrada e orquestrador principal da aplicação.
 * * Responsabilidades:
 * - Inicializar todos os módulos (Estado, UI, Canvas, Efeitos, Tela inicial).
 * - Configurar os event listeners globais (upload, drag-drop, resize).
 * - Gerenciar a comunicação com o Web Worker para processamento de imagem.
 * - Coordenar as atualizações de estado e solicitar as re-renderizações.
 */
import { initUI, showEditor } from './ui/ui.js';
import { initLanding } from './ui/landing.js';
import { initI18n } from './ui/i18n.js';
import { getInitialState } from './core/state.js';
import { CanvasController } from './core/canvas.js';
import { EffectsManager, EFFECT_IDS } from './core/effectsManager.js';
import { Thumbnails } from './ui/thumbnails.js';

// Tempo antes de mostrar o indicador "processing", para não piscar em efeitos rápidos.
const BUSY_DELAY_MS = 200;
// Espera os sliders pararem antes de refazer as miniaturas.
const THUMBS_DEBOUNCE_MS = 400;

class ImageProcessorApp {
    /**
     * Construtor da classe principal da aplicação.
     * Inicializa o estado, os controladores e o worker.
     */
    constructor() {
        this.dom = this.queryDOMElements();
        this.state = getInitialState();
        this.exportFormat = 'png';
        this.originalImage = null;
        this.originalImageData = null;
        this.processedImageData = null;
        this.isShowingOriginal = false;

        this.worker = new Worker('src/worker.js', { type: 'module' });
        this.isWorkerBusy = false;
        this.pendingUpdate = false;
        this.busyTimer = null;

        this.canvasController = new CanvasController(this.dom.canvas);
        this.effectsManager = new EffectsManager(this.dom, this.setActiveEffect.bind(this));
        this.thumbnails = new Thumbnails();
        this.thumbsTimer = null;
        this.pendingThumbs = new Set();
        // Miniaturas que ficaram para trás depois de um ajuste geral; são refeitas
        // quando o efeito é selecionado, para nunca mexer nas outras enquanto o usuário edita.
        this.staleThumbs = new Set();

        this.init();
    }

    /**
     * Inicializa a aplicação, configurando a UI, os listeners e o efeito inicial.
     */
    init() {
        initI18n();
        initUI(this);
        initLanding();
        this.effectsManager.renderEffectSelector();
        this.setupEventListeners();
        this.setActiveEffect(this.state.activeEffect, true);
    }

    /**
     * Mapeia os elementos do DOM para um objeto para fácil acesso.
     * @returns {Object} Um objeto com referências aos elementos do DOM.
     */
    queryDOMElements() {
        return {
            canvas: document.getElementById('imageCanvas'),
            fileInput: document.getElementById('fileInput'),
            uploadButton: document.getElementById('uploadButton'),
            replaceButtons: [document.getElementById('replaceButton'), document.getElementById('replaceButtonPanel')],
            exportButtons: [document.getElementById('exportButtonStage'), document.getElementById('exportButtonPanel')],
            compareButton: document.getElementById('compareButton'),
            compareBadge: document.getElementById('compare-badge'),
            homeButton: document.getElementById('homeButton'),
            resetAdjustButton: document.getElementById('resetAdjustButton'),
            resetEffectButton: document.getElementById('resetEffectButton'),
            formatSelector: document.getElementById('format-selector'),
            effectsMenu: document.getElementById('effects-menu'),
            effectControlsContainer: document.getElementById('effect-controls'),
            activeEffectName: document.getElementById('active-effect-name'),
            activeEffectGroup: document.getElementById('active-effect-group'),
            controlsMain: document.getElementById('controls-main'),
            imageMeta: document.getElementById('image-meta'),
            busy: document.getElementById('busy'),
            dropVeil: document.getElementById('drop-veil'),
        };
    }

    /**
     * Configura todos os event listeners da aplicação.
     */
    setupEventListeners() {
        this.worker.onmessage = (e) => {
            this.processedImageData = e.data;
            if (!this.isShowingOriginal) this.renderProcessed();

            this.setBusy(false);
            if (this.pendingUpdate) {
                this.pendingUpdate = false;
                this.applyEffects();
            }
        };

        const openPicker = () => this.dom.fileInput.click();
        this.dom.uploadButton.addEventListener('click', openPicker);
        this.dom.replaceButtons.forEach(btn => btn.addEventListener('click', openPicker));
        this.dom.fileInput.addEventListener('change', (e) => {
            this.loadImage(e.target.files[0]);
            e.target.value = ''; // permite escolher o mesmo arquivo de novo
        });
        this.dom.exportButtons.forEach(btn => btn.addEventListener('click', () => this.exportImage()));
        this.dom.homeButton.addEventListener('click', () => showEditor(false));

        // Segurar o botão mostra a imagem original.
        const compare = this.dom.compareButton;
        compare.addEventListener('pointerdown', () => this.showOriginal(true));
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(type =>
            compare.addEventListener(type, () => this.showOriginal(false)));

        this.dom.resetAdjustButton.addEventListener('click', () => {
            this.state.preprocessing = getInitialState().preprocessing;
            this.updateAllControlValues();
            this.applyEffects();
            this.refreshActiveThumbnail();
        });

        // Volta só o efeito ativo pros valores iniciais; os outros guardam o que a pessoa mexeu.
        this.dom.resetEffectButton.addEventListener('click', () => this.resetActiveEffect());

        this.dom.formatSelector.addEventListener('click', (e) => {
            const btn = e.target.closest('.pattern-btn');
            if (!btn) return;
            this.exportFormat = btn.dataset.format;
            this.dom.formatSelector.querySelectorAll('.pattern-btn').forEach(b => b.classList.toggle('active', b === btn));
        });

        // Arrastar um arquivo para qualquer lugar da página, na tela inicial ou no editor.
        let dragDepth = 0;
        const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
        window.addEventListener('dragenter', (e) => {
            if (!hasFiles(e)) return;
            dragDepth++;
            this.dom.dropVeil.hidden = false;
        });
        window.addEventListener('dragleave', () => {
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) this.dom.dropVeil.hidden = true;
        });
        window.addEventListener('dragover', (e) => e.preventDefault());
        window.addEventListener('drop', (e) => {
            e.preventDefault();
            dragDepth = 0;
            this.dom.dropVeil.hidden = true;
            if (e.dataTransfer.files.length > 0) this.loadImage(e.dataTransfer.files[0]);
        });

        window.addEventListener('resize', () => {
            if (!this.originalImage || document.getElementById('editor').hidden) return;
            this.fitImage();
        });

        this.dom.controlsMain.addEventListener('input', (e) => {
            if (e.target.type === 'file') {
                return;
            }

            const { id, type, value, checked } = e.target;
            // Controles sem id (como os seletores de cor do dithering) são tratados pelo próprio efeito.
            if (!id) return;
            let finalValue;

            if (type === 'range') {
                finalValue = parseFloat(value);
            } else if (type === 'checkbox') {
                finalValue = checked;
            } else {
                finalValue = value;
            }

            const valueSpan = document.getElementById(`${id}Value`);
            if (valueSpan) valueSpan.textContent = value;

            const isPreprocessing = e.target.closest('.preprocessing-panel') !== null;
            this.updateState({ [id]: finalValue }, isPreprocessing);
        });
    }

    loadImage(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const image = new Image();
            image.onload = () => {
                this.originalImage = image;
                this.processedImageData = null;
                this.dom.imageMeta.textContent = `${image.naturalWidth}×${image.naturalHeight}`;
                this.dom.imageMeta.title = file.name;
                this.thumbnails.setImage(image);
                this.thumbnails.render(this.state, EFFECT_IDS);
                this.staleThumbs.clear();

                showEditor(true);
                // Espera o editor entrar no layout para medir o espaço do canvas.
                requestAnimationFrame(() => this.fitImage());
            };
            image.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    /**
     * Redimensiona o canvas para o espaço disponível e reprocessa a imagem.
     */
    fitImage() {
        this.canvasController.resize(this.originalImage);
        this.originalImageData = this.canvasController.drawImage(this.originalImage);
        this.applyEffects();
    }

    /**
     * Desenha o último resultado do worker, com o timestamp do Y2K Cam se estiver ativo.
     */
    renderProcessed() {
        if (!this.processedImageData) return;
        this.canvasController.update(this.processedImageData);

        if (this.state.activeEffect === 'y2k-cam' && this.state.effects['y2k-cam'].y2kTimestamp) {
            let timestampText = this.state.effects['y2k-cam'].y2kCustomTimestamp;

            // Se o texto personalizado estiver vazio, usa a data atual como fallback.
            if (!timestampText || !timestampText.trim()) {
                const now = new Date();
                const day = String(now.getDate()).padStart(2, '0');
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const year = String(now.getFullYear()).slice(-2);
                timestampText = `${day}.${month}.'${year}`;
            }
            this.canvasController.drawTimestamp(timestampText);
        }
    }

    /**
     * Alterna entre a imagem original e a processada (comparação antes/depois).
     * @param {boolean} show - true mostra a original.
     */
    showOriginal(show) {
        if (!this.originalImageData || show === this.isShowingOriginal) return;
        this.isShowingOriginal = show;
        this.dom.compareButton.classList.toggle('pressed', show);
        this.dom.compareBadge.hidden = !show;
        if (show) {
            this.canvasController.update(this.originalImageData);
        } else {
            this.renderProcessed();
        }
    }

    setBusy(busy) {
        this.isWorkerBusy = busy;
        clearTimeout(this.busyTimer);
        if (busy) {
            this.busyTimer = setTimeout(() => { this.dom.busy.hidden = false; }, BUSY_DELAY_MS);
        } else {
            this.dom.busy.hidden = true;
        }
    }

    updateState(newState, isPreprocessing = false) {
        if (isPreprocessing) {
            Object.assign(this.state.preprocessing, newState);
        } else {
            Object.assign(this.state.effects[this.state.activeEffect], newState);
        }
        this.applyEffects();
        if (isPreprocessing) {
            this.refreshActiveThumbnail();
        } else {
            this.scheduleThumbnails([this.state.activeEffect]);
        }
    }

    /**
     * Um ajuste geral muda a entrada de todos os efeitos, mas só a miniatura
     * do efeito ativo é refeita agora; as outras esperam ser selecionadas.
     */
    refreshActiveThumbnail() {
        EFFECT_IDS.forEach(id => this.staleThumbs.add(id));
        this.staleThumbs.delete(this.state.activeEffect);
        this.scheduleThumbnails([this.state.activeEffect]);
    }

    scheduleThumbnails(ids) {
        ids.forEach(id => this.pendingThumbs.add(id));
        clearTimeout(this.thumbsTimer);
        this.thumbsTimer = setTimeout(() => {
            this.thumbnails.render(this.state, [...this.pendingThumbs]);
            this.pendingThumbs.clear();
        }, THUMBS_DEBOUNCE_MS);
    }

    applyEffects() {
        if (!this.originalImageData) return;
        if (this.isWorkerBusy) {
            this.pendingUpdate = true;
            return;
        }
        this.setBusy(true);
        this.worker.postMessage({
            imageData: this.originalImageData,
            state: this.state,
        });
    }

    async setActiveEffect(effectId, isInitial = false) {
        if (!isInitial && effectId === this.state.activeEffect) return;
        this.state.activeEffect = effectId;

        document.querySelectorAll('.effect-item').forEach(item => {
            item.classList.toggle('active', item.dataset.effect === effectId);
        });

        await this.effectsManager.renderEffectControls(effectId, this);
        this.updateAllControlValues();
        this.applyEffects();

        if (this.staleThumbs.delete(effectId)) this.scheduleThumbnails([effectId]);
    }

    async resetActiveEffect() {
        const id = this.state.activeEffect;
        this.state.effects[id] = getInitialState().effects[id];
        // Os controles são refeitos porque alguns (como as cores do dithering) dependem do estado.
        await this.effectsManager.renderEffectControls(id, this);
        this.updateAllControlValues();
        this.applyEffects();
        this.scheduleThumbnails([id]);
    }

    updateAllControlValues() {
        const activeEffectState = this.state.effects[this.state.activeEffect];
        const currentState = { ...this.state.preprocessing, ...activeEffectState };

        Object.keys(currentState).forEach(key => {
            const control = document.getElementById(key);
            if (control) {
                if (control.type === 'file') return;

                if (control.type === 'checkbox') {
                    control.checked = currentState[key];
                } else { // Funciona para range e text
                    control.value = currentState[key];
                }
            }
            const valueSpan = document.getElementById(`${key}Value`);
            if (valueSpan) {
                valueSpan.textContent = currentState[key];
            }
        });

        const selectors = {
            'ascii': { selector: '#ascii-font-selector', prop: 'asciiFont', dataAttr: 'font' },
            'pixel-sort': { selector: '#sort-direction-selector', prop: 'sortDirection', dataAttr: 'direction' },
            'dithering': { selector: '#dither-color-mode', prop: 'colorMode', dataAttr: 'mode' },
            'crt': { selector: '#crt-pattern-selector', prop: 'crtPattern', dataAttr: 'pattern' }
        };
        const config = selectors[this.state.activeEffect];
        if (config) {
            document.querySelectorAll(`${config.selector} .pattern-btn`).forEach(btn => {
                btn.classList.toggle('active', btn.dataset[config.dataAttr] === activeEffectState[config.prop]);
            });
        }
    }

    exportImage() {
        if (!this.originalImage) return;
        // Garante que o arquivo sai com o efeito, mesmo se a comparação estiver ativa.
        this.showOriginal(false);
        this.canvasController.export(`subtone_${this.state.activeEffect}`, this.exportFormat);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new ImageProcessorApp();
});
