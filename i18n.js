/* =========================================================
   JOTAVERSE: portuguese / english.
   the html ships in portuguese; this file holds the english
   and swaps every [data-i18n] (innerHTML), [data-i18n-aria]
   (aria-label) and [data-i18n-alt] (alt). other scripts read
   strings through window.jv.t() and listen for 'jv:lang'.
   ========================================================= */

(() => {
    const EN = {
        role: 'DEVOPS TEAM LEAD @ LEDS<br>SERRA · ES · BRAZIL',
        now: 'Running a four-person DevOps team at LEDS, a lab at Ifes. Last thing I wrote: how 50 bytes of MTU left our CI hanging without a single error. <a href="https://blog.jotaverse.com.br/posts/50-bytes-ci-mudo/">Read it (PT) →</a>',
        nav: 'Sections',
        'm-home': 'Home', 'm-works': 'Works', 'm-me': 'About', 'm-links': 'Contact',
        elsewhere: 'elsewhere',
        'lang-label': 'language', 'lang-group': 'Site language',
        headline: 'Building things<br><em>from zero</em>,<br>for the fun of it.',
        egg: 'Jotagotchi, a pixel owl called Byte. Press Enter to pick it up.',
        'k-feed': 'Feed', 'k-play': 'Play', 'k-light': 'Lights',
        'qsl-season': 'QSL Nº 01 · this season', 'qsl-open': 'open it ↗',
        'works-sub': "what I make when nobody's asking.",
        'alt-kubeowl': 'KubeOwl cluster overview dashboard',
        'alt-modula': 'Modula start screen listing three synthesizers',
        'alt-subtone': 'Subtone editor with dithering, CRT and halftone effects',
        'alt-lume': 'A Lume profile with a grid of polaroid photos',
        'alt-snake': 'Snake Queue help dialog over the game board',
        'alt-blog': 'Jotaverse blog front page',
        'w-kubeowl': 'A web dashboard that shows the state of a Kubernetes cluster in real time.',
        'w-modula': 'Three synthesizers that run right in the browser.',
        'w-subtone': 'An image editor that applies dither, halftone and other retro effects.',
        'w-lume': 'An invite-only social network where I post some photos.',
        'w-snake': 'A to-do list where every task is a piece of a snake.',
        'w-blog': 'Where I write about DevOps, security and homelab.',
        'c-image': 'IMAGE TOOL', 'c-photos': 'SOCIAL NETWORK', 'c-exp': 'EXPERIMENT', 'c-writing': 'WRITING',
        'me-1': "I'm João. I lead the DevOps team at LEDS, a lab at Ifes in Serra, Espírito Santo. Most days that means CI/CD pipelines on GitHub Actions, Drone and Argo, Kubernetes clusters on AWS and on our own Proxmox boxes, and zero trust between the microservices.",
        'me-2': 'Before that I was a full-cycle dev at the same lab. I wrote the Langium extension behind Spark-LEds, which generates front and back end code from a small DSL, and an API gateway on Ocelot.',
        'me-3': 'Everything else on this site I built for fun, on my own time.',
        'f-studied': 'studied', 'f-studied-v': 'Information Systems at Ifes. Industrial automation at Cedtec before that.',
        'f-writing': 'writing', 'f-writing-v': 'Notes on DevOps and security, in Portuguese, <a href="https://blog.jotaverse.com.br">on the blog</a>.',
        'links-title': 'Say hi', 'links-sub': 'the email copies itself when you click it.',
        updated: 'LAST UPDATED', keys: 'TO', 'keys-2': 'SWITCH VIEWS',
        close: 'Close', 'close-l': 'esc · close',
        card: 'QSL card from PP1JØTA, filling itself in',
        to: 'Your name or callsign, written in the TO RADIO box',
        'qsl-hint': '✎ click <b>TO RADIO</b> and write your call or name',
        'qsl-live': 'QSL Nº 01 · live since 9 Oct 2026',
        'qsl-title': 'QSL card',
        'qsl-1': 'After a contact, radio amateurs send each other a postcard to confirm it happened. That postcard is a QSL card.',
        'qsl-2': 'The site keeps one card per season. This is the first. When the next one comes out, this one goes to the archive and stops changing.',
        'qsl-feat': 'on this card', 'qsl-yours': 'yours',
        'qsl-feat-v': '<i>Entoloma virescens</i>, a mushroom from the Atlantic forest here in Espírito Santo, blue from cap to stem.',
        'qsl-3': 'Write your callsign, or just your name, in TO RADIO. The date and time fill in by themselves.',
        'qsl-dl': 'download my card ↓',

        // strings used from javascript
        'js-copied': 'email copied ✓',
        'pet-pick': 'pick me up', 'pet-feed': 'feed', 'pet-play': 'play',
        'pet-off': 'lights off', 'pet-on': 'lights on', 'pet-flap': 'flap', 'pet-back': 'back', 'pet-zzz': 'zzz',
        'pet-picked': 'Picked up Byte. Left feeds, middle plays, right turns the light off. Escape puts it back.',
        'pet-ate': 'Byte ate a byte.', 'pet-full': 'Byte is full.',
        'pet-dark': 'Lights off. Byte is asleep.', 'pet-light': 'Lights on.',
        'pet-fly': 'Any button flaps. Fly between the towers.',
        'pet-score': 'Score {s}. Best {b}.',
    };
    const PT_JS = {
        'js-copied': 'email copiado ✓',
        'pet-pick': 'me pega', 'pet-feed': 'dar comida', 'pet-play': 'brincar',
        'pet-off': 'apagar a luz', 'pet-on': 'acender a luz', 'pet-flap': 'bater asas', 'pet-back': 'voltar', 'pet-zzz': 'zzz',
        'pet-picked': 'Você pegou o Byte. O botão da esquerda dá comida, o do meio brinca e o da direita apaga a luz. Esc devolve.',
        'pet-ate': 'O Byte comeu um byte.', 'pet-full': 'O Byte está de barriga cheia.',
        'pet-dark': 'Luz apagada. O Byte está dormindo.', 'pet-light': 'Luz acesa.',
        'pet-fly': 'Qualquer botão bate as asas. Voe entre as torres.',
        'pet-score': 'Placar {s}. Recorde {b}.',
    };

    // the portuguese comes from the page itself
    const PT = { ...PT_JS };
    const nodes = {
        html: [...document.querySelectorAll('[data-i18n]')],
        aria: [...document.querySelectorAll('[data-i18n-aria]')],
        alt: [...document.querySelectorAll('[data-i18n-alt]')],
    };
    nodes.html.forEach(el => { PT[el.dataset.i18n] ??= el.innerHTML; });
    nodes.aria.forEach(el => { PT['@' + el.dataset.i18nAria] ??= el.getAttribute('aria-label'); });
    nodes.alt.forEach(el => { PT['#' + el.dataset.i18nAlt] ??= el.alt; });

    const KEY = 'jotaverse.lang';
    let lang = 'pt';
    try { lang = localStorage.getItem(KEY) || (navigator.language?.toLowerCase().startsWith('pt') ? 'pt' : 'en'); } catch { /* fine */ }

    function t(key, vars = {}) {
        const s = (lang === 'en' ? EN[key] : PT[key]) ?? EN[key] ?? key;
        return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
    }

    function apply(next) {
        lang = next === 'en' ? 'en' : 'pt';
        document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
        nodes.html.forEach(el => { el.innerHTML = lang === 'en' ? EN[el.dataset.i18n] ?? PT[el.dataset.i18n] : PT[el.dataset.i18n]; });
        nodes.aria.forEach(el => {
            const k = el.dataset.i18nAria;
            el.setAttribute('aria-label', lang === 'en' ? EN[k] ?? PT['@' + k] : PT['@' + k] ?? EN[k]);
        });
        nodes.alt.forEach(el => { const k = el.dataset.i18nAlt; el.alt = lang === 'en' ? EN[k] : PT['#' + k]; });
        document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
        try { localStorage.setItem(KEY, lang); } catch { /* fine */ }
        document.dispatchEvent(new CustomEvent('jv:lang', { detail: lang }));
    }

    window.jv = { t, get lang() { return lang; }, set: apply };
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => apply(b.dataset.lang)));
    apply(lang);
})();
