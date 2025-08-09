import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { startMatrixEffect } from './matrix.js';

let blob, blobScene, blobCamera, blobRenderer;
let animationFrameId;
const originalBlobColor = new THREE.Color(0x00ff41);
const errorBlobColor = new THREE.Color(0xff4141);

function animateBlobColor(targetColor, duration = 0.3) {
    if (!blob) return;
    gsap.to(blob.material.uniforms.uColor.value, {
        r: targetColor.r,
        g: targetColor.g,
        b: targetColor.b,
        duration: duration
    });
}

function animateNoise(targetIntensity, duration = 0.3) {
    if (!blob) return;
    gsap.to(blob.material.uniforms.uNoiseIntensity, {
        value: targetIntensity,
        duration: duration
    });
}

function initThreeBlob() {
    const canvas = document.querySelector('#bg-canvas');
    if (!canvas) return; 
    
    blobScene = new THREE.Scene();
    blobCamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    blobCamera.position.set(0, 0, 8);
    blobRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    
    blobRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
    blobRenderer.setSize(window.innerWidth, window.innerHeight);

    const isMobile = window.innerWidth < 768;
    const blobSize = isMobile ? 2.2 : 3;
    const blobDetail = isMobile ? 48 : 64; 
    const blobGeometry = new THREE.IcosahedronGeometry(blobSize, blobDetail);
    blobGeometry.userData.originalPositions = blobGeometry.attributes.position.clone();
    const blobMaterial = new THREE.ShaderMaterial({
        vertexShader: `
            uniform float uNoiseIntensity;
            varying vec3 vNormal; 
            varying vec3 vViewPosition;
            void main() { 
                vNormal = normalize(normalMatrix * normal); 
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                vViewPosition = -mvPosition.xyz;
                gl_Position = projectionMatrix * mvPosition; 
            }`,
        fragmentShader: `
            uniform vec3 uColor; 
            varying vec3 vNormal; 
            varying vec3 vViewPosition;
            float fresnel(vec3 normal, vec3 viewDir) { return pow(1.0 - dot(normal, viewDir), 3.5); }
            void main() { 
                float gradientFactor = smoothstep(-0.8, 1.0, vNormal.y); 
                vec3 deepGreen = vec3(0.0, 0.2, 0.1);
                vec3 gradientColor = mix(deepGreen, uColor, gradientFactor); 
                vec3 viewDir = normalize(vViewPosition);
                float fresnelFactor = fresnel(vNormal, viewDir);
                vec3 fresnelColor = uColor * fresnelFactor * 1.5;
                vec3 finalColor = gradientColor + fresnelColor;
                gl_FragColor = vec4(finalColor, 1.0); 
            }`,
        uniforms: {
            uTime: { value: 0.0 },
            uColor: { value: originalBlobColor.clone() },
            uNoiseIntensity: { value: 0.35 }
        }
    });
    blob = new THREE.Mesh(blobGeometry, blobMaterial);
    blobScene.add(blob); 
}

const clock = new THREE.Clock();
const simplex = new SimplexNoise();
function animate() {
    animationFrameId = requestAnimationFrame(animate); 
    const elapsedTime = clock.getElapsedTime();
    
    if (blob && blob.geometry.userData.originalPositions) {
         const positions = blob.geometry.attributes.position;
         const originalPositions = blob.geometry.userData.originalPositions;
         const noiseIntensity = blob.material.uniforms.uNoiseIntensity.value;

         for (let i = 0; i < positions.count; i++) {
            const p = new THREE.Vector3().fromBufferAttribute(originalPositions, i);
            const noise = simplex.noise3d(p.x * 0.4 + elapsedTime * 0.1, p.y * 0.4 + elapsedTime * 0.1, p.z * 0.4 + elapsedTime * 0.1);
            p.add(p.clone().normalize().multiplyScalar(noise * noiseIntensity));
            positions.setXYZ(i, p.x, p.y, p.z);
         }
         positions.needsUpdate = true;
         blob.geometry.computeVertexNormals();
    }
    if(blobRenderer) blobRenderer.render(blobScene, blobCamera);
}

function cleanupThreeScene() {
    if (blob) {
        blob.geometry.dispose();
        blob.material.dispose();
    }
    if (blobRenderer) {
        blobRenderer.dispose();
    }
    cancelAnimationFrame(animationFrameId);
}

