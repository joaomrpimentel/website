let matrixInterval;

function exitMatrixOnEsc(e) {
    if (e.key === 'Escape') {
        stopMatrixEffect();
    }
}

function stopMatrixEffect() {
    const hubContainer = document.getElementById('hub-container');
    const matrixCanvas = document.getElementById('matrix-canvas');
    if (!matrixCanvas || !hubContainer) return;

    clearInterval(matrixInterval);
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
    matrixCanvas.width = window.innerWidth;
    matrixCanvas.height = window.innerHeight;

    const katakana = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン';
    const latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nums = '0123456789';
    const alphabet = katakana + latin + nums;

    const fontSize = 16;
    const columns = Math.floor(matrixCanvas.width / fontSize);
    
    const message = "The Jotaverse has you...";
    const messageStartCol = Math.floor((columns - message.length) / 2);
    const targetRow = Math.floor((matrixCanvas.height / fontSize) / 2);

    const rainDrops = [];
    for(let i = 0; i < columns; i++) {
        let targetChar = ' ';
        if (i >= messageStartCol && i < messageStartCol + message.length) {
            targetChar = message[i - messageStartCol];
        }
        
        rainDrops[i] = {
            y: Math.random() * -matrixCanvas.height,
            targetChar: targetChar,
            isLanded: false,
        };
    }


    const draw = () => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
        
        ctx.font = fontSize + 'px monospace';

        for (let i = 0; i < rainDrops.length; i++) {
            const drop = rainDrops[i];
            const char = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
            
            if (drop.isLanded) {
                ctx.fillStyle = '#fff';
                ctx.fillText(drop.targetChar, i * fontSize, targetRow * fontSize);
                continue;
            }

            ctx.fillStyle = '#0F0';
            ctx.fillText(char, i * fontSize, drop.y);
            
            if (drop.targetChar !== ' ' && drop.y >= targetRow * fontSize) {
                drop.isLanded = true;
            }

            if (drop.y > matrixCanvas.height) {
                drop.y = Math.random() * -100;
            } else {
                drop.y += fontSize;
            }
        }
    };

    matrixInterval = setInterval(draw, 60);

    window.addEventListener('keydown', exitMatrixOnEsc);
}
