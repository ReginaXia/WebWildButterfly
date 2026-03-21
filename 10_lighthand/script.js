const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// --- UI 引用 ---
const darkBackgroundInput = document.getElementById('darkBackground');
const handIntensityInput = document.getElementById('handIntensity');
const jitterInput = document.getElementById('jitterIntensity');
const pluckPitchInput = document.getElementById('pluckPitch');
const imageUpload = document.getElementById('imageUpload');
const confirmBtn = document.getElementById('confirmSprite');
const startBtn = document.getElementById('startAudio');

const Y2K_PALETTE = ["#ADD8E6", "#FFFFFF", "#FFB6C1"]; 
const MODES = {
    dream: [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50],
    magic: [523.25, 659.25, 830.61, 987.77, 1046.50, 1318.51]
};

let currentPool = MODES.dream;
let path = [], butterflies = [], fallingChars = [], settledPixels = [];
let lastPos = null, audioCtx = null, isStarted = false;

// --- 高画质蝴蝶处理 ---
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

// --- 音频引擎 (保留 pluck 功能) ---
const playSound = (xPos) => {
    if (!audioCtx) return;
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = (xPos / canvasElement.width) * 2 - 1;
    const baseFreq = currentPool[Math.floor(Math.random() * currentPool.length)];
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const mult = parseFloat(pluckPitchInput.value);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * mult, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
    osc.connect(gain); gain.connect(panner); panner.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.9);
};

// --- 高画质蝴蝶类 ---
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
        canvasCtx.save();
        canvasCtx.translate(this.x, this.y);
        canvasCtx.scale(Math.abs(Math.sin(this.flap)) + 0.3, 1);
        canvasCtx.imageSmoothingEnabled = true; // 开启高清
        canvasCtx.imageSmoothingQuality = 'high';
        canvasCtx.globalAlpha = 0.7;
        canvasCtx.drawImage(customSprite, -this.size/2, -this.size/2, this.size, this.size);
        canvasCtx.restore();
    }
}

// --- 电子骨骼手绘制函数 ---
function drawDigitalHand(landmarks) {
    const intensity = parseFloat(handIntensityInput.value);
    if (intensity <= 0) return;
    const breathe = Math.sin(Date.now() / 300) * 0.5 + 0.5;

    canvasCtx.save();
    // 关键点转换
    const points = landmarks.map(lm => ({ x: lm.x * canvasElement.width, y: lm.y * canvasElement.height }));

    // 绘制连线
    canvasCtx.strokeStyle = `rgba(0, 242, 255, ${0.4 * intensity})`;
    canvasCtx.lineWidth = 2;
    canvasCtx.shadowBlur = 10 * breathe;
    canvasCtx.shadowColor = "#00f2ff";
    const connections = [[0,1,2,3,4], [0,5,6,7,8], [5,9,13,17], [9,10,11,12], [13,14,15,16], [17,18,19,20], [0,17]];
    connections.forEach(line => {
        canvasCtx.beginPath();
        line.forEach((idx, i) => { if (i === 0) canvasCtx.moveTo(points[idx].x, points[idx].y); else canvasCtx.lineTo(points[idx].x, points[idx].y); });
        canvasCtx.stroke();
    });

    // 绘制呼吸粒子点
    points.forEach((p, i) => {
        canvasCtx.fillStyle = `rgba(255, 255, 255, ${intensity})`;
        canvasCtx.beginPath();
        canvasCtx.arc(p.x, p.y, (i % 4 === 0 ? 5 : 2.5), 0, Math.PI * 2);
        canvasCtx.fill();
    });
    canvasCtx.restore();
}

function onResults(results) {
    if (canvasElement.width !== videoElement.videoWidth) {
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
    }

    // 1. 恢复：绘制镜像后的背景画面
    canvasCtx.save();
    canvasCtx.scale(-1, 1);
    canvasCtx.translate(-canvasElement.width, 0);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    // 2. 开关判断：如果开启纯黑模式，在画面上盖一层黑
    if (darkBackgroundInput.checked) {
        canvasCtx.fillStyle = "black";
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    }

    const now = Date.now();
    const jitter = parseFloat(jitterInput.value);
    const getJitterPos = (val) => val + (Math.random() - 0.5) * jitter;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            // 镜像坐标处理：因为外层 Canvas 已经绘制了镜像背景，这里的坐标计算要同步
            const mirroredLandmarks = landmarks.map(lm => ({...lm, x: 1 - lm.x}));
            drawDigitalHand(mirroredLandmarks);
            
            const x = mirroredLandmarks[8].x * canvasElement.width;
            const y = mirroredLandmarks[8].y * canvasElement.height;

            if (lastPos) {
                const dist = Math.hypot(x - lastPos.x, y - lastPos.y);
                if (dist > 15) playSound(x);
                if (dist > 80) butterflies.push(new Butterfly(x, y));
            }
            lastPos = { x, y };
            path.push({ x, y, time: now, char: ["✧", "⊹", "✶", "†"][Math.floor(Math.random()*4)], color: Y2K_PALETTE[Math.floor(Math.random()*3)], isFalling: Math.random() < 0.2 });
        }
    } else { lastPos = null; }

    // 3. 渲染轨迹与字符 (保持原有所有效果)
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
        if (age > 4000) { if (p.isFalling) { p.speed = 1.0; fallingChars.push(p); } return false; }
        canvasCtx.globalAlpha = 1 - age / 4000;
        canvasCtx.fillStyle = p.color; canvasCtx.font = "20px serif";
        canvasCtx.fillText(p.char, getJitterPos(p.x), getJitterPos(p.y));
        return true;
    });

    butterflies.forEach(b => { b.update(); b.draw(); });
    if(butterflies.length > 8) butterflies.shift();
}

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
hands.onResults(onResults);
const camera = new Camera(videoElement, { onFrame: async () => { await hands.send({image: videoElement}); }, width: 640, height: 480 });

startBtn.addEventListener('click', async () => {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await camera.start();
    startBtn.remove();
});