/**
 * src/ui/thumbnails.js
 * * Gera as miniaturas da tira de efeitos: a imagem atual, reduzida,
 * passando por cada efeito com as configurações que o usuário já escolheu.
 * * Usa um worker próprio e processa uma miniatura por vez, para não
 * competir com a renderização principal.
 */

const THUMB_W = 208;
const THUMB_H = 156;

export class Thumbnails {
    constructor() {
        this.worker = new Worker('src/worker.js', { type: 'module' });
        this.source = null;
        this.queue = [];
        this.busy = false;
        this.generation = 0;
        this.inFlight = null;

        this.worker.onmessage = (e) => {
            const { id, generation } = this.inFlight;
            this.busy = false;
            if (generation === this.generation) {
                const canvas = document.querySelector(`canvas[data-thumb="${id}"]`);
                canvas?.getContext('2d').putImageData(e.data, 0, 0);
            }
            this.pump();
        };
    }

    /**
     * Recorta a imagem no centro (como object-fit: cover) no tamanho da miniatura.
     * @param {HTMLImageElement} image
     */
    setImage(image) {
        const canvas = new OffscreenCanvas(THUMB_W, THUMB_H);
        const ctx = canvas.getContext('2d');
        const scale = Math.max(THUMB_W / image.width, THUMB_H / image.height);
        const w = image.width * scale, h = image.height * scale;
        ctx.drawImage(image, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
        this.source = ctx.getImageData(0, 0, THUMB_W, THUMB_H);
        // Uma imagem nova invalida a fila e o que estiver sendo processado.
        this.generation++;
        this.queue = [];
    }

    /**
     * Agenda a renderização das miniaturas pedidas, somando à fila atual.
     * @param {Object} state - O estado completo da aplicação.
     * @param {string[]} ids - Os efeitos a renderizar.
     */
    render(state, ids) {
        if (!this.source) return;
        // Copia o estado agora, para a fila não ver mudanças feitas depois.
        this.state = structuredClone(state);
        this.queue = [...new Set([...this.queue, ...ids])];
        this.pump();
    }

    pump() {
        if (this.busy || this.queue.length === 0) return;
        const id = this.queue.shift();
        this.busy = true;
        this.inFlight = { id, generation: this.generation };
        this.worker.postMessage({ imageData: this.source, state: { ...this.state, activeEffect: id } });
    }
}
