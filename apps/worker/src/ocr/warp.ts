import sharp from 'sharp';
import { Point } from './detect.js';

const MAX_OUTPUT_DIMENSION = 1200;

/**
 * Perspective-correct a document image given 4 corner points.
 * Transforms the quadrilateral region to a rectangular output.
 * Optimized for low memory and high performance.
 */
export async function perspectiveCorrect(
  buffer: Buffer,
  corners: [Point, Point, Point, Point],
  outputWidth?: number,
  outputHeight?: number,
): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata();
  const srcWidth = metadata.width || 0;
  const srcHeight = metadata.height || 0;
  if (srcWidth === 0 || srcHeight === 0) return buffer;

  const sorted = sortCorners(corners);
  const [tl, tr, br, bl] = sorted;

  const topWidth = Math.sqrt((tr.x - tl.x) ** 2 + (tr.y - tl.y) ** 2);
  const bottomWidth = Math.sqrt((br.x - bl.x) ** 2 + (br.y - bl.y) ** 2);
  const leftHeight = Math.sqrt((bl.x - tl.x) ** 2 + (bl.y - tl.y) ** 2);
  const rightHeight = Math.sqrt((br.x - tr.x) ** 2 + (br.y - tr.y) ** 2);

  let outW = outputWidth || Math.round(Math.max(topWidth, bottomWidth));
  let outH = outputHeight || Math.round(Math.max(leftHeight, rightHeight));

  if (outW < 20 || outH < 20) return buffer;

  // Cap output dimensions to prevent memory explosion
  const outMaxDim = Math.max(outW, outH);
  if (outMaxDim > MAX_OUTPUT_DIMENSION) {
    const scale = MAX_OUTPUT_DIMENSION / outMaxDim;
    outW = Math.round(outW * scale);
    outH = Math.round(outH * scale);
  }

  const H = computeHomography(
    [tl, tr, br, bl],
    [
      { x: 0, y: 0 },
      { x: outW - 1, y: 0 },
      { x: outW - 1, y: outH - 1 },
      { x: 0, y: outH - 1 },
    ]
  );

  if (!H) return buffer;

  // Work with 1-channel grayscale to use 1/4th the memory of RGBA
  const raw = await sharp(buffer)
    .greyscale()
    .raw()
    .toBuffer();

  // Create output grayscale buffer
  const out = Buffer.alloc(outW * outH, 255);

  const h0 = H[0], h1 = H[1], h2 = H[2];
  const h3 = H[3], h4 = H[4], h5 = H[5];
  const h6 = H[6], h7 = H[7], h8 = H[8];

  for (let oy = 0; oy < outH; oy++) {
    const outRowOffset = oy * outW;
    for (let ox = 0; ox < outW; ox++) {
      // Inlined homography projection (avoids array allocation per pixel)
      const denom = h6 * ox + h7 * oy + h8;
      if (Math.abs(denom) < 1e-10) continue;

      const sx = (h0 * ox + h1 * oy + h2) / denom;
      const sy = (h3 * ox + h4 * oy + h5) / denom;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = x0 + 1;
      const y1 = y0 + 1;

      if (x0 < 0 || y0 < 0 || x1 >= srcWidth || y1 >= srcHeight) continue;

      const fx = sx - x0;
      const fy = sy - y0;

      const idx00 = y0 * srcWidth + x0;
      const idx10 = y0 * srcWidth + x1;
      const idx01 = y1 * srcWidth + x0;
      const idx11 = y1 * srcWidth + x1;

      const v =
        raw[idx00] * (1 - fx) * (1 - fy) +
        raw[idx10] * fx * (1 - fy) +
        raw[idx01] * (1 - fx) * fy +
        raw[idx11] * fx * fy;

      out[outRowOffset + ox] = Math.round(Math.min(255, Math.max(0, v)));
    }
  }

  // Release raw buffer reference
  (raw as any) = null;

  return sharp(out, { raw: { width: outW, height: outH, channels: 1 } })
    .png({ compressionLevel: 1 })
    .toBuffer();
}

function sortCorners(corners: [Point, Point, Point, Point]): [Point, Point, Point, Point] {
  const scored = corners.map((c) => ({
    point: c,
    sum: c.x + c.y,
    diff: c.x - c.y,
  }));

  const tl = scored.reduce((a, b) => (a.sum < b.sum ? a : b)).point;
  const br = scored.reduce((a, b) => (a.sum > b.sum ? a : b)).point;
  const tr = scored.reduce((a, b) => (a.diff > b.diff ? a : b)).point;
  const bl = scored.reduce((a, b) => (a.diff < b.diff ? a : b)).point;

  return [tl, tr, br, bl];
}

function computeHomography(src: Point[], dst: Point[]): number[] | null {
  if (src.length !== 4 || dst.length !== 4) return null;

  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const sx = src[i].x, sy = src[i].y;
    const dx = dst[i].x, dy = dst[i].y;

    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);

    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  const n = 8;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-10) return null;

    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j];
    }
    x[i] /= aug[i][i];
  }

  return [x[0], x[1], x[2], x[3], x[4], x[5], x[6], x[7], 1];
}
