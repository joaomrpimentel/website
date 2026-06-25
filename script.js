/* =========================================================
   JOTAVERSE — minimal vanilla JS
   ascii fit-to-width · active-section nav · footer year
   ========================================================= */

/* fit the wide ascii masthead to its container, set wrapper height */
function fitAscii() {
    const wrap = document.querySelector('.masthead');
    const pre = document.getElementById('ascii');
    if (!wrap || !pre) return;

    pre.style.setProperty('--ascii-scale', 1);          // measure at natural size
    const natW = pre.scrollWidth;
    const natH = pre.scrollHeight;
    if (!natW) return;

    const scale = Math.min(wrap.clientWidth / natW, 1.4);
    pre.style.setProperty('--ascii-scale', scale.toFixed(4));
    wrap.style.height = Math.ceil(natH * scale) + 'px';
}

/* highlight nav link of the section in view */
function initActiveNav() {
    const links = [...document.querySelectorAll('.nav-links a[href^="#"]')];
    const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            const a = map.get(e.target.id);
            if (a) a.style.color = e.isIntersecting ? 'var(--red)' : '';
        });
    }, { rootMargin: '-45% 0px -45% 0px' });
    document.querySelectorAll('section[id]').forEach(s => obs.observe(s));
}

window.addEventListener('DOMContentLoaded', () => {
    fitAscii();
    initActiveNav();
    const y = document.getElementById('year');
    if (y) y.textContent = new Date().getFullYear();
});

window.addEventListener('resize', fitAscii);
window.addEventListener('load', fitAscii);   // refit once fonts settle
