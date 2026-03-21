const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// --- UI 引用 ---
const persistenceInput = document.getElementById('persistence');
const jitterInput = document.getElementById('jitterIntensity');
const imageUpload = document.getElementById('imageUpload');
const confirmBtn = document.getElementById('confirmSprite');
const startBtn = document.getElementById('startAudio');
// 滤镜专用 UI
const crtOpacityInput = document.getElementById('crtOpacity');
const crtColorInput = document.getElementById('crtColor');
const crtSpeedInput = document.getElementById('crtSpeed');

let scanlineOffset = 0;
const Y2K_PALETTE = ["#ADD8E6", "#FFFFFF", "#FFB6C1"]; 
const MODES = {
    dream: [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50],
    magic: [523.25, 659.25, 830.61, 987.77, 1046.50, 1318.51]
};

let currentPool = MODES.dream;
let path = [], butterflies = [], fallingChars = [], settledPixels = [];
let lastPos = null, audioCtx = null, isStarted = false;

// --- 图片处理 ---
let customSprite = new Image();
customSprite.src = `data:image/svg+xml;base64,${btoa(`<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M50 50 C20 -20 -20 30 25 55 C-10 90 40 100 50 80 C60 100 110 90 75 55 C120 30 80 -20 50 50Z" stroke="white" stroke-width="1.2" /></svg>`)}`;
let pendingImage = null;

imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => { pendingImage = img; confirmBtn.classList.add('active'); confirmBtn.innerText = "READY! 确认"; };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }
});

confirmBtn.addEventListener('click', () => {
    if (pendingImage) { customSprite = pendingImage; butterflies = []; confirmBtn.innerText = "UPDATED! ✨"; setTimeout(() => confirmBtn.innerText = "Confirm 替换", 2000); }
});

window.setMode = (m) => { currentPool = MODES[m]; document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.innerText.toLowerCase() === m)); };

// --- 音效与逻辑 ---
const initApp = async () => {
    if (isStarted) return;
    isStarted = true;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await camera.start();
    startBtn.remove();
};
startBtn.addEventListener('click', initApp);

const playSound = (xPos, type) => {
    if (!audioCtx) return;
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = (xPos / canvasElement.width) * 2 - 1;
    const baseFreq = currentPool[Math.floor(Math.random() * currentPool.length)];
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(type === 'pluck' ? baseFreq * 2 : baseFreq * 0.5, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5);
    osc.connect(gain); gain.connect(panner); panner.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 1.6);
};

class Butterfly {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 5; this.vy = (Math.random() - 0.5) * 5;
        this.flap = Math.random() * Math.PI; this.size = Math.random() * 20 + 45;
    }
    update() {
        this.x += this.vx; this.y += this.vy; this.flap += 0.3;
        if (this.x < 0 || this.x > canvasElement.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvasElement.height) this.vy *= -1;
    }
    draw() {
        canvasCtx.save();
        canvasCtx.translate(this.x, this.y);
        canvasCtx.scale(Math.abs(Math.sin(this.flap)) + 0.3, 1);
        canvasCtx.imageSmoothingQuality = 'high';
        canvasCtx.globalAlpha = 0.8;
        canvasCtx.drawImage(customSprite, -this.size/2, -this.size/2, this.size, this.size);
        canvasCtx.restore();
    }
}

// --- 绘制电子屏幕滤镜层 ---
function drawCRTEffect() {
    const opacity = parseFloat(crtOpacityInput.value);
    const tintColor = crtColorInput.value;
    const scrollSpeed = parseFloat(crtSpeedInput.value);
    
    canvasCtx.save();
    canvasCtx.globalCompositeOperation = "overlay"; // 叠加模式增强质感
    canvasCtx.globalAlpha = opacity;

    // 1. 绘制水平扫描线
    canvasCtx.strokeStyle = tintColor;
    canvasCtx.lineWidth = 1;
    scanlineOffset = (scanlineOffset + scrollSpeed) % 20; // 滚动位移

    for (let i = -20; i < canvasElement.height; i += 4) {
        canvasCtx.beginPath();
        canvasCtx.moveTo(0, i + scanlineOffset);
        canvasCtx.lineTo(canvasElement.width, i + scanlineOffset);
        canvasCtx.stroke();
    }

    // 2. 绘制垂直网格感 (模仿像素点阵)
    canvasCtx.globalAlpha = opacity * 0.3;
    for (let j = 0; j < canvasElement.width; j += 6) {
        canvasCtx.fillStyle = tintColor;
        canvasCtx.fillRect(j, 0, 1, canvasElement.height);
    }

    // 3. 随机电子噪点
    canvasCtx.globalAlpha = opacity * 0.2;
    for (let n = 0; n < 5; n++) {
        let x = Math.random() * canvasElement.width;
        let y = Math.random() * canvasElement.height;
        canvasCtx.fillStyle = "white";
        canvasCtx.fillRect(x, y, 2, 2);
    }
    canvasCtx.restore();
}

function onResults(results) {
    if (canvasElement.width !== videoElement.videoWidth) {
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
    }

    // 背景镜像绘制
    canvasCtx.save();
    canvasCtx.scale(-1, 1);
    canvasCtx.translate(-canvasElement.width, 0);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    const now = Date.now();
    const jitter = parseFloat(jitterInput.value);
    const getJitterPos = (val) => val + (Math.random() - 0.5) * jitter;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            const x = (1 - landmarks[8].x) * canvasElement.width;
            const y = landmarks[8].y * canvasElement.height;
            if (lastPos) {
                const dist = Math.hypot(x - lastPos.x, y - lastPos.y);
                if (dist > 15) playSound(x, 'pluck');
                if (dist > 80) butterflies.push(new Butterfly(x, y));
            }
            lastPos = { x, y };
            path.push({ x, y, time: now, char: ["✧", "⊹", "✶", "†"][Math.floor(Math.random()*4)], color: Y2K_PALETTE[Math.floor(Math.random()*3)], isFalling: Math.random() < 0.2 });
        }
    } else { lastPos = null; }

    // 渲染堆积和下落字符
    settledPixels.forEach(p => {
        canvasCtx.globalAlpha = 0.15; canvasCtx.fillStyle = p.color;
        canvasCtx.fillText(p.char, getJitterPos(p.x), getJitterPos(p.y));
    });

    fallingChars = fallingChars.filter(p => {
        p.y += p.speed; p.speed += 0.1;
        if (p.y >= canvasElement.height - 10) { settledPixels.push(p); if (settledPixels.length > 100) settledPixels.shift(); return false; }
        canvasCtx.fillStyle = p.color; canvasCtx.fillText(p.char, getJitterPos(p.x), p.y);
        return true;
    });

    path = path.filter(p => {
        const age = now - p.time;
        if (age > parseInt(persistenceInput.value)) { if (p.isFalling) { p.speed = 1.0; fallingChars.push(p); } return false; }
        canvasCtx.globalAlpha = 1 - age / parseInt(persistenceInput.value);
        canvasCtx.fillStyle = p.color; canvasCtx.font = "20px serif";
        canvasCtx.fillText(p.char, getJitterPos(p.x), getJitterPos(p.y));
        return true;
    });

    butterflies.forEach(b => { b.update(); b.draw(); });
    if(butterflies.length > 8) butterflies.shift();

    // --- 在所有内容之上叠加 CRT 滤镜 ---
    drawCRTEffect();
}

const hands = new Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
hands.onResults(onResults);
const camera = new Camera(videoElement, { onFrame: async () => { await hands.send({image: videoElement}); }, width: 640, height: 480 });