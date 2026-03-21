const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// --- UI 引用 ---
const persistenceInput = document.getElementById('persistence');
const jitterInput = document.getElementById('jitterIntensity');
const bfOpacityInput = document.getElementById('bfOpacity');
const imageUpload = document.getElementById('imageUpload');
const confirmBtn = document.getElementById('confirmSprite');
const startBtn = document.getElementById('startAudio');

const Y2K_PALETTE = ["#ADD8E6", "#FFFFFF", "#FFB6C1"]; 

const MODES = {
    dream: [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50],
    arctic: [440, 523.25, 587.33, 659.25, 783.99, 987.77],
    galaxy: [261.63, 329.63, 392.00, 493.88, 523.25, 659.25],
    magic: [523.25, 659.25, 830.61, 987.77, 1046.50, 1318.51]
};

let currentPool = MODES.dream;
let path = [];
let butterflies = [];
let fallingChars = []; 
let lastPos = null;
let audioCtx = null;
let isStarted = false;

// --- 图片高清处理逻辑 ---
let customSprite = new Image();
customSprite.src = `data:image/svg+xml;base64,${btoa(`<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M50 50 C20 -20 -20 30 25 55 C-10 90 40 100 50 80 C60 100 110 90 75 55 C120 30 80 -20 50 50Z" stroke="white" stroke-width="1.5" /></svg>`)}`;

let pendingImage = null;

imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                pendingImage = img;
                confirmBtn.classList.add('active');
                confirmBtn.innerText = "Ready! 点击替换";
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
});

confirmBtn.addEventListener('click', () => {
    if (pendingImage) {
        customSprite = pendingImage;
        butterflies = []; // 替换瞬间刷新
        confirmBtn.innerText = "SUCCESS! ✨";
        setTimeout(() => { confirmBtn.innerText = "Confirm 确认替换"; }, 2000);
    }
});

// --- 音频引擎 ---
const playSound = (xPos, type) => {
    if (!audioCtx) return;
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = (xPos / canvasElement.width) * 2 - 1;
    const baseFreq = currentPool[Math.floor(Math.random() * currentPool.length)];
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(type === 'pluck' ? baseFreq * 2 : baseFreq * 0.5, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (type === 'pluck' ? 0.8 : 3.0));
    
    osc.connect(gain); gain.connect(panner); panner.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 3.1);
};

// --- 蝴蝶/精灵类 ---
class Butterfly {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 4; this.vy = (Math.random() - 0.5) * 4;
        this.flap = Math.random() * Math.PI; this.size = Math.random() * 20 + 40;
    }
    update() {
        this.x += this.vx; this.y += this.vy; this.flap += 0.25;
        if (this.x < 0 || this.x > canvasElement.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvasElement.height) this.vy *= -1;
    }
    draw() {
        const opacity = parseFloat(bfOpacityInput.value);
        canvasCtx.save();
        canvasCtx.translate(this.x, this.y);
        canvasCtx.scale(Math.abs(Math.sin(this.flap)) + 0.4, 1);
        canvasCtx.globalAlpha = opacity;
        
        // 开启高清抗锯齿
        canvasCtx.imageSmoothingEnabled = true;
        canvasCtx.imageSmoothingQuality = 'high';
        
        canvasCtx.drawImage(customSprite, -this.size/2, -this.size/2, this.size, this.size);
        canvasCtx.restore();
    }
}

// --- 核心渲染循环 ---
function onResults(results) {
    if (canvasElement.width !== videoElement.videoWidth) {
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
    }

    // 1. 绘制镜像背景
    canvasCtx.save();
    canvasCtx.scale(-1, 1);
    canvasCtx.translate(-canvasElement.width, 0);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    const now = Date.now();
    const jitter = parseFloat(jitterInput.value);
    const duration = parseInt(persistenceInput.value);

    // 2. 手势检测与交互 (在镜像后的坐标系中计算)
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            // 注意：MediaPipe 返回的是 0-1 的比例，我们直接对应到 Canvas 坐标
            // 因为背景已经镜像，这里的 x 需要反向对应才能让蝴蝶跟着手走
            const x = (1 - landmarks[8].x) * canvasElement.width;
            const y = landmarks[8].y * canvasElement.height;

            if (lastPos) {
                const dist = Math.hypot(x - lastPos.x, y - lastPos.y);
                if (dist > 15) playSound(x, 'pluck');
                if (dist > 80) butterflies.push(new Butterfly(x, y));
            }
            lastPos = { x, y };
            path.push({ x, y, time: now, char: "✧", color: Y2K_PALETTE[Math.floor(Math.random()*3)] });
        }
    } else { lastPos = null; }

    // 3. 渲染轨迹 (电子抖动)
    path = path.filter(p => {
        const age = now - p.time;
        if (age > duration) return false;
        canvasCtx.fillStyle = p.color;
        canvasCtx.globalAlpha = 1 - age / duration;
        canvasCtx.font = "20px serif";
        const jX = p.x + (Math.random()-0.5) * jitter;
        const jY = p.y + (Math.random()-0.5) * jitter;
        canvasCtx.fillText(p.char, jX, jY);
        return true;
    });

    // 4. 绘制蝴蝶
    butterflies.forEach(b => { b.update(); b.draw(); });
    if (butterflies.length > 10) butterflies.shift();
}

window.setMode = (m) => { currentPool = MODES[m]; document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('active', b.innerText.toLowerCase()===m)); };

startBtn.addEventListener('click', async () => {
    if (isStarted) return;
    isStarted = true;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await camera.start();
    startBtn.remove();
});

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
hands.onResults(onResults);
const camera = new Camera(videoElement, { onFrame: async () => { await hands.send({image: videoElement}); }, width: 640, height: 480 });