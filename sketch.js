let bodySegmentation;
let segmentation;

let capture;
let captureEvent;
let camWidth = 0;
let camHeight = 0;
let loadedCamera;
let isFrontCamera = true;

function preload() {
  bodySegmentation = ml5.bodySegmentation("SelfieSegmentation");
  // or "BodyPix" for body part masks
}

function setup() {
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
  if (loadedCamera && capture) makeSegmentationImage();
}

function makeSegmentationImage() {
  if (segmentation) {
    console.log("segmentation", segmentation);
    image(segmentation.mask, 0, 0, width, height);
  }

  // Draw video, mirrored for front camera
  // push();
  // if (isFrontCamera) {
  //   translate(width, 0);
  //   scale(-1, 1);
  // }
  // image(capture, 0, 0, width, height);
  // pop();

  // if (!segmentation) return;

  // const maskSrc = segmentation.mask.canvas;
  // if (!maskSrc) return;

  // const isPortrait = height > width;

  // const offscreen = document.createElement("canvas");
  // offscreen.width = width;
  // offscreen.height = height;
  // const octx = offscreen.getContext("2d");

  // const mw = maskSrc.width;
  // const mh = maskSrc.height;

  // Mirror the mask horizontally to match the mirrored video feed.
  // No rotation needed — ml5 SelfieSegmentation outputs the mask
  // correctly oriented when capture.size() matches the camera dimensions.
  // octx.translate(width / 2, height / 2);
  // octx.scale(-1, 1);
  // octx.drawImage(maskSrc, -mw / 2, -mh / 2, mw, mh);

  // drawingContext.globalCompositeOperation = "destination-in";
  // drawingContext.drawImage(offscreen, 0, 0);
  // drawingContext.globalCompositeOperation = "source-over";

  // let newImg = createImage(width, height);

  // // copy image into the new image
  // // https://p5js.org/reference/#/p5.Image/copy
  // newImg.copy(drawingContext, 0, 0, width, height, 0, 0, width, height);

  // // apply the mask
  // newImg.mask(maskLayer);

  // image(offscreen)
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
      resizeCanvas(camWidth, camHeight);
      // Start detection only once actual camera dims are known,
      // so ml5 never processes the default 640x480 placeholder frames.
      bodySegmentation.detectStart(capture, gotResults);
      loadedCamera = true;
    }
  }, 50);
}
