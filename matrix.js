let animationFrameId;

function exitMatrixOnEsc(e) {
    if (e.key === 'Escape') {
        stopMatrixEffect();
    }
}

function stopMatrixEffect() {
    const hubContainer = document.getElementById('hub-container');
    const matrixCanvas = document.getElementById('matrix-canvas');
    if (!matrixCanvas || !hubContainer) return;

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    matrixCanvas.style.display = 'none';
    hubContainer.classList.remove('hub-hidden');
    window.removeEventListener('keydown', exitMatrixOnEsc);
}

export function startMatrixEffect() {
    const hubContainer = document.getElementById('hub-container');
    const matrixCanvas = document.getElementById('matrix-canvas');
    if (!matrixCanvas || !hubContainer) return;

    hubContainer.classList.add('hub-hidden');
    matrixCanvas.style.display = 'block';

    const ctx = matrixCanvas.getContext('2d');

    const dpr = window.devicePixelRatio || 1;
    matrixCanvas.width = window.innerWidth * dpr;
    matrixCanvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);

    const katakana = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン';
    const latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nums = '0123456789';
    const alphabet = katakana + latin + nums;

    const isMobile = window.innerWidth < 768;
    const fontSize = isMobile ? 12 : 16;
    const canvasWidth = window.innerWidth;
    const canvasHeight = window.innerHeight;
    const columns = Math.floor(canvasWidth / fontSize);

    const message = "The Jotaverse has you...";
    const messageStartCol = Math.floor((columns - message.length) / 2);
    const targetRow = Math.floor((canvasHeight / fontSize) / 2);

    const rainDrops = [];
    for (let i = 0; i < columns; i++) {
        let targetChar = ' ';
        if (i >= messageStartCol && i < messageStartCol + message.length) {
            targetChar = message[i - messageStartCol];
        }
        rainDrops[i] = {
            y: Math.random() * -canvasHeight,
            targetChar: targetChar,
            isLanded: false,
        };
    }

    let lastTime = 0;
    const targetFPS = 20;
    const interval = 1000 / targetFPS;

    const animate = (timestamp) => {
        animationFrameId = requestAnimationFrame(animate);
        const deltaTime = timestamp - lastTime;

        if (deltaTime > interval) {
            lastTime = timestamp - (deltaTime % interval);

            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            ctx.font = fontSize + 'px monospace';

            for (let i = 0; i < rainDrops.length; i++) {
                const drop = rainDrops[i];
                const char = alphabet.charAt(Math.floor(Math.random() * alphabet.length));

                if (drop.isLanded) {
                    ctx.fillStyle = '#000';
                    ctx.fillRect(i * fontSize, (targetRow * fontSize) - fontSize, fontSize, fontSize);
                    ctx.fillStyle = '#fff';
                    ctx.fillText(drop.targetChar, i * fontSize, targetRow * fontSize);
                }

                ctx.fillStyle = '#0F0';
                ctx.fillText(char, i * fontSize, drop.y);

                if (drop.targetChar !== ' ' && drop.y >= targetRow * fontSize) {
                    drop.isLanded = true;
                }

                if (drop.y > canvasHeight && Math.random() > 0.975) {
                    drop.y = 0;
                } else {
                    drop.y += fontSize;
                }
            }
        }
    };

    animate(0);
    window.addEventListener('keydown', exitMatrixOnEsc);
}