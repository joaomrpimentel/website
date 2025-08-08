import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

let blobScene, blobCamera, blobRenderer, blob;
function initThreeBlob() {
    const canvas = document.querySelector('#bg-canvas');
    if (!canvas) return; 
    
    blobScene = new THREE.Scene();
    blobCamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    blobCamera.position.set(0, 0, 8);
    blobRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    blobRenderer.setPixelRatio(window.devicePixelRatio);
    blobRenderer.setSize(window.innerWidth, window.innerHeight);

    const isMobile = window.innerWidth < 768;
    const blobSize = isMobile ? 2.2 : 3;
    const blobGeometry = new THREE.IcosahedronGeometry(blobSize, 64);
    blobGeometry.userData.originalPositions = blobGeometry.attributes.position.clone();
    const blobMaterial = new THREE.ShaderMaterial({
        vertexShader: `
            varying vec3 vNormal; varying vec3 vViewPosition;
            void main() { 
                vNormal = normalize(normalMatrix * normal); 
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                vViewPosition = -mvPosition.xyz;
                gl_Position = projectionMatrix * mvPosition; 
            }`,
        fragmentShader: `
            uniform vec3 uColor; varying vec3 vNormal; varying vec3 vViewPosition;
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
        uniforms: { uTime: { value: 0.0 }, uColor: { value: new THREE.Color(0x00ff41) } }
    });
    blob = new THREE.Mesh(blobGeometry, blobMaterial);
    blobScene.add(blob); 
}

const clock = new THREE.Clock();
const simplex = new SimplexNoise();
function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();
    
    if (blob && blob.geometry.userData.originalPositions) {
         const positions = blob.geometry.attributes.position;
         const originalPositions = blob.geometry.userData.originalPositions;
         for (let i = 0; i < positions.count; i++) {
            const p = new THREE.Vector3().fromBufferAttribute(originalPositions, i);
            const noise = simplex.noise3d(p.x * 0.4 + elapsedTime * 0.1, p.y * 0.4 + elapsedTime * 0.1, p.z * 0.4 + elapsedTime * 0.1);
            p.add(p.clone().normalize().multiplyScalar(noise * 0.35));
            positions.setXYZ(i, p.x, p.y, p.z);
         }
         positions.needsUpdate = true;
         blob.geometry.computeVertexNormals();
    }
    if(blobRenderer) blobRenderer.render(blobScene, blobCamera);
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
            { command: '/s', href: 'about.html' },
            { command: '/p', href: 'projects.html' },
            { command: '/c', href: 'contact.html' }
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
                if (commandMap[value]) {
                    window.location.href = commandMap[value];
                } else {
                    hubElement.classList.add('hub-error');
                    hubElement.classList.add('hub-shake');
                    setTimeout(() => {
                        hubElement.classList.remove('hub-error');
                        hubElement.classList.remove('hub-shake');
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
window.addEventListener('resize', onWindowResize);


document.addEventListener('DOMContentLoaded', () => {
    initThreeBlob();
    animate();
    setupPageLogic();
});
