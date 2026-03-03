function createMaskOutlineHelper(options = {}) {
  const config = {
    downsample: options.downsample ?? 4,
    threshold: options.threshold ?? 127,
    weight: options.weight ?? 5,
    color: options.color ?? "#00e5ff",
  };

  let analysisCanvas;
  let analysisCtx;

  function ensureAnalysisCanvas(targetW, targetH) {
    if (!analysisCanvas) {
      analysisCanvas = document.createElement("canvas");
      analysisCtx = analysisCanvas.getContext("2d", {
        willReadFrequently: true,
      });
    }

    if (analysisCanvas.width !== targetW || analysisCanvas.height !== targetH) {
      analysisCanvas.width = targetW;
      analysisCanvas.height = targetH;
    }
  }

  function extractLargestMaskContour(maskCanvas, sourceWidth, sourceHeight) {
    const targetW = Math.max(2, Math.floor(sourceWidth / config.downsample));
    const targetH = Math.max(2, Math.floor(sourceHeight / config.downsample));

    ensureAnalysisCanvas(targetW, targetH);

    analysisCtx.clearRect(0, 0, targetW, targetH);
    analysisCtx.drawImage(maskCanvas, 0, 0, targetW, targetH);
    const img = analysisCtx.getImageData(0, 0, targetW, targetH).data;

    const binary = new Uint8Array(targetW * targetH);
    for (let index = 0, pixel = 0; index < binary.length; index++, pixel += 4) {
      const alpha = img[pixel + 3];
      const luminance = (img[pixel] + img[pixel + 1] + img[pixel + 2]) / 3;
      binary[index] =
        alpha > config.threshold || luminance > config.threshold ? 1 : 0;
    }

    const contour = extractScanlineSilhouetteContour(binary, targetW, targetH);
    if (!contour || contour.length < 3) return null;

    const scaleX = sourceWidth / targetW;
    const scaleY = sourceHeight / targetH;
    return contour.map((point) => ({
      x: point.x * scaleX,
      y: point.y * scaleY,
    }));
  }

  function extractScanlineSilhouetteContour(binary, width, height) {
    const leftSide = [];
    const rightSide = [];

    for (let y = 0; y < height; y++) {
      const rowStart = y * width;
      let minX = -1;
      let maxX = -1;

      for (let x = 0; x < width; x++) {
        if (binary[rowStart + x]) {
          if (minX === -1) minX = x;
          maxX = x;
        }
      }

      if (minX !== -1) {
        const py = y + 0.5;
        leftSide.push({ x: minX, y: py });
        rightSide.push({ x: maxX, y: py });
      }
    }

    if (leftSide.length < 8) return null;

    const reduceStep = 2;
    const reducePoints = (points) => {
      if (points.length <= 12) return points.slice();
      const reduced = [];
      for (let i = 0; i < points.length; i += reduceStep) {
        reduced.push(points[i]);
      }
      const last = points[points.length - 1];
      const tail = reduced[reduced.length - 1];
      if (!tail || tail.x !== last.x || tail.y !== last.y) {
        reduced.push(last);
      }
      return reduced;
    };

    const leftReduced = reducePoints(leftSide);
    const rightReduced = reducePoints(rightSide).reverse();
    const contour = leftReduced.concat(rightReduced);
    return contour.length > 6 ? contour : null;
  }

  function drawSmoothContour(targetGraphics, points) {
    if (points.length < 3) return;

    const ctx = targetGraphics.drawingContext;
    ctx.save();
    ctx.strokeStyle = config.color;
    ctx.lineWidth = config.weight;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const count = points.length;
    const mid = (a, b) => ({
      x: (a.x + b.x) * 0.5,
      y: (a.y + b.y) * 0.5,
    });

    const firstMid = mid(points[count - 1], points[0]);
    ctx.beginPath();
    ctx.moveTo(firstMid.x, firstMid.y);

    for (let i = 0; i < count; i++) {
      const current = points[i];
      const next = points[(i + 1) % count];
      const midpoint = mid(current, next);
      ctx.quadraticCurveTo(current.x, current.y, midpoint.x, midpoint.y);
    }

    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  return {
    extractLargestMaskContour,
    drawSmoothContour,
  };
}