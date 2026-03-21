const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// UI 引用
const persistenceInput = document.getElementById('persistence');
const fontSizeInput = document.getElementById('fontSize');
const pluckPitchInput = document.getElementById('pluckPitch');
const glowPitchInput = document.getElementById('glowPitch');
const jitterInput = document.getElementById('jitterIntensity'); // 新增
const startBtn = document.getElementById('startAudio');

const Y2K_PALETTE = ["#ADD8E6", "#FFFFFF", "#FFB6C1"]; 

// --- 音阶池配置 ---
const MODES = {
    dream: [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50],
    arctic: [440, 523.25, 587.33, 659.25, 783.99, 987.77],
    galaxy: [261.63, 329.63, 392.00, 493.88, 523.25, 659.25],
    forest: [698.46, 783.99, 880.00, 987.77, 1174.66, 1396.91],
    magic: [523.25, 659.25, 830.61, 987.77, 1046.50, 1318.51]
};

let currentPool = MODES.dream;
let path = [];
let butterflies = [];
let fallingChars = []; 
let settledPixels = []; 
let lastPos = null;
let audioCtx = null;
let isStarted = false;

// 切换音阶模式
window.setMode = (modeName) => {
    currentPool = MODES[modeName];
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.toLowerCase() === modeName);
    });
};

const initApp = async () => {
    if (isStarted) return;
    isStarted = true;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    startBtn.innerText = "唤醒电子灵感...✧";
    try {
        await camera.start();
        startBtn.remove();
    } catch (err) { startBtn.innerText = "CAMERA ERROR"; }
};
startBtn.addEventListener('click', initApp);

// --- 音频引擎 (清脆 + 长余韵) ---
const playSound = (xPos, type) => {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = (xPos / canvasElement.width) * 2 - 1;
    const baseFreq = currentPool[Math.floor(Math.random() * currentPool.length)];

    if (type === 'pluck') {
        const mult = parseFloat(pluckPitchInput.value);
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq * mult, audioCtx.currentTime);
        
        const spike = audioCtx.createOscillator();
        const sGain = audioCtx.createGain();
        spike.frequency.value = baseFreq * mult * 4;
        sGain.gain.setValueAtTime(0.07, audioCtx.currentTime);
        sGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8); 

        osc.connect(gain); gain.connect(panner);
        spike.connect(sGain); sGain.connect(panner);
        panner.connect(audioCtx.destination);
        osc.start(); spike.start();
        osc.stop(audioCtx.currentTime + 0.9); spike.stop(audioCtx.currentTime + 0.1);
    } else {
        const mult = parseFloat(glowPitchInput.value);
        const oscG = audioCtx.createOscillator();
        const gainG = audioCtx.createGain();
        oscG.type = 'sine';
        oscG.frequency.setValueAtTime(baseFreq * mult, audioCtx.currentTime);
        gainG.gain.setValueAtTime(0, audioCtx.currentTime);
        gainG.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 0.4);
        gainG.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 3.0); 
        oscG.connect(gainG); gainG.connect(panner);
        panner.connect(audioCtx.destination);
        oscG.start(); oscG.stop(audioCtx.currentTime + 3.1);
    }
};

// --- 蝴蝶视觉 ---
const butterflyImg = new Image();
butterflyImg.src = `data:image/svg+xml;base64,${btoa(`<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M50 50 C20 -20 -20 30 25 55 C-10 90 40 100 50 80 C60 100 110 90 75 55 C120 30 80 -20 50 50Z" stroke="white" stroke-width="1.2" /></svg>`)}`;

class Butterfly {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 5; this.vy = (Math.random() - 0.5) * 5;
        this.flap = Math.random() * Math.PI; this.size = Math.random() * 15 + 25;
    }
    update() {
        this.x += this.vx; this.y += this.vy; this.flap += 0.3;
        if (this.x < 0 || this.x > canvasElement.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvasElement.height) this.vy *= -1;
    }
    draw() {
        canvasCtx.save(); canvasCtx.translate(this.x, this.y);
        canvasCtx.scale(Math.abs(Math.sin(this.flap)) + 0.3, 1);
        canvasCtx.shadowBlur = 10; canvasCtx.shadowColor = "white";
        canvasCtx.globalAlpha = 0.4;
        canvasCtx.drawImage(butterflyImg, -this.size/2, -this.size/2, this.size, this.size);
        canvasCtx.restore();
    }
}

