const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

const persistenceInput = document.getElementById('persistence');
const fontSizeInput = document.getElementById('fontSize');
const glowIntensityInput = document.getElementById('glowIntensity');
const startBtn = document.getElementById('startAudio');

const Y2K_PALETTE = ["#ADD8E6", "#FFFFFF", "#FFB6C1"]; 

let path = [];
let butterflies = [];
let fallingChars = []; 
let settledPixels = []; 
let lastPos = null;
let audioCtx = null;

// --- 音频初始化引擎 ---
const initAudio = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        startBtn.style.opacity = '0';
        setTimeout(() => startBtn.remove(), 500);
    }
};
startBtn.addEventListener('click', initAudio);

// --- 空灵音效合成器 ---
const playSound = {
    trail: () => {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2500 + Math.random() * 1500, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.05);
    },
    butterfly: () => {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(3000, audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.3);
    }
};

// 蝴蝶素材
const butterflyImg = new Image();
butterflyImg.src = `data:image/svg+xml;base64,${btoa(`
<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 50 C20 -20 -20 30 25 55 C-10 90 40 100 50 80 C60 100 110 90 75 55 C120 30 80 -20 50 50Z" 
          stroke="white" stroke-width="1.2" stroke-linejoin="round" />
    <path d="M50 55 Q45 35 40 20 M50 55 Q55 35 60 20" stroke="white" stroke-width="0.8" />
</svg>`)}`;

class Butterfly {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8;
        this.flap = Math.random() * Math.PI;
        this.size = Math.random() * 20 + 35;
    }
    update() {
        if (Math.random() > 0.95) {
            this.vx += (Math.random() - 0.5) * 12;
            this.vy += (Math.random() - 0.5) * 12;
        }
        this.vx *= 0.97; this.vy *= 0.97;
        this.x += this.vx; this.y += this.vy;
        this.flap += 0.4;
        if (this.x < 0 || this.x > canvasElement.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvasElement.height) this.vy *= -1;
    }
    draw() {
        canvasCtx.save();
        canvasCtx.translate(this.x, this.y);
        canvasCtx.rotate(Math.atan2(this.vy, this.vx) + Math.PI/2);
        canvasCtx.scale(Math.abs(Math.sin(this.flap)) + 0.15, 1);
        canvasCtx.shadowColor = "rgba(255,255,255,0.9)";
        canvasCtx.shadowBlur = parseFloat(glowIntensityInput.value) * 1.5;
        canvasCtx.drawImage(butterflyImg, -this.size/2, -this.size/2, this.size, this.size);
        canvasCtx.restore();
    }
}

// 合并后的逻辑函数
function onResults(results) {
    if (canvasElement.width !== videoElement.videoWidth) {
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
    }

    // 1. 绘制摄像头画面 (解决黑屏的关键)
    canvasCtx.save();
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            const indexTip = landmarks[8];
            const x = indexTip.x * canvasElement.width;
            const y = indexTip.y * canvasElement.height;

            // 触发蝴蝶与音效
            if (lastPos && Math.hypot(x - lastPos.x, y - lastPos.y) > 75) {
                butterflies.push(new Butterfly(x, y));
                playSound.butterfly();
            }
            
            if (!lastPos || Math.hypot(x - lastPos.x, y - lastPos.y) > 10) {
                playSound.trail();
            }

            lastPos = { x, y };

            // 恢复轨迹生成逻辑
            path.push({
                x, y,
                time: Date.now(),
                char: ["†", "✧", "⊹", "♱", "☾", "1", "0"][Math.floor(Math.random()*7)],
                color: Y2K_PALETTE[Math.floor(Math.random()*3)],
                isFalling: Math.random() < 0.4,
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
    const glowIntensity = parseFloat(glowIntensityInput.value);

    // 绘制底部堆积
    settledPixels.forEach(p => {
        canvasCtx.save();
        canvasCtx.globalAlpha = 0.3;
        canvasCtx.fillStyle = p.color;
        canvasCtx.font = `${fSize * 0.7}px serif`;
        canvasCtx.fillText(p.char, p.x, p.y);
        canvasCtx.restore();
    });

    // 掉落逻辑
    fallingChars = fallingChars.filter(p => {
        p.y += p.speed;
        p.x += (Math.random() - 0.5) * 2;
        p.speed += 0.1;
        if (p.y >= canvasElement.height - 10) {
            settledPixels.push(p);
            if (settledPixels.length > 500) settledPixels.shift();
            return false;
        }
        canvasCtx.save();
        canvasCtx.shadowColor = p.color;
        canvasCtx.shadowBlur = glowIntensity * 0.5;
        canvasCtx.globalAlpha = 0.6;
        canvasCtx.fillStyle = p.color;
        canvasCtx.font = `${fSize * 0.8}px serif`;
        canvasCtx.fillText(p.char, p.x, p.y);
        canvasCtx.restore();
        return true;
    });

    // 实时轨迹
    path = path.filter(p => {
        const age = now - p.time;
        if (age > duration) {
            if (p.isFalling) { p.speed = 1.0; fallingChars.push(p); }
            return false;
        }
        const opacity = 1 - age / duration;
        canvasCtx.save();
        const flicker = Math.abs(Math.sin(now / 50 + p.glowOffset)) * 0.5 + 0.5;
        canvasCtx.shadowColor = p.color;
        canvasCtx.shadowBlur = glowIntensity * flicker;
        canvasCtx.globalAlpha = opacity;
        canvasCtx.fillStyle = p.color;
        canvasCtx.font = `${fSize}px serif`;
        canvasCtx.fillText(p.char, p.x, p.y);
        canvasCtx.restore();
        return true;
    });

    // 蝴蝶
    butterflies.forEach(b => { b.update(); b.draw(); });
    if(butterflies.length > 15) butterflies.shift();
}

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
hands.onResults(onResults);
const camera = new Camera(videoElement, { onFrame: async () => { await hands.send({image: videoElement}); }, width: 640, height: 480 });
camera.start();