function pageTransition(url) {
    const pageWrapper = document.getElementById('page-wrapper');
    gsap.to(pageWrapper, { opacity: 0, duration: 0.3, onComplete: () => {
        cleanupThreeScene();
        window.location.href = url;
    }});
}

function initPageTransitions() {
    const pageWrapper = document.getElementById('page-wrapper');
    const overlay = document.getElementById('page-transition-overlay');
    gsap.to(pageWrapper, { opacity: 1, duration: 0.3, delay: 0.1 });
    gsap.to(overlay, { opacity: 0, duration: 0.3 });
    
    const links = document.querySelectorAll('a:not([target="_blank"]):not([href^="#"])');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            pageTransition(link.href);
        });
    });
}

function setupPageLogic() {
    const hubElement = document.querySelector('.hub');
    const commandInput = document.getElementById('command-input');
    const suggestionElement = document.getElementById('command-suggestion-inline');

    if (hubElement && commandInput && suggestionElement) {
        const commands = [
            { command: '/about', href: 'about.html' },
            { command: '/projects', href: 'projects.html' },
            { command: '/contact', href: 'contact.html' },
            { command: '/a', href: 'about.html' },
            { command: '/p', href: 'projects.html' },
            { command: '/c', href: 'contact.html' },
            { command: '/matrix', href: '#' }
        ];
        const commandMap = Object.fromEntries(commands.map(c => [c.command, c.href]));

        commandInput.focus();
        commandInput.addEventListener('input', () => {
            const value = commandInput.value.trim().toLowerCase();
            suggestionElement.textContent = '';

            if (value.length > 1 && value.startsWith('/')) {
                const match = commands.find(c => c.command.startsWith(value));
                if (match && match.command !== value) {
                    suggestionElement.textContent = match.command;
                }
            }
        });

        commandInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const value = commandInput.value.trim().toLowerCase();
                
                if (value === '/matrix') {
                    startMatrixEffect();
                    commandInput.value = '';
                    return;
                }

                if (commandMap[value]) {
                    pageTransition(commandMap[value]);
                } else {
                    hubElement.classList.add('hub-error', 'hub-shake');
                    animateBlobColor(errorBlobColor);
                    animateNoise(0.7, 0.1); // Agita o blob rapidamente
                    setTimeout(() => {
                        hubElement.classList.remove('hub-error', 'hub-shake');
                        animateBlobColor(originalBlobColor);
                        animateNoise(0.35); // Retorna ao estado normal
                    }, 500);
                }
                return;
            }

            if (e.key === 'Tab' && suggestionElement.textContent) {
                e.preventDefault();
                commandInput.value = suggestionElement.textContent;
                suggestionElement.textContent = '';
            }

            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace'].includes(e.key)) {
                 setTimeout(() => commandInput.dispatchEvent(new Event('input')), 0);
            }
        });

        const interactiveLinks = document.querySelectorAll('.hub-command, .easy-link');
        interactiveLinks.forEach(link => {
            link.addEventListener('mouseenter', () => animateNoise(0.42));
            link.addEventListener('mouseleave', () => animateNoise(0.35));
        });
    }
}

function onWindowResize() {
    if (!blobCamera || !blobRenderer) return;
    blobCamera.aspect = window.innerWidth / window.innerHeight;
    blobCamera.updateProjectionMatrix();
    blobRenderer.setSize(window.innerWidth, window.innerHeight);
    
    const isMobile = window.innerWidth < 768;
    const targetScale = isMobile ? 0.75 : 1;
    gsap.to(blob.scale, {
        x: targetScale,
        y: targetScale,
        z: targetScale,
        duration: 0.5
    });
}

function handleVisibilityChange() {
    if (!animationFrameId) return;
    if (document.hidden) {
        cancelAnimationFrame(animationFrameId);
    } else {
        animate();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if(document.body.classList.contains('page-hub')) {
        initThreeBlob();
        animate();
    }
    setupPageLogic();
    initPageTransitions();
    
    document.addEventListener('visibilitychange', handleVisibilityChange, false);
});

window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        console.log('Page loaded from bfcache. Re-initializing scene.');
        const overlay = document.getElementById('page-transition-overlay');
        if (overlay) {
            overlay.style.opacity = 0;
        }

        if (document.body.classList.contains('page-hub')) {
            cleanupThreeScene();
            initThreeBlob();
            animate();
        }
        
        const pageWrapper = document.getElementById('page-wrapper');
        if (pageWrapper) {
            pageWrapper.style.opacity = 1;
        }
    }
});