function onResults(results) {
    if (canvasElement.width !== videoElement.videoWidth) {
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
    }
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            const indexTip = landmarks[8];
            const x = indexTip.x * canvasElement.width;
            const y = indexTip.y * canvasElement.height;

            if (lastPos) {
                const dist = Math.hypot(x - lastPos.x, y - lastPos.y);
                if (dist > 15) playSound(x, 'pluck');
                if (Math.random() > 0.94) playSound(x, 'glow');
                if (dist > 80) butterflies.push(new Butterfly(x, y));
            }
            lastPos = { x, y };
            path.push({
                x, y, time: Date.now(),
                char: ["✧", "⊹", "✶", "†"][Math.floor(Math.random()*4)],
                color: Y2K_PALETTE[Math.floor(Math.random()*3)],
                isFalling: Math.random() < 0.2,
                glowOffset: Math.random() * 100 
            });
        }
    } else { lastPos = null; }
    renderFrame();
}

function renderFrame() {
    const now = Date.now();
    const duration = parseInt(persistenceInput.value);
    const fSize = parseInt(fontSizeInput.value);
    const jitter = parseFloat(jitterInput.value); // 获取抖动强度

    // 辅助函数：生成抖动坐标
    const getJitterPos = (val) => val + (Math.random() - 0.5) * jitter;

    // 1. 绘制堆积字符 (电子抖动)
    settledPixels.forEach(p => {
        canvasCtx.save(); canvasCtx.globalAlpha = 0.15;
        canvasCtx.fillStyle = p.color; canvasCtx.font = `${fSize * 0.7}px serif`;
        // 为堆积的字符也增加微小的颤动感
        canvasCtx.fillText(p.char, getJitterPos(p.x), getJitterPos(p.y));
        canvasCtx.restore();
    });

    // 2. 绘制下落字符
    fallingChars = fallingChars.filter(p => {
        p.y += p.speed; p.speed += 0.1;
        if (p.y >= canvasElement.height - 10) {
            settledPixels.push(p); if (settledPixels.length > 150) settledPixels.shift();
            return false;
        }
        canvasCtx.save(); canvasCtx.fillStyle = p.color;
        canvasCtx.font = `${fSize * 0.8}px serif`;
        canvasCtx.fillText(p.char, getJitterPos(p.x), p.y); 
        canvasCtx.restore();
        return true;
    });

    // 3. 绘制实时轨迹 (核心电子抖动)
    path = path.filter(p => {
        const age = now - p.time;
        if (age > duration) {
            if (p.isFalling) { p.speed = 1.0; fallingChars.push(p); }
            return false;
        }
        const opacity = 1 - age / duration;
        canvasCtx.save();
        canvasCtx.shadowColor = p.color;
        canvasCtx.shadowBlur = 15 * (Math.abs(Math.sin(now / 50 + p.glowOffset)) * 0.5 + 0.5);
        canvasCtx.globalAlpha = opacity; canvasCtx.fillStyle = p.color;
        canvasCtx.font = `${fSize}px serif`;
        
        // 应用抖动：每次渲染位置都会在 jitter 范围内随机跳动
        const jX = getJitterPos(p.x);
        const jY = getJitterPos(p.y);
        canvasCtx.fillText(p.char, jX, jY); 
        
        canvasCtx.restore();
        return true;
    });

    butterflies.forEach(b => { b.update(); b.draw(); });
    if(butterflies.length > 6) butterflies.shift();
}

// MediaPipe 初始化
const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
hands.onResults(onResults);
const camera = new Camera(videoElement, { onFrame: async () => { await hands.send({image: videoElement}); }, width: 640, height: 480 });