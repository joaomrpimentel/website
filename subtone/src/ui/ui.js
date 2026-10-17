/**
 * src/ui/ui.js
 * * Gerencia os componentes da interface que não são diretamente
 * relacionados ao canvas ou aos controles de efeitos.
 * * Responsabilidades:
 * - Troca entre a tela inicial e o editor.
 * - Abas do painel de controles.
 * - Atalhos de teclado.
 */
import { EFFECT_IDS } from '../core/effectsManager.js';

/**
 * Mostra o editor ou volta para a tela inicial.
 * @param {boolean} editing - true para o editor, false para a tela inicial.
 */
export function showEditor(editing) {
    document.getElementById('landing').hidden = editing;
    document.getElementById('editor').hidden = !editing;
}

/**
 * Função principal que inicializa todos os componentes da UI.
 * É chamada uma vez no `app.js`.
 * @param {Object} app - A instância da aplicação, usada pelos atalhos.
 */
export function initUI(app) {
    initTabs();
    initShortcuts(app);
}

/**
 * Inicializa as abas do painel (Effect / Adjust / Export).
 */
function initTabs() {
    const tabs = [...document.querySelectorAll('.tab')];

    tabs.forEach(tab => tab.addEventListener('click', () => {
        tabs.forEach(t => {
            const selected = t === tab;
            t.setAttribute('aria-selected', selected);
            document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
        });
    }));
}

/**
 * Atalhos: 1-9 escolhem o efeito, U abre o upload, S exporta,
 * e segurar espaço mostra a imagem original.
 */
function initShortcuts(app) {
    const isTyping = (e) => e.target.closest('input[type="text"], select, textarea');

    window.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
        const editing = !document.getElementById('editor').hidden;
        const key = e.key.toLowerCase();

        if (key === 'u') {
            app.dom.fileInput.click();
        } else if (!editing) {
            return;
        } else if (key === 's') {
            e.preventDefault();
            app.exportImage();
        } else if (e.code === 'Space') {
            e.preventDefault();
            if (!e.repeat) app.showOriginal(true);
        } else if (/^[1-9]$/.test(key) && EFFECT_IDS[key - 1]) {
            app.setActiveEffect(EFFECT_IDS[key - 1]);
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') app.showOriginal(false);
    });
}
