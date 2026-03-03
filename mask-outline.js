function createMaskOutlineHelper(options = {}) {
  const config = {
    downsample: options.downsample ?? 4,
    threshold: options.threshold ?? 127,
    weight: options.weight ?? 5,
    color: options.color ?? "#00e5ff",
    temporalSmoothing: options.temporalSmoothing ?? 0.35,
    targetPoints: options.targetPoints ?? 120,
  };

  let analysisCanvas;
  let analysisCtx;
  let previousContour = null;

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

    const largestComponent = extractLargestConnectedComponent(
      binary,
      targetW,
      targetH,
    );
    if (!largestComponent) return null;

    const contour = extractContourFromComponent(
      largestComponent,
      targetW,
      targetH,
    );
    if (!contour || contour.length < 3) return null;

    const scaleX = sourceWidth / targetW;
    const scaleY = sourceHeight / targetH;
    const scaledContour = contour.map((point) => ({
      x: point.x * scaleX,
      y: point.y * scaleY,
    }));

    return applyTemporalSmoothing(scaledContour);
  }

  function extractLargestConnectedComponent(binary, width, height) {
    const visited = new Uint8Array(binary.length);
    let bestCount = 0;
    let bestIndices = null;

    const queue = new Int32Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      if (!binary[i] || visited[i]) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = i;
      visited[i] = 1;
      const component = [];

      while (head < tail) {
        const current = queue[head++];
        component.push(current);

        const x = current % width;
        const y = Math.floor(current / width);

        const neighbors = [
          x > 0 ? current - 1 : -1,
          x < width - 1 ? current + 1 : -1,
          y > 0 ? current - width : -1,
          y < height - 1 ? current + width : -1,
        ];

        for (const next of neighbors) {
          if (next < 0) continue;
          if (!binary[next] || visited[next]) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }

      if (component.length > bestCount) {
        bestCount = component.length;
        bestIndices = component;
      }
    }

    if (!bestIndices || bestIndices.length < 12) return null;

    const componentMask = new Uint8Array(binary.length);
    for (const index of bestIndices) {
      componentMask[index] = 1;
    }
    return componentMask;
  }

  function extractContourFromComponent(componentMask, width, height) {
    const start = findStartBoundaryPixel(componentMask, width, height);
    if (!start) return null;

    const contour = traceBoundaryMoore(
      componentMask,
      width,
      height,
      start.x,
      start.y,
    );
    if (!contour || contour.length < 8) return null;
    return decimatePoints(contour, 2);
  }

  function findStartBoundaryPixel(mask, width, height) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (!mask[index]) continue;
        if (isBoundaryPixel(mask, width, height, x, y)) {
          return { x, y };
        }
      }
    }
    return null;
  }

  function isBoundaryPixel(mask, width, height, x, y) {
    for (let ny = y - 1; ny <= y + 1; ny++) {
      for (let nx = x - 1; nx <= x + 1; nx++) {
        if (nx === x && ny === y) continue;
        if (!isForeground(mask, width, height, nx, ny)) {
          return true;
        }
      }
    }
    return false;
  }

  function isForeground(mask, width, height, x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return mask[y * width + x] === 1;
  }

  function traceBoundaryMoore(mask, width, height, startX, startY) {
    const neighbors = [
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
    ];

    const dirIndex = new Map(
      neighbors.map((offset, i) => [`${offset.x},${offset.y}`, i]),
    );
    const contour = [];

    const start = { x: startX, y: startY };
    const startBacktrack = { x: startX - 1, y: startY };

    let current = { ...start };
    let backtrack = { ...startBacktrack };

    const maxSteps = width * height * 4;
    for (let step = 0; step < maxSteps; step++) {
      contour.push({ x: current.x + 0.5, y: current.y + 0.5 });

      const relX = backtrack.x - current.x;
      const relY = backtrack.y - current.y;
      const startIndex = dirIndex.get(`${relX},${relY}`) ?? 7;

      let found = null;
      let foundIndex = -1;
      for (let i = 1; i <= 8; i++) {
        const idx = (startIndex + i) % 8;
        const nx = current.x + neighbors[idx].x;
        const ny = current.y + neighbors[idx].y;
        if (isForeground(mask, width, height, nx, ny)) {
          found = { x: nx, y: ny };
          foundIndex = idx;
          break;
        }
      }

      if (!found) break;

      const prevIndex = (foundIndex + 7) % 8;
      backtrack = {
        x: current.x + neighbors[prevIndex].x,
        y: current.y + neighbors[prevIndex].y,
      };
      current = found;

      if (
        current.x === start.x &&
        current.y === start.y &&
        backtrack.x === startBacktrack.x &&
        backtrack.y === startBacktrack.y &&
        contour.length > 8
      ) {
        break;
      }
    }

    return contour;
  }

  function decimatePoints(points, step) {
    if (points.length <= 12 || step <= 1) return points.slice();
    const reduced = [];
    for (let i = 0; i < points.length; i += step) {
      reduced.push(points[i]);
    }
    return reduced;
  }

  function applyTemporalSmoothing(contour) {
    if (!contour || contour.length < 3) return contour;

    const blend = Math.min(0.95, Math.max(0, config.temporalSmoothing));
    const targetCount = Math.max(24, Math.floor(config.targetPoints));
    const normalized = resampleClosedContour(contour, targetCount);

    if (!previousContour || previousContour.length !== normalized.length) {
      previousContour = normalized.map((point) => ({ ...point }));
      return normalized;
    }

    const alignedPrevious = alignClosedContours(previousContour, normalized);
    const smoothed = new Array(normalized.length);

    for (let i = 0; i < normalized.length; i++) {
      const prev = alignedPrevious[i];
      const curr = normalized[i];
      smoothed[i] = {
        x: prev.x + (curr.x - prev.x) * (1 - blend),
        y: prev.y + (curr.y - prev.y) * (1 - blend),
      };
    }

    previousContour = smoothed.map((point) => ({ ...point }));
    return smoothed;
  }

  function resampleClosedContour(points, targetCount) {
    const count = points.length;
    if (count < 3) return points.slice();

    const cumulative = [0];
    let perimeter = 0;
    for (let i = 0; i < count; i++) {
      const a = points[i];
      const b = points[(i + 1) % count];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      perimeter += distance;
      cumulative.push(perimeter);
    }

    if (perimeter < 1e-6) return points.slice();

    const result = [];
    for (let i = 0; i < targetCount; i++) {
      const distanceAlong = (i / targetCount) * perimeter;
      let seg = 0;
      while (seg < count && cumulative[seg + 1] < distanceAlong) seg++;

      const start = points[seg % count];
      const end = points[(seg + 1) % count];
      const segStart = cumulative[seg];
      const segLength = Math.max(1e-6, cumulative[seg + 1] - segStart);
      const t = (distanceAlong - segStart) / segLength;

      result.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      });
    }

    return result;
  }

  function alignClosedContours(reference, contour) {
    if (!reference || !contour || reference.length !== contour.length) {
      return contour;
    }

    const n = contour.length;
    let bestOffset = 0;
    let bestScore = Infinity;
    const sampleStep = Math.max(1, Math.floor(n / 24));

    for (let offset = 0; offset < n; offset++) {
      let score = 0;
      for (let i = 0; i < n; i += sampleStep) {
        const ref = reference[i];
        const candidate = contour[(i + offset) % n];
        const dx = ref.x - candidate.x;
        const dy = ref.y - candidate.y;
        score += dx * dx + dy * dy;
      }
      if (score < bestScore) {
        bestScore = score;
        bestOffset = offset;
      }
    }

    const aligned = new Array(n);
    for (let i = 0; i < n; i++) {
      aligned[i] = contour[(i + bestOffset) % n];
    }
    return aligned;
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
