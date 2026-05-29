import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { startMatrixEffect } from './matrix.js';

/* blob world size (shared between renderer + node-radius math) */
const BLOB_WORLD_DESKTOP = 1.85;
const BLOB_WORLD_MOBILE = 1.05;
const blobWorld = () => (innerWidth < 768 ? BLOB_WORLD_MOBILE : BLOB_WORLD_DESKTOP);
/* morph amount — higher on mobile so it stays organic, not a smooth ball */
const baseNoise = () => (innerWidth < 768 ? 0.5 : 0.32);
/* blob radius in screen px, from camera z=8 / fov 50 */
function blobScreenRadius() {
    const halfH = Math.tan((25 * Math.PI) / 180) * 8;
    return (blobWorld() * innerHeight) / (2 * halfH);
}

/* =========================================================
   SOUND ENGINE — WebAudio, generated (no assets)
   muted by default, toggled by user gesture
   ========================================================= */
const Sound = {
    ctx: null,
    enabled: false,
    ambient: null,

    ensure() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return false;
            this.ctx = new AC();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
    },

    tone({ freq = 880, type = 'sine', dur = 0.08, gain = 0.07, slideTo = null }) {
        if (!this.enabled || !this.ensure()) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g).connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
    },

    hover() { this.tone({ freq: 660, type: 'triangle', dur: 0.06, gain: 0.05 }); },
    select() { this.tone({ freq: 520, type: 'sine', dur: 0.18, gain: 0.07, slideTo: 1040 }); },
    warp() { this.tone({ freq: 880, type: 'sawtooth', dur: 0.45, gain: 0.06, slideTo: 90 }); },
    error() { this.tone({ freq: 180, type: 'square', dur: 0.22, gain: 0.06, slideTo: 70 }); },

    startAmbient() {
        if (!this.enabled || !this.ensure() || this.ambient) return;
        const t = this.ctx.currentTime;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.022, t + 2);
        const a = this.ctx.createOscillator();
        const b = this.ctx.createOscillator();
        a.type = b.type = 'sine';
        a.frequency.value = 55;
        b.frequency.value = 55.5; // slight detune -> slow beat
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.value = 0.07;
        lfoGain.gain.value = 0.01;
        lfo.connect(lfoGain).connect(g.gain);
        a.connect(g); b.connect(g);
        g.connect(this.ctx.destination);
        a.start(t); b.start(t); lfo.start(t);
        this.ambient = { a, b, lfo, g };
    },

    stopAmbient() {
        if (!this.ambient) return;
        const { a, b, lfo, g } = this.ambient;
        const t = this.ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        [a, b, lfo].forEach(o => o.stop(t + 0.7));
        this.ambient = null;
    },

    toggle() {
        this.enabled = !this.enabled;
        localStorage.setItem('jv-sound', this.enabled ? 'on' : 'off');
        if (this.enabled) { this.ensure(); this.select(); this.startAmbient(); }
        else this.stopAmbient();
        return this.enabled;
    }
};

function initSoundToggle() {
    const btn = document.getElementById('sound-toggle');
    if (!btn) return;
    const stored = localStorage.getItem('jv-sound') === 'on';
    const paint = () => {
        btn.classList.toggle('on', Sound.enabled);
        btn.textContent = Sound.enabled ? '♪' : '×';
        btn.setAttribute('aria-label', Sound.enabled ? 'Mute sound' : 'Enable sound');
    };
    paint();
    btn.addEventListener('click', () => { Sound.toggle(); paint(); });
    // if user previously enabled, bootstrap on first gesture (autoplay policy)
    if (stored) {
        const boot = () => {
            Sound.enabled = true;
            Sound.ensure();
            Sound.startAmbient();
            paint();
            window.removeEventListener('pointerdown', boot);
            window.removeEventListener('keydown', boot);
        };
        window.addEventListener('pointerdown', boot, { once: true });
        window.addEventListener('keydown', boot, { once: true });
    }
}

/* =========================================================
   STARFIELD — drifting parallax dust (all pages)
   ========================================================= */
let starCanvas, starCtx, stars = [], starRAF;
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

function initStarfield() {
    starCanvas = document.getElementById('starfield-canvas');
    if (!starCanvas) return;
    starCtx = starCanvas.getContext('2d');
    sizeStarfield();
    const count = window.innerWidth < 768 ? 70 : 130;
    stars = Array.from({ length: count }, () => ({
        x: Math.random(), y: Math.random(),
        z: Math.random() * 0.9 + 0.1,            // depth -> parallax + size
        tw: Math.random() * Math.PI * 2,          // twinkle phase
        sp: Math.random() * 0.4 + 0.1             // twinkle speed
    }));
    drawStars(0);
}

