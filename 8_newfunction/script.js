const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// UI 引用
const persistenceInput = document.getElementById('persistence');
const pluckPitchInput = { value: 2.0 }; // 内部设为默认值以保持兼容
const glowPitchInput = { value: 0.5 };
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

// --- 图片上传与高清处理 ---
let customSprite = new Image();
customSprite.src = `data:image/svg+xml;base64,${btoa(`<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M50 50 C20 -20 -20 30 25 55 C-10 90 40 100 50 80 C60 100 110 90 75 55 C120 30 80 -20 50 50Z" stroke="white" stroke-width="1.2" /></svg>`)}`;

let pendingImage = null;

imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                pendingImage = img;
                confirmBtn.classList.add('active'); // 激活按钮
                confirmBtn.innerText = "Ready! 点击确认";
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
        confirmBtn.innerText = "Updated! ✨";
        setTimeout(() => { confirmBtn.innerText = "Confirm 确认替换"; }, 2000);
    }
});

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

// 音频引擎
const playSound = (xPos, type) => {
    if (!audioCtx || audioCtx.state !== 'running') return;
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

// 蝴蝶类 - 修复高清度
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
        const opacity = parseFloat(bfOpacityInput.value);
        canvasCtx.save();
        canvasCtx.translate(this.x, this.y);
        canvasCtx.scale(Math.abs(Math.sin(this.flap)) + 0.3, 1);
        
        // 关键：开启高清渲染
        canvasCtx.imageSmoothingEnabled = true;
        canvasCtx.imageSmoothingQuality = 'high';
        
        canvasCtx.shadowBlur = 10; canvasCtx.shadowColor = "white";
        canvasCtx.globalAlpha = opacity;
        canvasCtx.drawImage(customSprite, -this.size/2, -this.size/2, this.size, this.size);
        canvasCtx.restore();
    }
}

function onResults(results) {
    if (canvasElement.width !== videoElement.videoWidth) {
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
    }

    // 绘制镜像背景
    canvasCtx.save();
    canvasCtx.scale(-1, 1);
    canvasCtx.translate(-canvasElement.width, 0);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            // 镜像坐标同步
            const x = (1 - landmarks[8].x) * canvasElement.width;
            const y = landmarks[8].y * canvasElement.height;

            if (lastPos) {
                const dist = Math.hypot(x - lastPos.x, y - lastPos.y);
                if (dist > 15) playSound(x, 'pluck');
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
    const jitter = parseFloat(jitterInput.value);
    const getJitterPos = (val) => val + (Math.random() - 0.5) * jitter;

    // 1. 堆积字符
    settledPixels.forEach(p => {
        canvasCtx.save(); canvasCtx.globalAlpha = 0.15;
        canvasCtx.fillStyle = p.color; canvasCtx.font = `14px serif`;
        canvasCtx.fillText(p.char, getJitterPos(p.x), getJitterPos(p.y));
        canvasCtx.restore();
    });

    // 2. 下落字符
    fallingChars = fallingChars.filter(p => {
        p.y += p.speed; p.speed += 0.1;
        if (p.y >= canvasElement.height - 10) {
            settledPixels.push(p); if (settledPixels.length > 150) settledPixels.shift();
            return false;
        }
        canvasCtx.save(); canvasCtx.fillStyle = p.color; canvasCtx.font = `16px serif`;
        canvasCtx.fillText(p.char, getJitterPos(p.x), p.y); 
        canvasCtx.restore();
        return true;
    });

    // 3. 实时轨迹 (电子抖动)
    path = path.filter(p => {
        const age = now - p.time;
        if (age > duration) {
            if (p.isFalling) { p.speed = 1.0; fallingChars.push(p); }
            return false;
        }
        canvasCtx.save();
        canvasCtx.globalAlpha = 1 - age / duration;
        canvasCtx.fillStyle = p.color; canvasCtx.font = `20px serif`;
        canvasCtx.fillText(p.char, getJitterPos(p.x), getJitterPos(p.y)); 
        canvasCtx.restore();
        return true;
    });

    butterflies.forEach(b => { b.update(); b.draw(); });
    if(butterflies.length > 8) butterflies.shift();
}

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
hands.onResults(onResults);
const camera = new Camera(videoElement, { onFrame: async () => { await hands.send({image: videoElement}); }, width: 640, height: 480 });