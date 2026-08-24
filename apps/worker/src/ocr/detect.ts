import sharp from 'sharp';

export interface DocumentBoundary {
  /** Four corners of the detected receipt: top-left, top-right, bottom-right, bottom-left */
  corners: [Point, Point, Point, Point];
  /** Confidence in the detection (0-1) */
  confidence: number;
  /** Area of the detected region as fraction of image area */
  areaFraction: number;
}

export interface Point {
  x: number;
  y: number;
}

interface Contour {
  points: Point[];
  area: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

const MIN_RECEIPT_AREA_FRACTION = 0.08;
const MAX_RECEIPT_AREA_FRACTION = 0.95;
const MIN_ASPECT_RATIO = 0.2;
const MAX_ASPECT_RATIO = 5.0;

/**
 * Detect receipt/document boundary in a photograph.
 * Uses brightness-based segmentation to find the receipt region,
 * then fits a quadrilateral to the boundary.
 */
export async function detectDocument(buffer: Buffer): Promise<DocumentBoundary | null> {
  const metadata = await sharp(buffer).metadata();
  const imgWidth = metadata.width || 0;
  const imgHeight = metadata.height || 0;
  if (imgWidth < 100 || imgHeight < 100) return null;

  // 1. Convert to grayscale and get raw pixels
  const grey = await sharp(buffer)
    .rotate()
    .greyscale()
    .resize(600, 600, { fit: 'inside', kernel: 'nearest' })
    .raw()
    .toBuffer();

  const meta = await sharp(buffer).rotate().resize(600, 600, { fit: 'inside', kernel: 'nearest' }).metadata();
  const w = meta.width || 600;
  const h = meta.height || 600;

  // 2. Compute adaptive threshold to separate bright receipt from dark background
  let sum = 0;
  for (let i = 0; i < grey.length; i++) sum += grey[i];
  const mean = sum / grey.length;

  // Use Otsu-like threshold: separate into two classes
  const threshold = computeOtsuThreshold(grey);

  // 3. Create binary mask: 1 = receipt candidate (bright), 0 = background
  const mask = new Uint8Array(grey.length);
  for (let i = 0; i < grey.length; i++) {
    mask[i] = grey[i] > threshold ? 1 : 0;
  }

  // 4. Morphological close to fill small gaps
  const closed = morphologicalClose(mask, w, h, 3);

  // 5. Find connected components and pick the largest plausible one
  const components = findConnectedComponents(closed, w, h);
  if (components.length === 0) return null;

  // Sort by area descending
  components.sort((a, b) => b.area - a.area);

  // Find the largest component that looks like a receipt
  let bestComponent: Contour | null = null;
  const totalPixels = w * h;

  for (const comp of components) {
    const areaFraction = comp.area / totalPixels;
    if (areaFraction < MIN_RECEIPT_AREA_FRACTION) continue;
    if (areaFraction > MAX_RECEIPT_AREA_FRACTION) continue;

    const { width: bw, height: bh } = comp.boundingBox;
    const aspect = Math.max(bw, bh) / Math.max(Math.min(bw, bh), 1);
    if (aspect < MIN_ASPECT_RATIO || aspect > MAX_ASPECT_RATIO) continue;

    bestComponent = comp;
    break;
  }

  if (!bestComponent) return null;

  // 6. Find the convex hull and fit a quadrilateral
  const hull = convexHull(bestComponent.points);
  if (hull.length < 4) return null;

  const quad = fitQuadrilateral(hull, w, h);
  if (!quad) return null;

  // 7. Scale corners back to original image coordinates
  const scaleX = imgWidth / w;
  const scaleY = imgHeight / h;

  // Apply EXIF rotation compensation — sharp().rotate() handles this in the grey buffer,
  // but we need to account for it when mapping back to original coords.
  // For simplicity, we assume the rotation is 0 or handled by sharp's auto-orient.
  const corners: [Point, Point, Point, Point] = [
    { x: quad[0].x * scaleX, y: quad[0].y * scaleY },
    { x: quad[1].x * scaleX, y: quad[1].y * scaleY },
    { x: quad[2].x * scaleX, y: quad[2].y * scaleY },
    { x: quad[3].x * scaleX, y: quad[3].y * scaleY },
  ];

  const areaFraction = bestComponent.area / totalPixels;
  const confidence = Math.min(1, areaFraction * 1.5) * (bestComponent.area > 0 ? 1 : 0);

  return { corners, confidence, areaFraction };
}

/**
 * Compute Otsu's threshold for binarization.
 */
function computeOtsuThreshold(pixels: Uint8Array): number {
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < pixels.length; i++) {
    histogram[pixels[i]]++;
  }

