const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const persistenceInput = document.getElementById('persistence');
const fontSizeInput = document.getElementById('fontSize');
const glowIntensityInput = document.getElementById('glowIntensity');
const startBtn = document.getElementById('startAudio');

let audioCtx = null, path = [], butterflies = [], fallingChars = [], settledPixels = [], lastPos = null, mouthCenter = null, isMouthOpen = false;

// 1. 激活音效与摄像头
startBtn.addEventListener('click', () => {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    startBtn.style.opacity = '0';
    setTimeout(() => startBtn.remove(), 500);
});

// 2. 空灵闪光碎片音效合成
const playSound = {
    // 碎片划过的清脆声
    trail: (speed) => {
        if (!audioCtx || speed < 20) return;
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine';
        // 极高频，营造晶体感
        const freq = Math.min(3500, 1500 + speed * 10);
        o.frequency.setValueAtTime(freq, audioCtx.currentTime);
        g.gain.setValueAtTime(0.03, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(); o.stop(audioCtx.currentTime + 0.05);
    },
    // 蝴蝶生成的灵动上升音
    butterfly: () => {
        if (!audioCtx) return;
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(800, audioCtx.currentTime);
        o.frequency.exponentialRampToValueAtTime(2400, audioCtx.currentTime + 0.6);
        g.gain.setValueAtTime(0.05, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(); o.stop(audioCtx.currentTime + 0.6);
    },
    // 吞噬时的空灵消散音
    eat: () => {
        if (!audioCtx) return;
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(1200, audioCtx.currentTime);
        o.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.3);
        g.gain.setValueAtTime(0.08, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(); o.stop(audioCtx.currentTime + 0.3);
    }
};

// 修长蝴蝶 SVG
const bImg = new Image();
bImg.src = `data:image/svg+xml;base64,${btoa(`<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M50 50 C20 -20 -20 30 25 55 C-10 90 40 100 50 80 C60 100 110 90 75 55 C120 30 80 -20 50 50Z" stroke="white" stroke-width="1.2" stroke-linejoin="round" /></svg>`)}`;

class Butterfly {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.vx = (Math.random()-0.5)*12; this.vy = (Math.random()-0.5)*12;
        this.flap = Math.random()*Math.PI; this.size = Math.random()*15+30;
    }
    update() {
        if (isMouthOpen && mouthCenter) {
            let dx = mouthCenter.x - this.x, dy = mouthCenter.y - this.y, d = Math.hypot(dx, dy);
            if (d < 250) { this.vx += dx*0.04; this.vy += dy*0.04; } // 被嘴巴强烈吸引
        }
        this.x += this.vx; this.y += this.vy; this.vx *= 0.96; this.vy *= 0.96;
        this.flap += 0.45;
        if (this.x < 0 || this.x > canvasElement.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvasElement.height) this.vy *= -1;
    }
    draw(g) {
        canvasCtx.save(); canvasCtx.translate(this.x, this.y);
        canvasCtx.rotate(Math.atan2(this.vy, this.vx) + Math.PI/2);
        canvasCtx.scale(Math.abs(Math.sin(this.flap)) + 0.2, 1);
        canvasCtx.shadowColor = "white"; canvasCtx.shadowBlur = g;
        canvasCtx.drawImage(bImg, -this.size/2, -this.size/2, this.size, this.size);
        canvasCtx.restore();
    }
}

function onResults(results) {
    if (canvasElement.width !== videoElement.videoWidth) {
        canvasElement.width = videoElement.videoWidth; canvasElement.height = videoElement.videoHeight;
    }
    
    // 关键修正：Canvas 内部镜像绘制背景视频
    canvasCtx.save();
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(videoElement, -canvasElement.width, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    const glow = parseFloat(glowIntensityInput.value);
    const colors = [document.getElementById('color1').value, document.getElementById('color2').value, document.getElementById('color3').value];

    // 面部/嘴巴检测
    if (results.faceLandmarks) {
        const up = results.faceLandmarks[13], down = results.faceLandmarks[14];
        mouthCenter = { x: (1 - up.x) * canvasElement.width, y: up.y * canvasElement.height }; // 注意镜像坐标计算
        isMouthOpen = Math.abs(up.y - down.y) > 0.045;
    }

    // 手势检测
    if (results.handLandmarks) {
        const tip = results.handLandmarks[8];
        const x = (1 - tip.x) * canvasElement.width, y = tip.y * canvasElement.height;
        if (lastPos) {
            const d = Math.hypot(x - lastPos.x, y - lastPos.y);
            playSound.trail(d);
            if (d > 90) { butterflies.push(new Butterfly(x, y)); playSound.butterfly(); }
        }
        lastPos = { x, y };
        path.push({ x, y, time: Date.now(), color: colors[Math.floor(Math.random()*3)], char: ["✧", "⊹", "✶", "†"][Math.floor(Math.random()*4)], isFalling: Math.random() < 0.25 });
    }
    render(glow);
}

function render(glow) {
    const now = Date.now(), dur = parseInt(persistenceInput.value), fSize = parseInt(fontSizeInput.value);

    // 下落与堆积逻辑
    fallingChars = fallingChars.filter(p => {
        p.y += 3; p.x += (Math.random()-0.5)*2;
        if (p.y >= canvasElement.height - 10) { settledPixels.push(p); return false; }
        canvasCtx.globalAlpha = 0.6; canvasCtx.fillStyle = p.color; canvasCtx.fillText(p.char, p.x, p.y); return true;
    });
    settledPixels.forEach(p => { canvasCtx.globalAlpha = 0.2; canvasCtx.fillText(p.char, p.x, p.y); });
    if (settledPixels.length > 300) settledPixels.shift();

    // 绘制实时轨迹
    path = path.filter(p => {
        const age = now - p.time;
        if (age > dur) { if (p.isFalling) fallingChars.push(p); return false; }
        canvasCtx.save();
        canvasCtx.globalAlpha = 1 - age/dur;
        canvasCtx.shadowBlur = glow; canvasCtx.shadowColor = p.color;
        canvasCtx.fillStyle = p.color; canvasCtx.font = `${fSize}px serif`;
        canvasCtx.fillText(p.char, p.x, p.y);
        canvasCtx.restore();
        return true;
    });

    // 绘制并检测吞食蝴蝶
    butterflies = butterflies.filter(b => {
        b.update();
        if (isMouthOpen && mouthCenter && Math.hypot(b.x - mouthCenter.x, b.y - mouthCenter.y) < 60) {
            playSound.eat(); return false; 
        }
        b.draw(glow); return true;
    });
    if (butterflies.length > 25) butterflies.shift();
}

// MediaPipe 同步逻辑优化
const hands = new Hands({locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`});
hands.setOptions({maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6});
const faceMesh = new FaceMesh({locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`});
faceMesh.setOptions({maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.6});

let lastHand = null;
hands.onResults(res => { lastHand = res.multiHandLandmarks ? res.multiHandLandmarks[0] : null; });
faceMesh.onResults(res => {
    onResults({ handLandmarks: lastHand, faceLandmarks: res.multiFaceLandmarks ? res.multiFaceLandmarks[0] : null });
});

const camera = new Camera(videoElement, {
    onFrame: async () => { await hands.send({image: videoElement}); await faceMesh.send({image: videoElement}); },
    width: 1280, height: 720
});
camera.start();