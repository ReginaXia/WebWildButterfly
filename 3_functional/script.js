const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const persistenceInput = document.getElementById('persistence');
const fontSizeInput = document.getElementById('fontSize');
const glowIntensityInput = document.getElementById('glowIntensity');
const startBtn = document.getElementById('startAudio');

let audioCtx = null, path = [], butterflies = [], lastPos = null;

// --- 空灵闪烁音效 ---
startBtn.addEventListener('click', () => {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    startBtn.style.display = 'none';
});

const playCrystalSound = (freq, vol = 0.02) => {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.05);
};

// --- 上一版修长蝴蝶 ---
const butterflyImg = new Image();
butterflyImg.src = `data:image/svg+xml;base64,${btoa(`
<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 50 C20 -20 -20 30 25 55 C-10 90 40 100 50 80 C60 100 110 90 75 55 C120 30 80 -20 50 50Z" 
          stroke="white" stroke-width="1.2" stroke-linejoin="round" />
</svg>`)}`;

class Butterfly {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.vx = (Math.random()-0.5)*10; this.vy = (Math.random()-0.5)*10;
        this.flap = Math.random()*Math.PI; this.size = Math.random()*15+30;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.vx *= 0.98; this.vy *= 0.98;
        this.flap += 0.4;
        if (this.x < 0 || this.x > canvasElement.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvasElement.height) this.vy *= -1;
    }
    draw(glow) {
        canvasCtx.save();
        canvasCtx.translate(this.x, this.y);
        canvasCtx.scale(Math.abs(Math.sin(this.flap)) + 0.2, 1);
        canvasCtx.shadowBlur = glow; canvasCtx.shadowColor = "white";
        canvasCtx.drawImage(butterflyImg, -this.size/2, -this.size/2, this.size, this.size);
        canvasCtx.restore();
    }
}

function onResults(results) {
    // 动态调整画布尺寸
    if (canvasElement.width !== videoElement.videoWidth) {
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
    }

    // --- 关键修复：绘制人影背景 ---
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    // 调色盘
    const colors = ["#ADD8E6", "#FFFFFF", "#FFB6C1"];
    const glow = parseFloat(glowIntensityInput.value);

    if (results.multiHandLandmarks?.[0]) {
        const tip = results.multiHandLandmarks[0][8];
        const x = tip.x * canvasElement.width;
        const y = tip.y * canvasElement.height;

        if (lastPos) {
            const dist = Math.hypot(x - lastPos.x, y - lastPos.y);
            if (dist > 15) playCrystalSound(2000 + dist * 5); // 移动时的清脆声
            if (dist > 80) {
                butterflies.push(new Butterfly(x, y));
                playCrystalSound(800, 0.05); // 生成蝴蝶声
            }
        }
        lastPos = { x, y };
        path.push({ x, y, time: Date.now(), color: colors[Math.floor(Math.random()*3)], char: ["✧", "⊹", "†"][Math.floor(Math.random()*3)] });
    }

    render(glow);
}

function render(glow) {
    const now = Date.now(), dur = parseInt(persistenceInput.value), fSize = parseInt(fontSizeInput.value);

    // 绘制轨迹
    path = path.filter(p => {
        const age = now - p.time;
        if (age > dur) return false;
        canvasCtx.save();
        canvasCtx.globalAlpha = 1 - age / dur;
        if (age < 300) { canvasCtx.shadowBlur = glow; canvasCtx.shadowColor = p.color; }
        canvasCtx.fillStyle = p.color;
        canvasCtx.font = `${fSize}px serif`;
        canvasCtx.fillText(p.char, p.x, p.y);
        canvasCtx.restore();
        return true;
    });

    // 绘制蝴蝶
    butterflies.forEach(b => { b.update(); b.draw(glow); });
    if (butterflies.length > 20) butterflies.shift();
}

// MediaPipe 初始化
const hands = new Hands({locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`});
hands.setOptions({maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.6});
hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => { await hands.send({image: videoElement}); },
    width: 640, height: 480 // 降低识别分辨率以换取极致流畅度
});
camera.start();