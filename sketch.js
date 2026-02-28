let bodySegmentation;
let segmentation;

let capture;
let captureEvent;
let camWidth = 0;
let camHeight = 0;
let loadedCamera;
let isFrontCamera = true;
let segmentationInput;
let maskedOutput;

function preload() {
  bodySegmentation = ml5.bodySegmentation("SelfieSegmentation");
  // or "BodyPix" for body part masks
}

function setup() {
  pixelDensity(1);
  createCanvas(windowWidth, windowHeight);
  captureWebcam();
}

function windowResized() {
  // Canvas stays at camera size; CSS scales it to fill the window.
  // No-op here unless we want to recapture.
}

function gotResults(result) {
  segmentation = result;
}

function draw() {
  background(0);
  if (segmentationInput && capture) {
    segmentationInput.clear();
    segmentationInput.push();
    segmentationInput.translate(
      segmentationInput.width / 2,
      segmentationInput.height / 2,
    );
    // segmentationInput.rotate(HALF_PI);
    segmentationInput.image(capture, 0, 0, camWidth, camHeight);
    segmentationInput.pop();
  }
  if (loadedCamera && capture) makeSegmentationImage();
}

function makeSegmentationImage() {
  background(255, 100, 100);
  if (segmentation && segmentationInput && maskedOutput) {
    const maskCanvas = segmentation?.mask?.canvas;
    if (!maskCanvas) return;

    const mctx = maskedOutput.drawingContext;
    maskedOutput.clear();
    mctx.drawImage(
      segmentationInput.canvas,
      0,
      0,
      maskedOutput.width,
      maskedOutput.height,
    );
    mctx.globalCompositeOperation = "destination-in";
    mctx.drawImage(maskCanvas, 0, 0, maskedOutput.width, maskedOutput.height);
    mctx.globalCompositeOperation = "source-over";

    image(maskedOutput, 0, 0);
  }
}

function captureWebcam() {
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
      // do things when video ready
      // until then, the video element will have no dimensions, or default 640x480
      setCameraDimensions();
    },
  );
  capture.elt.setAttribute("playsinline", "");
  capture.hide();
}

function setCameraDimensions() {
  loadedCamera = captureEvent.getTracks()[0].getSettings();
  console.log("cameraDimensions", loadedCamera);

  // Use the actual decoded video dimensions — these always match what's drawn
  const vid = capture.elt;

  // videoWidth/videoHeight may be 0 briefly; poll until they settle
  const waitForVideoSize = setInterval(() => {
    if (vid.videoWidth > 0 && vid.videoHeight > 0) {
      clearInterval(waitForVideoSize);
      camWidth = vid.videoWidth;
      camHeight = vid.videoHeight;
      console.log("actual video size", camWidth, camHeight);
      console.log("capture", capture);
      // Set the p5 capture size so ml5 uses the correct dimensions when
      // resizing its input tensor — without this, ml5 gets wrong dimensions
      // on mobile and produces a misoriented mask.
      capture.size(camWidth, camHeight);
      // Resize canvas to match camera exactly — transforms and mask alignment
      // are all relative to the camera's native dimensions, not the window.
      // CSS in style.css scales the canvas element to fill the window.
      // resizeCanvas(camWidth, camHeight);
      segmentationInput = createGraphics(camHeight, camWidth);
      segmentationInput.pixelDensity(1);
      segmentationInput.imageMode(CENTER);
      maskedOutput = createGraphics(camHeight, camWidth);
      maskedOutput.pixelDensity(1);
      // Start detection only once actual camera dims are known,
      // so ml5 never processes the default 640x480 placeholder frames.
      bodySegmentation.detectStart(segmentationInput.canvas, gotResults);
      loadedCamera = true;
    }
  }, 50);
}
