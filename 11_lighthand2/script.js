const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// UI 元素
const darkBgInput = document.getElementById('darkBg');
const crtInput = document.getElementById('crtToggle');
const handColorInput = document.getElementById('handColor');
const breatheSpeedInput = document.getElementById('breatheSpeed');
const settleLimitInput = document.getElementById('settleLimit');
const jitterInput = document.getElementById('jitter');
const imgUpload = document.getElementById('imgUpload');
const confirmBtn = document.getElementById('confirmImg');
const startBtn = document.getElementById('startAudio');

// 核心资产
const MATRIX_CHARS = "✧⊹✶†01$#@&%*<>?".split("");
const MODES = {
    dream: [523.25, 659.25, 783.99, 880.00],
    arctic: [440, 523.25, 659.25, 987.77],
    galaxy: [261.63, 392.00, 523.25, 659.25],
    magic: [523.25, 830.61, 1046.50, 1318.51]
};

let currentPool = MODES.dream;
let path = [], butterflies = [], fallingChars = [], settledPixels = [];
let lastPos = null, audioCtx = null, scanline = 0;

// 蝴蝶 PNG 逻辑
let customSprite = new Image();
customSprite.src = `data:image/svg+xml;base64,${btoa('<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M50 50 C20 -20 -20 30 25 55 C-10 90 40 100 50 80 C60 100 110 90 75 55 C120 30 80 -20 50 50Z" stroke="white" stroke-width="1.2" /></svg>')}`;
let pendingImg = null;

imgUpload.onchange = (e) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
        pendingImg = new Image();
        pendingImg.onload = () => { confirmBtn.classList.add('active'); };
        pendingImg.src = ev.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
};
confirmBtn.onclick = () => { if(pendingImg) customSprite = pendingImg; };

window.setMode = (m) => {
    currentPool = MODES[m];
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.innerText.toLowerCase() === m));
};

// 音效引擎
const playSound = (x) => {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = (x / canvasElement.width) * 2 - 1;
    osc.frequency.value = currentPool[Math.floor(Math.random()*currentPool.length)];
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);
    osc.connect(gain); gain.connect(panner); panner.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 1.3);
};

// 蝴蝶系统
class Butterfly {
    constructor(x, y) { this.x = x; this.y = y; this.vx = (Math.random()-0.5)*5; this.vy = (Math.random()-0.5)*5; this.flap = Math.random()*10; }
    update() { this.x += this.vx; this.y += this.vy; this.flap += 0.2; }
    draw() {
        canvasCtx.save(); canvasCtx.translate(this.x, this.y); canvasCtx.scale(Math.abs(Math.sin(this.flap))+0.2, 1);
        canvasCtx.globalAlpha = 0.5; canvasCtx.drawImage(customSprite, -20, -20, 40, 40); canvasCtx.restore();
    }
}

// 核心：乱序呼吸的代码流手
function drawBioMatrixHand(landmarks) {
    const density = 12; 
    const speed = parseFloat(breatheSpeedInput.value);
    const baseColor = handColorInput.value;
    const points = landmarks.map(lm => ({ x: (1-lm.x)*canvasElement.width, y: lm.y*canvasElement.height }));
    
    const minX = Math.min(...points.map(p=>p.x))-30, maxX = Math.max(...points.map(p=>p.x))+30;
    const minY = Math.min(...points.map(p=>p.y))-30, maxY = Math.max(...points.map(p=>p.y))+30;

    canvasCtx.save();
    canvasCtx.font = `${density}px monospace`;
    
    for(let x = minX; x < maxX; x += density) {
        for(let y = minY; y < maxY; y += density) {
            // 实心检测
            if(points.some(p => Math.hypot(p.x - x, p.y - y) < 28)) {
                // 乱序呼吸算法：每个位置根据坐标 (x,y) 拥有独特的相位差
                const phase = (x * 0.05) + (y * 0.05);
                const individualBreathe = Math.sin((Date.now() * 0.005 * speed) + phase) * 0.5 + 0.5;
                
                canvasCtx.globalAlpha = individualBreathe * 0.8;
                canvasCtx.shadowBlur = 10 * individualBreathe;
                canvasCtx.shadowColor = baseColor;
                canvasCtx.fillStyle = (individualBreathe > 0.8 && Math.random() > 0.9) ? "#fff" : baseColor;
                
                const char = MATRIX_CHARS[Math.floor((phase * 10) % MATRIX_CHARS.length)];
                canvasCtx.fillText(char, x, y);
            }
        }
    }
    canvasCtx.restore();
}

function onResults(results) {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    
    // 背景
    canvasCtx.save(); canvasCtx.scale(-1, 1); canvasCtx.translate(-canvasElement.width, 0);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    if(darkBgInput.checked) { canvasCtx.fillStyle="black"; canvasCtx.fillRect(0,0,canvasElement.width,canvasElement.height); }

    const now = Date.now();
    const jitterVal = parseInt(jitterInput.value);
    const getJitter = (v) => v + (Math.random()-0.5) * jitterVal;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            drawBioMatrixHand(landmarks);
            const x = (1-landmarks[8].x)*canvasElement.width, y = landmarks[8].y*canvasElement.height;
            if(lastPos && Math.hypot(x-lastPos.x, y-lastPos.y) > 20) {
                playSound(x); if(Math.random()>0.85) butterflies.push(new Butterfly(x, y));
            }
            lastPos = {x, y};
            // 轨迹字符的多样化
            path.push({ 
                x, y, time: now, 
                char: MATRIX_CHARS[Math.floor(Math.random()*MATRIX_CHARS.length)], 
                color: "#fff", isFalling: Math.random()<0.15 
            });
        }
    }

    // 屏幕底部堆积效果
    settledPixels.forEach(p => {
        canvasCtx.globalAlpha = 0.2; canvasCtx.fillStyle = "#fff";
        canvasCtx.fillText(p.char, getJitter(p.x), p.y);
    });

    // 掉落
    fallingChars = fallingChars.filter(p => {
        p.y += 4;
        if(p.y > canvasElement.height - 10) {
            settledPixels.push(p);
            if(settledPixels.length > parseInt(settleLimitInput.value)) settledPixels.shift();
            return false;
        }
        canvasCtx.globalAlpha = 0.5; canvasCtx.fillText(p.char, getJitter(p.x), p.y);
        return true;
    });

    // 实时轨迹与抖动
    path = path.filter(p => {
        const age = now - p.time;
        if(age > 3000) { if(p.isFalling) fallingChars.push({...p}); return false; }
        canvasCtx.globalAlpha = 1 - age/3000;
        canvasCtx.fillStyle = p.color;
        canvasCtx.fillText(p.char, getJitter(p.x), getJitter(p.y));
        return true;
    });

    butterflies.forEach(b => { b.update(); b.draw(); });
    if(butterflies.length > 10) butterflies.shift();

    // CRT 电视滤镜
    if(crtInput.checked) {
        canvasCtx.fillStyle = "rgba(18, 16, 16, 0.2)";
        for (let i = 0; i < canvasElement.height; i += 3) canvasCtx.fillRect(0, i + (scanline % 3), canvasElement.width, 1);
        scanline++;
    }
}

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
hands.onResults(onResults);
const camera = new Camera(videoElement, { onFrame: async () => { await hands.send({image: videoElement}); }, width: 640, height: 480 });

startBtn.onclick = async () => {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await camera.start(); startBtn.remove();
};