  const total = pixels.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let i = 0; i < 256; i++) {
    wB += histogram[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += i * histogram[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }

  return threshold;
}

/**
 * Morphological close (dilate then erode) to fill small gaps.
 */
function morphologicalClose(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const dilated = dilate(mask, w, h, radius);
  return erode(dilated, w, h, radius);
}

function dilate(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let maxVal = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
            maxVal = Math.max(maxVal, mask[ny * w + nx]);
          }
        }
      }
      result[y * w + x] = maxVal;
    }
  }
  return result;
}

function erode(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let minVal = 1;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
            minVal = Math.min(minVal, mask[ny * w + nx]);
          }
        }
      }
      result[y * w + x] = minVal;
    }
  }
  return result;
}

/**
 * Find connected components using flood fill.
 * Returns contours sorted by area.
 */
function findConnectedComponents(mask: Uint8Array, w: number, h: number): Contour[] {
  const visited = new Uint8Array(mask.length);
  const components: Contour[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx] === 0 || visited[idx]) continue;

      // Flood fill
      const points: Point[] = [];
      const stack: Point[] = [{ x, y }];
      let minX = x, maxX = x, minY = y, maxY = y;

      while (stack.length > 0) {
        const p = stack.pop()!;
        const pi = p.y * w + p.x;
        if (p.x < 0 || p.x >= w || p.y < 0 || p.y >= h) continue;
        if (visited[pi] || mask[pi] === 0) continue;

        visited[pi] = 1;
        points.push(p);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);

        stack.push({ x: p.x + 1, y: p.y });
        stack.push({ x: p.x - 1, y: p.y });
        stack.push({ x: p.x, y: p.y + 1 });
        stack.push({ x: p.x, y: p.y - 1 });
      }

      if (points.length > 50) {
        components.push({
          points,
          area: points.length,
          boundingBox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
        });
      }
    }
  }

  return components;
}

/**
 * Compute convex hull using Andrew's monotone chain algorithm.
 */
function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points;

  // Sort by x, then y
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);

  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point[] = [];
  for (const p of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Fit a quadrilateral to a convex hull by finding the 4 corners
 * that maximize the enclosed area while being approximately rectangular.
 */
function fitQuadrilateral(hull: Point[], w: number, h: number): [Point, Point, Point, Point] | null {
  if (hull.length < 4) return null;

  // Find4 extreme points: top-left, top-right, bottom-right, bottom-left
  // based on combination of position and distance from center
  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;

  let bestScore = -1;
  let bestQuad: [Point, Point, Point, Point] | null = null;

  // For efficiency, sample hull points and try combinations
  const sampled = hull.length > 20
    ? hull.filter((_, i) => i % Math.ceil(hull.length / 20) === 0)
    : hull;

  // Find4 corner candidates by maximizing distance in each quadrant
  const tl = findCornerInQuadrant(hull, cx, cy, -1, -1);
  const tr = findCornerInQuadrant(hull, cx, cy, 1, -1);
  const br = findCornerInQuadrant(hull, cx, cy, 1, 1);
  const bl = findCornerInQuadrant(hull, cx, cy, -1, 1);

  if (!tl || !tr || !br || !bl) return null;

  // Validate rectangularity
  const quad = [tl, tr, br, bl];
  const area = polygonArea(quad);
  const boundingArea = (Math.max(tl.x, tr.x, br.x, bl.x) - Math.min(tl.x, tr.x, br.x, bl.x)) *
    (Math.max(tl.y, tr.y, br.y, bl.y) - Math.min(tl.y, tr.y, br.y, bl.y));

  if (boundingArea === 0) return null;

  const rectangularity = area / boundingArea;
  if (rectangularity < 0.5) return null; // Not rectangular enough

  return [tl, tr, br, bl];
}

function findCornerInQuadrant(points: Point[], cx: number, cy: number, dx: number, dy: number): Point | null {
  let best: Point | null = null;
  let bestScore = -Infinity;

  for (const p of points) {
    if (dx < 0 && p.x > cx) continue;
    if (dx > 0 && p.x < cx) continue;
    if (dy < 0 && p.y > cy) continue;
    if (dy > 0 && p.y < cy) continue;

    // Score by distance from center (prefer far corners)
    const score = (p.x - cx) * dx + (p.y - cy) * dy;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  return best;
}

function polygonArea(points: Point[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}
