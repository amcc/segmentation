let bodySegmentation;
let segmentationResult;

let capture;
let camWidth = 0;
let camHeight = 0;
let cameraFrameBuffer;
let maskedOutput;
let latestMaskContour = null;
let maskOutlineHelper;

const FIT_MODE = "COVER"; // Options: COVER, CONTAIN, FILL

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

function gotResults(result) {
  // 🎯 Latest model output (includes mask canvas)
  segmentationResult = result;
}

function draw() {
  // 🖼️ Compose final frame: camera + segmentation mask
  background(255, 100, 100);

  if (!cameraFrameBuffer || !capture) return;

  cameraFrameBuffer.clear();
  cameraFrameBuffer.image(
    capture,
    0,
    0,
    cameraFrameBuffer.width,
    cameraFrameBuffer.height,
  );

  let outputFrame = cameraFrameBuffer;

  if (segmentationResult && maskedOutput) {
    const maskCanvas = segmentationResult?.mask?.canvas;
    if (maskCanvas) {
      const mctx = maskedOutput.drawingContext;
      maskedOutput.clear();
      mctx.drawImage(
        cameraFrameBuffer.canvas,
        0,
        0,
        maskedOutput.width,
        maskedOutput.height,
      );
      mctx.globalCompositeOperation = "destination-in";
      mctx.drawImage(maskCanvas, 0, 0, maskedOutput.width, maskedOutput.height);
      mctx.globalCompositeOperation = "source-over";

      const contour = maskOutlineHelper?.extractLargestMaskContour(
        maskCanvas,
        camWidth,
        camHeight,
      );
      if (contour && contour.length > 2) {
        latestMaskContour = contour;
      }
      if (latestMaskContour && latestMaskContour.length > 2) {
        maskOutlineHelper?.drawSmoothContour(maskedOutput, latestMaskContour);
      }

      outputFrame = maskedOutput;
    }
  }

  image(
    outputFrame,
    0,
    0,
    width,
    height,
    0,
    0,
    outputFrame.width,
    outputFrame.height,
    CONTAIN,
  );
}

function captureWebcam() {
  // 📱 Start camera stream (front camera by default)
  capture = createCapture(
    {
      audio: false,
      video: {
        facingMode: "user",
      },
    },
    setCameraDimensions,
  );
  capture.elt.setAttribute("playsinline", "");
  capture.hide();
}

function setCameraDimensions() {
  // ✅ Wait for real decoded video size, then allocate buffers
  const vid = capture.elt;

  const waitForVideoSize = setInterval(() => {
    if (vid.videoWidth > 0 && vid.videoHeight > 0) {
      clearInterval(waitForVideoSize);
      camWidth = vid.videoWidth;
      camHeight = vid.videoHeight;
      capture.size(camWidth, camHeight);

      // Offscreen buffers: model input + masked output.
      // Why buffer the camera first?
      // - On some iOS front-camera paths, orientation metadata and pixel data
      //   can disagree.
      // - Feeding the buffered frame to the model keeps orientation stable.
      // - `cameraFrameBuffer` is model input.
      // - `maskedOutput` is the composited render target.
      cameraFrameBuffer = createGraphics(camWidth, camHeight);
      cameraFrameBuffer.pixelDensity(1);
      maskedOutput = createGraphics(camWidth, camHeight);
      maskedOutput.pixelDensity(1);
      maskOutlineHelper = createMaskOutlineHelper({
        // Lower = finer contour detail, higher CPU cost.
        // Increase for better fingers/hands, decrease for performance.
        downsample: 4,
        // Mask cutoff (0-255). Higher = tighter/smaller mask, lower = fuller mask.
        threshold: 127,
        // Outline stroke thickness in pixels.
        weight: 5,
        // Outline stroke color.
        color: "#00e5ff",
        // 0.0-0.95 smoothing blend. Higher = steadier but more lag.
        temporalSmoothing: 0.35,
        // Number of contour samples used for smoothing/alignment.
        // Higher = smoother/cleaner path, slightly more CPU work.
        targetPoints: 120,
      });

      // Start segmentation from camera frame buffer
      bodySegmentation.detectStart(cameraFrameBuffer.canvas, gotResults);
    }
  }, 50);
}
