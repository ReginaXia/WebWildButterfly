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

// --- 极简稳健的音频初始化 ---
const initAudio = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    audioCtx.resume().then(() => {
        startBtn.style.background = "linear-gradient(45deg, #ADD8E6, #FFFFFF)";
        startBtn.innerText = "DREAM ACTIVATED ✧";
        setTimeout(() => startBtn.remove(), 500);
    });
};
startBtn.addEventListener('click', initAudio);

// --- 纯净高音 Ethereal Glow 引擎 ---
const playPopMagicSound = {
    // 提升至高频音阶 (C5 - C7)
    chordPool: [523.25, 659.25, 783.99, 987.77, 1046.50, 1318.51, 1567.98, 2093.00],

    play: (xPos) => {
        if (!audioCtx || audioCtx.state !== 'running') return;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const panner = audioCtx.createStereoPanner();

        // 随机抽取高音
        const baseFreq = playPopMagicSound.chordPool[Math.floor(Math.random() * playPopMagicSound.chordPool.length)];
        
        osc.type = 'sine'; // 永远使用正弦波保证空灵感
        osc.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);
        
        // 增加微小的频率上扬，模拟灵气升腾的感觉
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.01, audioCtx.currentTime + 3.0);

        panner.pan.value = (xPos / canvasElement.width) * 2 - 1;

        // 设置长拖尾包络
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.2); // 柔和切入
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 3.5); // 3.5秒超长淡出

        osc.connect(gain);
        gain.connect(panner);
        panner.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 4.0);
    }
};

// 蝴蝶素材
const butterflyImg = new Image();
butterflyImg.src = `data:image/svg+xml;base64,${btoa(`
<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 50 C20 -20 -20 30 25 55 C-10 90 40 100 50 80 C60 100 110 90 75 55 C120 30 80 -20 50 50Z" 
          stroke="white" stroke-width="1" stroke-opacity="0.8" />
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
        this.vx *= 0.98; this.vy *= 0.98;
        this.x += this.vx; this.y += this.vy;
        this.flap += 0.3;
        if (this.x < 0 || this.x > canvasElement.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvasElement.height) this.vy *= -1;
    }
    draw() {
        canvasCtx.save();
        canvasCtx.translate(this.x, this.y);
        canvasCtx.scale(Math.abs(Math.sin(this.flap)) + 0.2, 1);
        canvasCtx.shadowBlur = 15; canvasCtx.shadowColor = "white";
        canvasCtx.globalAlpha = 0.5;
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
                
                // 移动触发：完全使用长拖尾 Glow 音效
                if (dist > 15 && Math.random() > 0.7) {
                    playPopMagicSound.play(x);
                }
                
                // 蝴蝶生成时额外叠加一个极高音
                if (dist > 75) {
                    butterflies.push(new Butterfly(x, y));
                    playPopMagicSound.play(x); 
                }
            }

            lastPos = { x, y };
            path.push({
                x, y, time: Date.now(),
                char: ["✧", "⊹", "✶", "†"][Math.floor(Math.random()*4)],
                color: Y2K_PALETTE[Math.floor(Math.random()*3)],
                isFalling: Math.random() < 0.3,
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

    settledPixels.forEach(p => {
        canvasCtx.save(); canvasCtx.globalAlpha = 0.15;
        canvasCtx.fillStyle = p.color; canvasCtx.font = `${fSize * 0.7}px serif`;
        canvasCtx.fillText(p.char, p.x, p.y); canvasCtx.restore();
    });

    fallingChars = fallingChars.filter(p => {
        p.y += p.speed; p.speed += 0.08;
        if (p.y >= canvasElement.height - 10) {
            settledPixels.push(p); if (settledPixels.length > 300) settledPixels.shift();
            return false;
        }
        canvasCtx.save(); canvasCtx.fillStyle = p.color;
        canvasCtx.font = `${fSize * 0.8}px serif`;
        canvasCtx.fillText(p.char, p.x, p.y); canvasCtx.restore();
        return true;
    });

    path = path.filter(p => {
        const age = now - p.time;
        if (age > duration) {
            if (p.isFalling) { p.speed = 0.6; fallingChars.push(p); }
            return false;
        }
        const opacity = 1 - age / duration;
        canvasCtx.save();
        canvasCtx.shadowColor = p.color;
        canvasCtx.shadowBlur = glowIntensity * (Math.abs(Math.sin(now / 50 + p.glowOffset)) * 0.5 + 0.5);
        canvasCtx.globalAlpha = opacity; canvasCtx.fillStyle = p.color;
        canvasCtx.font = `${fSize}px serif`;
        canvasCtx.fillText(p.char, p.x, p.y); canvasCtx.restore();
        return true;
    });

    butterflies.forEach(b => { b.update(); b.draw(); });
    if(butterflies.length > 15) butterflies.shift();
}

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
hands.onResults(onResults);
const camera = new Camera(videoElement, { onFrame: async () => { await hands.send({image: videoElement}); }, width: 640, height: 480 });
camera.start();