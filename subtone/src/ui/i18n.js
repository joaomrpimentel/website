/**
 * src/ui/i18n.js
 * * PT/EN da interface inteira.
 * * O inglês escrito no HTML e nos módulos de efeito é a fonte: este módulo
 * troca cada texto (e title, aria-label, placeholder, label de optgroup) pela
 * tradução quando o idioma é português, e guarda o original para poder voltar.
 * Um MutationObserver traduz o que o JS gerar depois (controles dos efeitos,
 * chips da landing, cores do dithering), então ninguém precisa chamar nada.
 * * O idioma fica em 'jotaverse.lang', a mesma chave do site e dos outros projetos.
 * Só é salvo quando a pessoa escolhe; sem escolha, segue o navegador.
 */

const KEY = 'jotaverse.lang';

// Inglês → português. Chave é o texto exato, sem espaços nas pontas.
const PT = {
    // landing
    'DITHER, HALFTONE & OTHER RETRO DAMAGE · RUNS IN YOUR BROWSER': 'DITHER, RETÍCULA E OUTROS ESTRAGOS RETRÔ · RODA NO SEU NAVEGADOR',
    'A JOTAVERSE PROJECT ↗': 'UM PROJETO DO JOTAVERSE ↗',
    'drop': 'solte',
    'pick': 'escolha',
    'tweak': 'ajuste',
    'export': 'exporte',
    'Choose an image': 'Escolher imagem',
    'or drop one anywhere on the page': 'ou solte uma em qualquer lugar da página',
    'fig.': 'fig.',
    '· live': '· ao vivo',
    '· move the mouse to light it': '· passe o mouse pra iluminar',
    'A bouncing checkered ball, rendered live through the selected effect': 'Uma bola xadrez quicando, renderizada ao vivo pelo efeito escolhido',
    'Preview an effect': 'Ver um efeito',
    'Language': 'Idioma',

    // editor
    'Canvas': 'Imagem',
    'original': 'original',
    'processing': 'processando',
    'Image tools': 'Ferramentas',
    'Hold to see the original (space)': 'Segure pra ver a original (espaço)',
    'Hold to compare with original': 'Segure pra comparar com a original',
    'New image (U)': 'Nova imagem (U)',
    'Open another image': 'Abrir outra imagem',
    'Export (S)': 'Exportar (S)',
    'Export image': 'Exportar imagem',
    'Effects': 'Efeitos',
    'Controls': 'Controles',
    'Back to start': 'Voltar pro início',
    'no image': 'sem imagem',
    'Effect': 'Efeito',
    'Adjust': 'Ajustes',
    'Export': 'Exportar',
    'applied before the effect': 'aplicados antes do efeito',
    'Contrast': 'Contraste',
    'Clarity': 'Claridade',
    'Gamma': 'Gama',
    'Grain': 'Granulação',
    'Reset adjustments': 'Redefinir ajustes',
    'Reset': 'Redefinir',
    'Reset this effect to its defaults': 'Volta este efeito ao padrão',
    'format': 'formato',
    'PNG keeps every dithered pixel exact. JPG and WebP are smaller but blur the pattern.':
        'PNG mantém cada pixel do dither intacto. JPG e WebP ficam menores, mas borram o padrão.',
    'New image': 'Nova imagem',
    'drop it': 'pode soltar',

    // efeitos e grupos
    'Dither': 'Dither',
    'Print': 'Impressão',
    'Paint': 'Pintura',
    'Signal': 'Sinal',
    'Glitch': 'Glitch',
    'Halftone': 'Retícula',
    'Oil': 'Óleo',
    'Watercolor': 'Aquarela',
    'Acrylic': 'Acrílica',

    // controles dos efeitos
    '--Effect Controls--': '--Controles--',
    'Brush size': 'Tamanho do pincel',
    'Color levels': 'Níveis de cor',
    'Saturation': 'Saturação',
    'Stroke length': 'Comprimento do traço',
    'Texture': 'Textura',
    'Color boost': 'Reforço de cor',
    'Use color': 'Usar cor',
    'Font style': 'Estilo da fonte',
    'Retro': 'Retrô',
    'Invert image': 'Inverter imagem',
    'Resolution': 'Resolução',
    'Convergence': 'Convergência',
    'Distortion': 'Distorção',
    'Dot pitch': 'Espaço entre pontos',
    'Dot scale': 'Tamanho do ponto',
    'Monitor': 'Monitor',
    'Pattern': 'Padrão',
    'Algorithm': 'Algoritmo',
    'Error diffusion': 'Difusão de erro',
    'Ordered': 'Ordenado',
    'Path': 'Caminho',
    'Cluster dot': 'Pontos agrupados',
    'Lines': 'Linhas',
    'Diagonal': 'Diagonal',
    'Noise': 'Ruído',
    'Modulated (Mod X)': 'Modulado (Mod X)',
    'Color mode': 'Modo de cor',
    'Levels per channel': 'Níveis por canal',
    'Threshold': 'Limiar',
    'Pixel size': 'Tamanho do pixel',
    'Glow': 'Brilho',
    'presets': 'presets',
    'Shadows': 'Sombras',
    'Midtones': 'Meios-tons',
    'Highlights': 'Realces',
    'Add a color': 'Adicionar uma cor',
    'Remove a color': 'Remover uma cor',
    'brightness is split in two and mapped to these colors.': 'os tons da imagem viram estas duas cores, do escuro pro claro.',
    'brightness is split in three and mapped to these colors.': 'os tons da imagem viram estas três cores, do escuro pro claro.',
    'each pixel takes the closest color in this list.': 'cada pixel pega a cor mais próxima desta lista.',
    'Black background': 'Fundo preto',
    'Grayscale': 'Tons de cinza',
    'Grid size': 'Tamanho da grade',
    'Canvas texture': 'Textura da tela',
    'Impasto': 'Empaste',
    'Color bleed': 'Vazamento de cor',
    'Fringing': 'Franjas de cor',
    'Phase shift': 'Defasagem',
    'Scanline gap': 'Espaço entre linhas',
    'Scanline intensity': 'Intensidade das linhas',
    'Signal noise': 'Ruído de sinal',
    'Angle': 'Ângulo',
    'Direction': 'Direção',
    'Horizontal': 'Horizontal',
    'Vertical': 'Vertical',
    'Sort threshold': 'Limiar da ordenação',
    'Edge darkening': 'Bordas escuras',
    'Granulation': 'Granulação',
    'Paper texture': 'Textura do papel',
    'Simplify': 'Simplificar',
    'Wash': 'Aguada',
    'Wobble': 'Tremor',
    'Aberration': 'Aberração',
    'Bloom': 'Bloom',
    'Show timestamp': 'Mostrar data',
    'Timestamp text': 'Texto da data',
    "DD.MM.'YY": "DD.MM.'AA",
    'Vignette': 'Vinheta',

    // nomes das paletas do dithering
    'Ink': 'Tinta',
    'Paper': 'Papel',
    'Amber': 'Âmbar',
    'Faded': 'Desbotado',
    'Moss': 'Musgo',
    'Night': 'Noite',
    'Rose': 'Rosa',
    'Rusty': 'Ferrugem',
    'Sepia': 'Sépia',
};