function sizeStarfield() {
    if (!starCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    starCanvas.width = window.innerWidth * dpr;
    starCanvas.height = window.innerHeight * dpr;
    starCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawStars(t) {
    starRAF = requestAnimationFrame(drawStars);
    if (!starCtx) return;
    const w = window.innerWidth, h = window.innerHeight;
    starCtx.clearRect(0, 0, w, h);
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    for (const s of stars) {
        const px = pointer.x * s.z * 38;
        const py = pointer.y * s.z * 38;
        const driftY = ((t * 0.004 * s.z) % h);
        let x = s.x * w + px;
        let y = (s.y * h + driftY) % h + py;
        const size = s.z * 1.6 + 0.3;
        const alpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.001 * s.sp + s.tw)) * s.z;
        starCtx.fillStyle = `rgba(0, 255, 65, ${alpha.toFixed(3)})`;
        starCtx.fillRect(x, y, size, size);
    }
}

/* =========================================================
   BLOB CORE — central morphing organism (hub only)
   ========================================================= */
let blob, blobScene, blobCamera, blobRenderer, blobRAF;
const clock = new THREE.Clock();
const simplex = new SimplexNoise();
const baseColor = new THREE.Color(0x00ff41);
const errColor = new THREE.Color(0xff4141);

function animateBlobColor(c, d = 0.3) {
    if (!blob) return;
    gsap.to(blob.material.uniforms.uColor.value, { r: c.r, g: c.g, b: c.b, duration: d });
}
function animateNoise(v, d = 0.3) {
    if (!blob) return;
    gsap.to(blob.material.uniforms.uNoiseIntensity, { value: v, duration: d });
}

