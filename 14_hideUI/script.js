const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// --- UI 引用 ---
const darkBgInput = document.getElementById('darkBg');
const crtToggle = document.getElementById('crtToggle');
const crtColorInput = document.getElementById('crtColor');
const showBioHandInput = document.getElementById('showBioHand');
const handColorInput = document.getElementById('handColor');
const handCodeSizeInput = document.getElementById('handCodeSize');
const jitterBioInput = document.getElementById('jitterBio');
const ascColor1 = document.getElementById('ascColor1');
const ascColor2 = document.getElementById('ascColor2');
const ascColor3 = document.getElementById('ascColor3');
const fontSizeInput = document.getElementById('fontSize');
const jitterInput = document.getElementById('jitterIntensity');
const startBtn = document.getElementById('startAudio');
const uiPanel = document.getElementById('uiPanel');
const togglePanelBtn = document.getElementById('togglePanel');
const statusPill = document.getElementById('statusPill');
const onboarding = document.getElementById('onboarding');
const beginExperienceBtn = document.getElementById('beginExperience');
const dismissGuideBtn = document.getElementById('dismissGuide');

// --- 核心资产 ---
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
let hasSeenHand = false;
let cameraStarted = false;
let lastHandSeenAt = 0;
let hideStatusTimeout = null;
let panelVisible = true;

const setStatus = (label, message, persist = false) => {
    statusPill.innerHTML = `<strong>${label}</strong>${message}`;
    statusPill.classList.remove('hidden');
    if (hideStatusTimeout) clearTimeout(hideStatusTimeout);
    if (!persist) {
        hideStatusTimeout = setTimeout(() => statusPill.classList.add('hidden'), 3200);
    }
};

const hideOnboarding = () => onboarding.classList.add('hidden');

const setPanelVisibility = (visible) => {
    panelVisible = visible;
    uiPanel.classList.toggle('is-hidden', !visible);
    togglePanelBtn.textContent = visible ? 'Hide Controls' : 'Show Controls';
};

// --- 蝴蝶 PNG ---
let customSprite = new Image();
customSprite.src = `data:image/svg+xml;base64,${btoa('<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M50 50 C20 -20 -20 30 25 55 C-10 90 40 100 50 80 C60 100 110 90 75 55 C120 30 80 -20 50 50Z" stroke="white" stroke-width="2" /></svg>')}`;

window.setMode = (m) => {
    currentPool = MODES[m];
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.innerText.toLowerCase() === m));
};

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

function drawBioHand(landmarks) {
    if(!showBioHandInput.checked) return;

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
            const offsetX = (Math.sin(x * 0.5 + y * 0.2) * jitter);
            const offsetY = (Math.cos(y * 0.5 + x * 0.2) * jitter);

            if(points.some(p => Math.hypot(p.x - (x + offsetX), p.y - (y + offsetY)) < 26)) {
                const phase = (x * 0.1) + (y * 0.1);
                const breathe = Math.sin((Date.now() * 0.005) + phase) * 0.5 + 0.5;
                canvasCtx.globalAlpha = breathe * 0.8;
                canvasCtx.shadowBlur = 15 * breathe;
                canvasCtx.shadowColor = color;
                canvasCtx.fillStyle = (breathe > 0.8) ? '#fff' : color;
                canvasCtx.fillText(Math.random() > 0.5 ? '1' : '0', x + offsetX, y + offsetY);
            }
        }
    }
    canvasCtx.restore();
}