// Textos com número no meio.
const PT_PATTERNS = [
    [/^Color (\d+)$/, 'Cor $1'],
];

const ATTRS = ['title', 'aria-label', 'placeholder', 'label'];
// Elementos cujo texto não é interface (fontes, estilos, valores digitados).
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'KBD']);

let lang = 'en';
// Texto original de cada nó de texto, para voltar ao inglês.
const sources = new WeakMap();

const store = {
    get() { try { return localStorage.getItem(KEY); } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch { /* sem storage, só não lembra */ } },
};

function lookup(text) {
    if (lang !== 'pt') return undefined;
    if (text in PT) return PT[text];
    const hit = PT_PATTERNS.find(([re]) => re.test(text));
    return hit ? text.replace(hit[0], hit[1]) : undefined;
}

function translateText(node) {
    if (!sources.has(node)) sources.set(node, node.data);
    const source = sources.get(node);
    const trimmed = source.trim();
    if (!trimmed) return;
    const out = lookup(trimmed);
    const next = out === undefined ? source : source.replace(trimmed, out);
    if (node.data !== next) node.data = next;
}

function translateAttrs(el) {
    for (const attr of ATTRS) {
        if (!el.hasAttribute(attr)) continue;
        const keep = `data-src-${attr}`;
        if (!el.hasAttribute(keep)) el.setAttribute(keep, el.getAttribute(attr));
        const source = el.getAttribute(keep);
        const next = lookup(source.trim()) ?? source;
        if (el.getAttribute(attr) !== next) el.setAttribute(attr, next);
    }
}

function translate(root) {
    if (root.nodeType === Node.TEXT_NODE) {
        if (!SKIP.has(root.parentNode?.nodeName)) translateText(root);
        return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || SKIP.has(root.nodeName)) return;
    translateAttrs(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (SKIP.has(n.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) translateText(n);
        else translateAttrs(n);
    }
}

function apply(next, save) {
    lang = next === 'pt' ? 'pt' : 'en';
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
    if (save) store.set(lang);
    translate(document.body);
    document.querySelectorAll('[data-lang]').forEach(btn =>
        btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang)));
}

/**
 * Liga os botões PT/EN, aplica o idioma inicial e passa a traduzir
 * o que for adicionado à página depois.
 */
export function initI18n() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-lang]');
        if (btn) apply(btn.dataset.lang, true);
    });

    new MutationObserver((records) => {
        if (lang === 'en') return;
        for (const r of records) r.addedNodes.forEach(translate);
    }).observe(document.body, { childList: true, subtree: true });

    const saved = store.get();
    apply(saved || (navigator.language?.toLowerCase().startsWith('pt') ? 'pt' : 'en'), false);
}
