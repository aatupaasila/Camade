// editor.js

const canvas = document.getElementById("editorCanvas");
const ctx = canvas.getContext("2d");

const magicBtn = document.getElementById("tool-magic");
const lassoBtn = document.getElementById("tool-lasso");
const undoBtn = document.getElementById("tool-undo");
const resetBtn = document.getElementById("tool-reset");
const zoomInBtn = document.getElementById("tool-zoom-in");
const zoomOutBtn = document.getElementById("tool-zoom-out");
const saveBtn = document.getElementById("tool-save");

const thresholdPopup = document.getElementById("thresholdPopup");
const thresholdRange = document.getElementById("thresholdRange");

let currentTool = "magic";     // "magic" | "lasso"
let imageLoaded = false;

let baseImage = new Image();
let originalImageData = null;
let undoStack = [];

let zoomLevel = 1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

let lassoPoints = [];
let isLassoDrawing = false;

// ====== Alustus: lue pending-kuva localStoragesta ======

const pendingRaw = localStorage.getItem("pendingEditItem");
if (!pendingRaw) {
    alert("Ei muokattavaa kuvaa. Mene ensin upload-sivulle.");
} else {
    const pendingItem = JSON.parse(pendingRaw);
    baseImage.onload = () => {
        setupCanvasWithImage(baseImage);
    };
    baseImage.src = pendingItem.image; // base64
}

// ====== CANVAS INITIALISOINTI KUVAN KANSSA ======

function setupCanvasWithImage(img) {
    // skaalataan kuva editoriin sopivaksi
    const maxSize = 1200;
    let w = img.width;
    let h = img.height;

    const scale = Math.min(1, maxSize / Math.max(w, h));
    w = Math.round(w * scale);
    h = Math.round(h * scale);

    // canvas saa tämän koon
    canvas.width = w;
    canvas.height = h;

    // piirrä alkuperäinen kuva
    ctx.clearRect(0, 0, w, h);
    drawImageFitHeight(ctx, img, canvas);

    originalImageData = ctx.getImageData(0, 0, w, h);
    undoStack = [];
    imageLoaded = true;

    applyZoom();
}

// ====== HELPERS ======

function pushUndo() {
    if (!imageLoaded) return;
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStack.push(snapshot);
    if (undoStack.length > 15) undoStack.shift();
}

function restoreImageData(imgData) {
    ctx.putImageData(imgData, 0, 0);
}

function applyZoom() {
    canvas.style.transform = `scale(${zoomLevel})`;
}

// ====== TOOL VALINTA ======

function setTool(toolName) {
    currentTool = toolName;
    document.querySelectorAll(".tool-btn").forEach(btn => btn.classList.remove("active"));

    if (toolName === "magic") magicBtn.classList.add("active");
    if (toolName === "lasso") lassoBtn.classList.add("active");

    thresholdPopup.style.display = (toolName === "magic") ? "flex" : "none";

    if (toolName !== "lasso") {
        // resetoi mahdollinen keskeneräinen polku
        lassoPoints = [];
        isLassoDrawing = false;
    }
}

magicBtn.addEventListener("click", () => setTool("magic"));
lassoBtn.addEventListener("click", () => setTool("lasso"));

setTool("magic");

// ====== MOUSE KOORDIINAATIT (zoom huomioiden) ======

function getCanvasCoords(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (evt.clientX - rect.left) * scaleX;
    const y = (evt.clientY - rect.top) * scaleY;
    return { x: Math.floor(x), y: Math.floor(y) };
}

// ====== MAGIC ERASER (FLOOD FILL) ======

canvas.addEventListener("click", evt => {
    if (!imageLoaded) return;

    if (currentTool === "magic") {
        const { x, y } = getCanvasCoords(evt);
        pushUndo();
        magicEraseAt(x, y);
    } else if (currentTool === "lasso") {
        handleLassoClick(evt);
    }
});