function onResults(results) {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    canvasCtx.save(); canvasCtx.scale(-1, 1); canvasCtx.translate(-canvasElement.width, 0);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    if(darkBgInput.checked) { canvasCtx.fillStyle='black'; canvasCtx.fillRect(0,0,canvasElement.width,canvasElement.height); }

    const now = Date.now();
    const jIntensity = parseFloat(jitterInput.value);
    const getJitter = (v) => v + (Math.random()-0.5) * jIntensity;
    const fSize = parseInt(fontSizeInput.value);
    const currentPalette = [ascColor1.value, ascColor2.value, ascColor3.value];

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        lastHandSeenAt = now;
        if (!hasSeenHand) {
            hasSeenHand = true;
            setStatus('Tracking', '手势已捕捉到。移动食指来绘制你的第一条轨迹。');
        }
        for (const landmarks of results.multiHandLandmarks) {
            drawBioHand(landmarks);
            const x = (1-landmarks[8].x)*canvasElement.width, y = landmarks[8].y*canvasElement.height;
            if(lastPos && Math.hypot(x-lastPos.x, y-lastPos.y) > 15) {
                playSound(x);
                if(Math.random()>0.85) butterflies.push({x, y, vx:(Math.random()-0.5)*5, vy:(Math.random()-0.5)*5, flap:0});
            }
            lastPos = {x, y};
            path.push({
                x, y, time: now,
                char: MATRIX_CHARS[Math.floor(Math.random()*4)],
                color: currentPalette[Math.floor(Math.random()*3)],
                isFalling: Math.random()<0.2
            });
        }
    } else if (cameraStarted) {
        lastPos = null;
        if (!hasSeenHand) {
            setStatus('Waiting For Hand', '把一只手放到镜头中央，保持光线充足，食指更容易被追踪。', true);
        } else if (now - lastHandSeenAt > 1800) {
            setStatus('Lost Tracking', '手暂时离开画面了，重新回到镜头前就会继续。', true);
        }
    }

    settledPixels.forEach(p => {
        canvasCtx.globalAlpha = 0.4; canvasCtx.fillStyle = p.color; canvasCtx.font = `${fSize * 0.8}px serif`;
        canvasCtx.fillText(p.char, getJitter(p.x), p.y);
    });

    fallingChars = fallingChars.filter(p => {
        p.y += 4;
        if(p.y > canvasElement.height - 12) {
            settledPixels.push(p);
            if(settledPixels.length > 500) settledPixels.shift();
            return false;
        }
        canvasCtx.globalAlpha = 1.0; canvasCtx.fillStyle = p.color;
        canvasCtx.fillText(p.char, getJitter(p.x), p.y);
        return true;
    });

    path = path.filter(p => {
        const age = now - p.time;
        if(age > 3500) { if(p.isFalling) fallingChars.push({...p}); return false; }
        canvasCtx.globalAlpha = 1.0;
        canvasCtx.fillStyle = p.color; canvasCtx.font = `${fSize}px serif`;
        canvasCtx.fillText(p.char, getJitter(p.x), getJitter(p.y));
        return true;
    });

    butterflies.forEach(b => {
        b.x += b.vx; b.y += b.vy; b.flap += 0.25;
        canvasCtx.save(); canvasCtx.translate(b.x, b.y); canvasCtx.scale(Math.abs(Math.sin(b.flap))+0.4, 1);
        canvasCtx.shadowColor = 'white'; canvasCtx.shadowBlur = 25; canvasCtx.globalAlpha = 0.9;
        canvasCtx.drawImage(customSprite, -20, -20, 40, 40); canvasCtx.restore();
    });
    if(butterflies.length > 10) butterflies.shift();

    if(crtToggle.checked) {
        canvasCtx.fillStyle = crtColorInput.value + '66';
        for (let i = 0; i < canvasElement.height; i += 3) canvasCtx.fillRect(0, i + (scanline % 3), canvasElement.width, 1);
        scanline++;
    }
}

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
hands.onResults(onResults);
const camera = new Camera(videoElement, { onFrame: async () => { await hands.send({image: videoElement}); }, width: 640, height: 480 });

beginExperienceBtn.onclick = () => {
    hideOnboarding();
    setStatus('Ready', '点击 Start 开启镜头。第一次启动时，浏览器会请求权限。', true);
};

dismissGuideBtn.onclick = () => {
    hideOnboarding();
    setStatus('Ready', '你可以随时开始。左上角会保留状态提示与面板开关。', false);
};

togglePanelBtn.onclick = () => {
    setPanelVisibility(!panelVisible);
};

startBtn.onclick = async () => {
    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';
    setStatus('Connecting', '正在请求摄像头与声音权限，请在浏览器弹窗中点允许。', true);
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        await camera.start();
        cameraStarted = true;
        hideOnboarding();
        setStatus('Live', '镜头已开启。把手放到画面中央，开始移动吧。', true);
        startBtn.remove();
    } catch (error) {
        startBtn.disabled = false;
        startBtn.textContent = 'Retry Start';
        setStatus('Permission Needed', '镜头未成功开启。请允许摄像头权限后再试一次。', true);
        console.error(error);
    }
};
