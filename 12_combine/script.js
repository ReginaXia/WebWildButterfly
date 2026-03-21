const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// --- UI 引用 ---
const darkBgInput = document.getElementById('darkBg');
const crtToggle = document.getElementById('crtToggle');
const crtColorInput = document.getElementById('crtColor');
const handColorInput = document.getElementById('handColor');
const handCodeSizeInput = document.getElementById('handCodeSize');
const asciiColorInput = document.getElementById('asciiColor');
const fontSizeInput = document.getElementById('fontSize');
const jitterInput = document.getElementById('jitterIntensity');
const jitterBioInput = document.getElementById('jitterBio');
const startBtn = document.getElementById('startAudio');

// --- 保持最满意的逻辑 ---
const MATRIX_CHARS = ["✧", "⊹", "✶", "†"]; 
const MODES = {
    dream: [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50],
    arctic: [440, 523.25, 587.33, 659.25, 783.99, 987.77],
    galaxy: [261.63, 329.63, 392.00, 493.88, 523.25, 659.25],
    magic: [523.25, 659.25, 830.61, 987.77, 1046.50, 1318.51]
};

let currentPool = MODES.dream;
let path = [], butterflies = [], fallingChars = [], settledPixels = [];
let lastPos = null, audioCtx = null, scanline = 0;

// 蝴蝶逻辑
let customSprite = new Image();
customSprite.src = `data:image/svg+xml;base64,${btoa('<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M50 50 C20 -20 -20 30 25 55 C-10 90 40 100 50 80 C60 100 110 90 75 55 C120 30 80 -20 50 50Z" stroke="white" stroke-width="2" /></svg>')}`;

window.setMode = (m) => {
    currentPool = MODES[m];
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.innerText.toLowerCase() === m));
};

// 拨奏音效
const playSound = (x) => {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = (x / canvasElement.width) * 2 - 1;
    osc.frequency.setValueAtTime(currentPool[Math.floor(Math.random()*currentPool.length)] * 2, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.0);
    osc.connect(gain); gain.connect(panner); panner.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 1.2);
};

// --- 手部代码绘制：去掉条纹，增加乱序扰动 ---
function drawBioHand(landmarks) {
    const size = parseInt(handCodeSizeInput.value); 
    const jitter = parseInt(jitterBioInput.value);
    const color = handColorInput.value;
    const points = landmarks.map(lm => ({ x: (1-lm.x)*canvasElement.width, y: lm.y*canvasElement.height }));
    
    const minX = Math.min(...points.map(p=>p.x))-30, maxX = Math.max(...points.map(p=>p.x))+30;
    const minY = Math.min(...points.map(p=>p.y))-30, maxY = Math.max(...points.map(p=>p.y))+30;

    canvasCtx.save();
    canvasCtx.font = `bold ${size}px monospace`;
    for(let x = minX; x < maxX; x += size) {
        for(let y = minY; y < maxY; y += size) {
            // 乱序扰动：在坐标上加入基于位置的随机偏移
            const offsetX = (Math.sin(x * 0.5 + y * 0.2) * jitter);
            const offsetY = (Math.cos(y * 0.5 + x * 0.2) * jitter);
            
            if(points.some(p => Math.hypot(p.x - (x + offsetX), p.y - (y + offsetY)) < 26)) {
                const phase = (x * 0.1) + (y * 0.1);
                const breathe = Math.sin((Date.now() * 0.005) + phase) * 0.5 + 0.5;
                
                canvasCtx.globalAlpha = breathe * 0.8;
                canvasCtx.shadowBlur = 15 * breathe;
                canvasCtx.shadowColor = color;
                canvasCtx.fillStyle = (breathe > 0.8) ? "#fff" : color;
                canvasCtx.fillText(Math.random() > 0.5 ? "1" : "0", x + offsetX, y + offsetY);
            }
        }
    }
    canvasCtx.restore();
}

function onResults(results) {
    canvasElement.width = videoElement.videoWidth; 
    canvasElement.height = videoElement.videoHeight;
    
    // 背景绘制
    canvasCtx.save(); canvasCtx.scale(-1, 1); canvasCtx.translate(-canvasElement.width, 0);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    if(darkBgInput.checked) { canvasCtx.fillStyle="black"; canvasCtx.fillRect(0,0,canvasElement.width,canvasElement.height); }

    const now = Date.now();
    const jIntensity = parseFloat(jitterInput.value);
    const getJitter = (v) => v + (Math.random()-0.5) * jIntensity;
    const fSize = parseInt(fontSizeInput.value);
    const aColor = asciiColorInput.value;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            drawBioHand(landmarks);
            const x = (1-landmarks[8].x)*canvasElement.width, y = landmarks[8].y*canvasElement.height;
            if(lastPos && Math.hypot(x-lastPos.x, y-lastPos.y) > 15) {
                playSound(x); 
                if(Math.random()>0.85) butterflies.push({x, y, vx:(Math.random()-0.5)*5, vy:(Math.random()-0.5)*5, flap:0});
            }
            lastPos = {x, y};
            // 轨迹字符：100%不透明
            path.push({ x, y, time: now, char: MATRIX_CHARS[Math.floor(Math.random()*4)], color: aColor, isFalling: Math.random()<0.2 });
        }
    }

    // 1. 底部堆积：上限 500 个
    settledPixels.forEach(p => {
        canvasCtx.globalAlpha = 0.4; canvasCtx.fillStyle = p.color; canvasCtx.font = `${fSize * 0.8}px serif`;
        // 底部字符仍带微弱电子抖动
        canvasCtx.fillText(p.char, getJitter(p.x), p.y);
    });

    // 2. 物理掉落
    fallingChars = fallingChars.filter(p => {
        p.y += 4;
        if(p.y > canvasElement.height - 12) {
            settledPixels.push(p);
            if(settledPixels.length > 500) settledPixels.shift(); // 先进先出逻辑
            return false;
        }
        canvasCtx.globalAlpha = 1.0; canvasCtx.fillStyle = p.color;
        canvasCtx.fillText(p.char, getJitter(p.x), p.y);
        return true;
    });

    // 3. 轨迹绘制：取消透明渐变
    path = path.filter(p => {
        const age = now - p.time;
        if(age > 3500) { if(p.isFalling) fallingChars.push({...p}); return false; }
        canvasCtx.globalAlpha = 1.0; // 核心：保持完全不透明
        canvasCtx.fillStyle = p.color; canvasCtx.font = `${fSize}px serif`;
        canvasCtx.fillText(p.char, getJitter(p.x), getJitter(p.y));
        return true;
    });

    // 蝴蝶增强发光
    butterflies.forEach(b => {
        b.x += b.vx; b.y += b.vy; b.flap += 0.25;
        canvasCtx.save(); canvasCtx.translate(b.x, b.y); canvasCtx.scale(Math.abs(Math.sin(b.flap))+0.4, 1);
        canvasCtx.shadowColor = "white"; canvasCtx.shadowBlur = 25; canvasCtx.globalAlpha = 0.9;
        canvasCtx.drawImage(customSprite, -20, -20, 40, 40); canvasCtx.restore();
    });
    if(butterflies.length > 10) butterflies.shift();

    // TV 滤镜强化
    if(crtToggle.checked) {
        canvasCtx.fillStyle = crtColorInput.value + "66"; // 浓度提升
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