function initBlob() {
    const canvas = document.querySelector('#bg-canvas');
    if (!canvas) return;
    blobScene = new THREE.Scene();
    blobCamera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1000);
    blobCamera.position.set(0, 0, 8);
    blobRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    blobRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    blobRenderer.setSize(innerWidth, innerHeight);

    const isMobile = innerWidth < 768;
    const geo = new THREE.IcosahedronGeometry(blobWorld(), isMobile ? 40 : 56);
    geo.userData.original = geo.attributes.position.clone();
    const mat = new THREE.ShaderMaterial({
        vertexShader: `
            varying vec3 vNormal; varying vec3 vViewPosition;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vViewPosition = -mv.xyz;
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: `
            uniform vec3 uColor; varying vec3 vNormal; varying vec3 vViewPosition;
            float fres(vec3 n, vec3 v) { return pow(1.0 - dot(n, v), 3.5); }
            void main() {
                float g = smoothstep(-0.8, 1.0, vNormal.y);
                vec3 deep = vec3(0.0, 0.18, 0.09);
                vec3 grad = mix(deep, uColor, g);
                vec3 v = normalize(vViewPosition);
                vec3 f = uColor * fres(vNormal, v) * 1.6;
                gl_FragColor = vec4(grad + f, 1.0);
            }`,
        uniforms: { uColor: { value: baseColor.clone() }, uNoiseIntensity: { value: baseNoise() } }
    });
    blob = new THREE.Mesh(geo, mat);
    blobScene.add(blob);
}

function animateBlob() {
    blobRAF = requestAnimationFrame(animateBlob);
    const t = clock.getElapsedTime();
    if (blob && blob.geometry.userData.original) {
        const pos = blob.geometry.attributes.position;
        const orig = blob.geometry.userData.original;
        const ni = blob.material.uniforms.uNoiseIntensity.value;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(orig, i);
            const n = simplex.noise3d(v.x * 0.4 + t * 0.1, v.y * 0.4 + t * 0.1, v.z * 0.4 + t * 0.1);
            const len = 1 + (n * ni) / v.length();
            pos.setXYZ(i, v.x * len, v.y * len, v.z * len);
        }
        pos.needsUpdate = true;
        blob.geometry.computeVertexNormals();
        blob.rotation.y = t * 0.05;
    }
    if (blobRenderer) blobRenderer.render(blobScene, blobCamera);
}

function cleanupBlob() {
    if (blob) { blob.geometry.dispose(); blob.material.dispose(); }
    if (blobRenderer) blobRenderer.dispose();
    cancelAnimationFrame(blobRAF);
}

/* =========================================================
   CONSTELLATION NAV (hub only)
   ========================================================= */
const NAV = [
    { glyph: '◬', label: 'About',    sub: '/about',    href: 'about.html' },
    { glyph: '⎔', label: 'Projects', sub: '/projects', href: 'projects.html' },
    { glyph: '◈', label: 'Contact',  sub: '/contact',  href: 'contact.html' },
    { glyph: '⌗', label: 'GitHub',   sub: 'ext',  href: 'https://github.com/joaomrpimentel', ext: true },
    { glyph: '✦', label: 'Lume',     sub: 'ext',  href: 'https://lume.jotaverse.com.br/u/jota', ext: true }
];
let nodeEls = [], lineEls = [], constRAF;

function initConstellation() {
    const constellation = document.querySelector('.constellation');
    const svg = document.getElementById('constellation-lines');
    if (!constellation || !svg) return;

    NAV.forEach((n, i) => {
        const a = document.createElement('a');
        a.className = 'nav-node';
        a.href = n.href;
        if (n.ext) a.target = '_blank';
        a.innerHTML = `
            <span class="node-glyph">${n.glyph}</span>
            <span class="node-label">${n.label}${n.sub !== 'ext' ? `<span class="node-sub"> ${n.sub}</span>` : ''}</span>`;
        a.dataset.index = i;
        // organic params
        a.dataset.phase = (Math.random() * Math.PI * 2).toFixed(3);
        a.dataset.speed = (0.3 + Math.random() * 0.4).toFixed(3);
        a.dataset.amp = (6 + Math.random() * 8).toFixed(2);
        constellation.appendChild(a);
        nodeEls.push(a);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'link-line');
        svg.appendChild(line);
        lineEls.push(line);

        a.addEventListener('mouseenter', () => { line.classList.add('active'); Sound.hover(); animateNoise(baseNoise() + 0.12); });
        a.addEventListener('mouseleave', () => { line.classList.remove('active'); animateNoise(baseNoise()); });
        a.addEventListener('click', (e) => {
            Sound.select();
            if (n.ext) return; // let it open in new tab
            e.preventDefault();
            warpTransition(n.href);
        });
    });

    sizeLines();
    animateConstellation(0);
}

function sizeLines() {
    const svg = document.getElementById('constellation-lines');
    if (svg) { svg.setAttribute('width', innerWidth); svg.setAttribute('height', innerHeight); }
}

function nodeRadius() {
    const mobile = innerWidth < 768;
    // keep nodes clear of the blob, but on-screen
    const maxR = Math.min(innerWidth, innerHeight) / 2 - (mobile ? 52 : 80);
    const want = blobScreenRadius() + (mobile ? 64 : 90);
    const floor = Math.min(innerWidth, innerHeight) * 0.36;
    return Math.min(Math.max(want, floor), maxR);
}

function animateConstellation(t) {
    constRAF = requestAnimationFrame(animateConstellation);
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const R = nodeRadius();
    const n = nodeEls.length;
    nodeEls.forEach((el, i) => {
        const baseAng = (-Math.PI / 2) + (i / n) * Math.PI * 2;
        const phase = +el.dataset.phase, speed = +el.dataset.speed, amp = +el.dataset.amp;
        const fx = Math.sin(t * 0.001 * speed + phase) * amp;
        const fy = Math.cos(t * 0.001 * speed + phase) * amp;
        const ox = Math.cos(baseAng) * R + fx;
        const oy = Math.sin(baseAng) * R + fy;
        el.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
        const line = lineEls[i];
        line.setAttribute('x1', cx); line.setAttribute('y1', cy);
        line.setAttribute('x2', cx + ox); line.setAttribute('y2', cy + oy);
    });
}

/* parallax stage follows pointer */
function initParallax() {
    const stage = document.querySelector('.stage');
    window.addEventListener('pointermove', (e) => {
        pointer.tx = (e.clientX / innerWidth - 0.5) * 2;
        pointer.ty = (e.clientY / innerHeight - 0.5) * 2;
        if (stage) stage.style.transform = `translate(${pointer.tx * -14}px, ${pointer.ty * -14}px)`;
    });
}

/* =========================================================
   CONSOLE (hidden terminal, hub only)
   ========================================================= */
function initConsole() {
    const wrap = document.querySelector('.console-wrap');
    const input = document.getElementById('command-input');
    const sug = document.getElementById('command-suggestion-inline');
    if (!wrap || !input || !sug) return;

    const cmds = [
        { c: '/about', h: 'about.html' }, { c: '/a', h: 'about.html' },
        { c: '/projects', h: 'projects.html' }, { c: '/p', h: 'projects.html' },
        { c: '/contact', h: 'contact.html' }, { c: '/c', h: 'contact.html' },
        { c: '/matrix', h: '#' }
    ];
    const map = Object.fromEntries(cmds.map(o => [o.c, o.h]));

    // press "/" anywhere to jump into the console
    window.addEventListener('keydown', (e) => {
        if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
        if (document.activeElement === input) return;
        e.preventDefault();
        input.focus();
        if (!input.value) { input.value = '/'; input.dispatchEvent(new Event('input')); }
    });

    input.addEventListener('input', () => {
        const v = input.value.trim().toLowerCase();
        sug.textContent = '';
        if (v.length > 1 && v.startsWith('/')) {
            const m = cmds.find(o => o.c.startsWith(v));
            if (m && m.c !== v) sug.textContent = m.c;
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && sug.textContent) {
            e.preventDefault(); input.value = sug.textContent; sug.textContent = ''; return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            const v = input.value.trim().toLowerCase();
            if (v === '/matrix') { Sound.select(); startMatrixEffect(); input.value = ''; sug.textContent = ''; return; }
            if (map[v]) { Sound.select(); warpTransition(map[v]); return; }
            // error feedback
            Sound.error();
            wrap.classList.add('error', 'shake');
            animateBlobColor(errColor); animateNoise(0.7, 0.1);
            setTimeout(() => {
                wrap.classList.remove('error', 'shake');
                animateBlobColor(baseColor); animateNoise(baseNoise());
            }, 500);
            return;
        }
        if (['ArrowLeft', 'ArrowRight', 'Backspace'].includes(e.key)) {
            setTimeout(() => input.dispatchEvent(new Event('input')), 0);
        }
    });
}

/* =========================================================
   TRANSITIONS
   ========================================================= */
function warpTransition(url) {
    Sound.warp();
    const wrapper = document.getElementById('page-wrapper');
    const overlay = document.getElementById('page-transition-overlay');
    gsap.to(wrapper, { opacity: 0, scale: 1.06, duration: 0.4, ease: 'power2.in' });
    gsap.to(overlay, { opacity: 1, duration: 0.4, onComplete: () => { cleanupBlob(); window.location.href = url; } });
}

function initTransitions() {
    const wrapper = document.getElementById('page-wrapper');
    const overlay = document.getElementById('page-transition-overlay');
    gsap.set(wrapper, { transformOrigin: '50% 50%' });
    gsap.to(wrapper, { opacity: 1, duration: 0.45, delay: 0.1 });
    gsap.to(overlay, { opacity: 0, duration: 0.45 });

    // intercept internal links not already handled (e.g. back button, header)
    document.querySelectorAll('a:not([target="_blank"]):not([href^="#"])').forEach(link => {
        if (link.classList.contains('nav-node')) return; // handled in constellation
        link.addEventListener('click', (e) => { e.preventDefault(); warpTransition(link.href); });
    });
}

/* =========================================================
   LIFECYCLE
   ========================================================= */
function onResize() {
    sizeStarfield();
    sizeLines();
    if (blobCamera && blobRenderer) {
        blobCamera.aspect = innerWidth / innerHeight;
        blobCamera.updateProjectionMatrix();
        blobRenderer.setSize(innerWidth, innerHeight);
    }
}

function onVisibility() {
    if (document.hidden) {
        cancelAnimationFrame(blobRAF);
        cancelAnimationFrame(starRAF);
        cancelAnimationFrame(constRAF);
    } else {
        if (blob) animateBlob();
        if (starCtx) drawStars(performance.now());
        if (nodeEls.length) animateConstellation(performance.now());
    }
}

function boot() {
    const isHub = document.body.classList.contains('page-hub');
    if ('ontouchstart' in window) document.body.classList.add('touch');

    initStarfield();
    initSoundToggle();

    if (isHub) {
        initBlob(); animateBlob();
        initConstellation();
        initParallax();
        initConsole();
        const input = document.getElementById('command-input');
        if (input) input.focus();
    }

    initTransitions();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility, false);
}

document.addEventListener('DOMContentLoaded', boot);

// bfcache restore
window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    const overlay = document.getElementById('page-transition-overlay');
    const wrapper = document.getElementById('page-wrapper');
    if (overlay) overlay.style.opacity = 0;
    if (wrapper) { wrapper.style.opacity = 1; gsap.set(wrapper, { scale: 1 }); }
    if (document.body.classList.contains('page-hub')) { cleanupBlob(); initBlob(); animateBlob(); }
});
