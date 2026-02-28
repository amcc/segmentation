let bodySegmentation;
let segmentationResult;

let capture;
let captureEvent;
let camWidth = 0;
let camHeight = 0;
let loadedCamera;
let isFrontCamera = true;
let cameraFrameBuffer;
let maskedOutput;
const CANVAS_FIT_MODE = "contain"; // "contain" = no crop, "cover" = fill + crop

function preload() {
  // 🧠 Load segmentation model before setup starts
  bodySegmentation = ml5.bodySegmentation("SelfieSegmentation");
}

function setup() {
  pixelDensity(1);
  createCanvas(windowWidth, windowHeight);
  captureWebcam();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function getFittedRect(srcW, srcH, dstW, dstH, mode = "contain") {
  // 📐 Fit source into destination while preserving aspect ratio
  const scale =
    mode === "cover"
      ? Math.max(dstW / srcW, dstH / srcH)
      : Math.min(dstW / srcW, dstH / srcH);

  const w = srcW * scale;
  const h = srcH * scale;

  return {
    x: (dstW - w) * 0.5,
    y: (dstH - h) * 0.5,
    w,
    h,
  };
}

function gotResults(result) {
  // 🎯 Latest model output (includes mask canvas)
  segmentationResult = result;
}

function draw() {
  // 🎥 Copy live camera frame into the model input buffer
  background(0);
  if (cameraFrameBuffer && capture) {
    cameraFrameBuffer.clear();
    cameraFrameBuffer.image(
      capture,
      0,
      0,
      cameraFrameBuffer.width,
      cameraFrameBuffer.height,
    );
  }
  if (loadedCamera && capture) makeSegmentationImage();
}

function makeSegmentationImage() {
  // 🖼️ Compose final frame: camera + segmentation mask
  background(255, 100, 100);

  const sourceW = cameraFrameBuffer?.width || camWidth;
  const sourceH = cameraFrameBuffer?.height || camHeight;
  if (!sourceW || !sourceH) return;

  const fitted = getFittedRect(
    sourceW,
    sourceH,
    width,
    height,
    CANVAS_FIT_MODE,
  );

  if (segmentationResult && cameraFrameBuffer && maskedOutput) {
    const maskCanvas = segmentationResult?.mask?.canvas;
    if (!maskCanvas) return;

    // 1) Draw camera frame
    const mctx = maskedOutput.drawingContext;
    maskedOutput.clear();
    mctx.drawImage(
      cameraFrameBuffer.canvas,
      0,
      0,
      maskedOutput.width,
      maskedOutput.height,
    );

    // 2) Keep only pixels where mask exists
    mctx.globalCompositeOperation = "destination-in";
    mctx.drawImage(maskCanvas, 0, 0, maskedOutput.width, maskedOutput.height);

    // 3) Reset blend mode and draw to main canvas
    mctx.globalCompositeOperation = "source-over";

    image(maskedOutput, fitted.x, fitted.y, fitted.w, fitted.h);
    return;
  }

  // Fallback: show raw camera frame buffer if mask isn't ready yet
  if (cameraFrameBuffer) {
    image(cameraFrameBuffer, fitted.x, fitted.y, fitted.w, fitted.h);
  }
}

function captureWebcam() {
  // 📱 Start camera stream (front camera by default)
  isFrontCamera = true;

  capture = createCapture(
    {
      audio: false,
      video: {
        facingMode: isFrontCamera ? "user" : "environment",
      },
    },
    function (e) {
      captureEvent = e;
      setCameraDimensions();
    },
  );
  capture.elt.setAttribute("playsinline", "");
  capture.hide();
}

function setCameraDimensions() {
  // ✅ Wait for real decoded video size, then allocate matching buffers
  loadedCamera = captureEvent.getTracks()[0].getSettings();
  console.log("cameraDimensions", loadedCamera);

  const vid = capture.elt;

  const waitForVideoSize = setInterval(() => {
    if (vid.videoWidth > 0 && vid.videoHeight > 0) {
      clearInterval(waitForVideoSize);
      camWidth = vid.videoWidth;
      camHeight = vid.videoHeight;
      console.log("actual video size", camWidth, camHeight);
      console.log("capture", capture);
      capture.size(camWidth, camHeight);

      // Offscreen buffers: model input + masked output
      cameraFrameBuffer = createGraphics(camWidth, camHeight);
      cameraFrameBuffer.pixelDensity(1);
      maskedOutput = createGraphics(camWidth, camHeight);
      maskedOutput.pixelDensity(1);

      // Start segmentation from the same buffer used for rendering
      bodySegmentation.detectStart(cameraFrameBuffer.canvas, gotResults);
      loadedCamera = true;
    }
  }, 50);
}