function magicEraseAt(startX, startY) {
    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    const idx = (y, x) => (y * w + x) * 4;

    const startIndex = idx(startY, startX);
    const sr = data[startIndex];
    const sg = data[startIndex + 1];
    const sb = data[startIndex + 2];
    const sa = data[startIndex + 3];

    if (sa === 0) return; // jo läpinäkyvä

    const threshold = Number(thresholdRange.value); // 5-60

    const queue = [];
    const visited = new Uint8Array(w * h);
    queue.push({ x: startX, y: startY });
    visited[startY * w + startX] = 1;

    while (queue.length > 0) {
        const { x, y } = queue.shift();
        const i = idx(y, x);

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        const dr = r - sr;
        const dg = g - sg;
        const db = b - sb;
        const diff = Math.sqrt(dr * dr + dg * dg + db * db);

        if (diff <= threshold && a !== 0) {
            // tee pikselistä läpinäkyvä
            data[i + 3] = 0;

            // naapurit
            if (x > 0 && !visited[y * w + (x - 1)]) {
                visited[y * w + (x - 1)] = 1;
                queue.push({ x: x - 1, y });
            }
            if (x < w - 1 && !visited[y * w + (x + 1)]) {
                visited[y * w + (x + 1)] = 1;
                queue.push({ x: x + 1, y });
            }
            if (y > 0 && !visited[(y - 1) * w + x]) {
                visited[(y - 1) * w + x] = 1;
                queue.push({ x, y: y - 1 });
            }
            if (y < h - 1 && !visited[(y + 1) * w + x]) {
                visited[(y + 1) * w + x] = 1;
                queue.push({ x, y: y + 1 });
            }
        }
    }

    ctx.putImageData(imgData, 0, 0);
}

// ====== LASSO TOOL ======

function handleLassoClick(evt) {
    const { x, y } = getCanvasCoords(evt);

    if (!isLassoDrawing) {
        isLassoDrawing = true;
        lassoPoints = [{ x, y }];
    } else {
        lassoPoints.push({ x, y });
    }

    redrawWithLassoPreview();
}

// kaksoisklikillä suljetaan ja leikataan
canvas.addEventListener("dblclick", () => {
    if (currentTool !== "lasso" || !isLassoDrawing || lassoPoints.length < 3) return;
    pushUndo();
    applyLassoCut();
    isLassoDrawing = false;
    lassoPoints = [];
    redrawWithoutPreview();
});

function redrawWithLassoPreview() {
    // piirrä nykyinen kuva
    redrawWithoutPreview();

    // ja sen päälle lasso-polku
    if (!isLassoDrawing || lassoPoints.length < 2) return;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 0, 0.8)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
    for (let i = 1; i < lassoPoints.length; i++) {
        ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
    }
    ctx.stroke();
    ctx.restore();
}

function redrawWithoutPreview() {
    if (!imageLoaded) return;
    // piirrämme nykyisen canvaksen pixel-datan sellaisenaan,
    // joten tämä funktio on vain placeholder jos halutaan tulevaisuudessa
    // optimoida previewta. Nyt se ei muuta mitään.
}

function applyLassoCut() {
    const w = canvas.width;
    const h = canvas.height;

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // mask canvas
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = w;
    maskCanvas.height = h;
    const mctx = maskCanvas.getContext("2d");

    mctx.beginPath();
    mctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
    for (let i = 1; i < lassoPoints.length; i++) {
        mctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
    }
    mctx.closePath();
    mctx.fillStyle = "#fff";
    mctx.fill();

    const maskData = mctx.getImageData(0, 0, w, h).data;

    for (let i = 0; i < data.length; i += 4) {
        const alphaMask = maskData[i + 3];
        if (alphaMask === 0) {
            data[i + 3] = 0; // tee taustasta läpinäkyvä
        }
    }

    ctx.putImageData(imgData, 0, 0);
}

// ====== ZOOM ======

zoomInBtn.addEventListener("click", () => {
    zoomLevel = Math.min(MAX_ZOOM, zoomLevel + 0.25);
    applyZoom();
});

zoomOutBtn.addEventListener("click", () => {
    zoomLevel = Math.max(MIN_ZOOM, zoomLevel - 0.25);
    applyZoom();
});

// ====== UNDO / RESET ======

undoBtn.addEventListener("click", () => {
    if (!undoStack.length) return;
    const last = undoStack.pop();
    restoreImageData(last);
});

resetBtn.addEventListener("click", () => {
    if (!originalImageData) return;
    undoStack = [];
    restoreImageData(originalImageData);
});

// ====== SAVE → WARDROBE ======

saveBtn.addEventListener("click", () => {
    if (!imageLoaded) return;

    const pendingRaw = localStorage.getItem("pendingEditItem");
    if (!pendingRaw) {
        alert("Ei tallennettavaa itemiä.");
        return;
    }
    const pendingItem = JSON.parse(pendingRaw);

    const finalDataUrl = canvas.toDataURL("image/png");

    const wardrobeRaw = localStorage.getItem("wardrobe");
    const wardrobe = wardrobeRaw ? JSON.parse(wardrobeRaw) : [];

    wardrobe.push({
        name: pendingItem.name,
        category: pendingItem.category,
        image: finalDataUrl
    });

    localStorage.setItem("wardrobe", JSON.stringify(wardrobe));
    localStorage.removeItem("pendingEditItem");

    window.location.href = "wardrobe.html";
});
