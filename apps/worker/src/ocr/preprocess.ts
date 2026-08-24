import sharp from 'sharp';

export interface ImageQuality {
  width: number;
  height: number;
  brightness: number;   // 0-255 average
  contrast: number;     // standard deviation of luminance
  sharpness: number;    // higher = sharper (Laplacian variance estimate)
  rating: 'good' | 'fair' | 'poor';
  details: string[];
}

export interface CandidateImage {
  label: string;
  buffer: Buffer;
}

const MIN_DIMENSION = 800;
const MAX_DIMENSION = 3000;
const TARGET_DIMENSION = 1800;

/**
 * Assess image quality for OCR suitability.
 */
export async function assessImageQuality(buffer: Buffer): Promise<ImageQuality> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const details: string[] = [];

  // Resize for analysis to keep stats fast
  const analysisBuffer = await sharp(buffer)
    .resize(400, 400, { fit: 'inside' })
    .greyscale()
    .raw()
    .toBuffer();

  const pixels = Array.from(analysisBuffer);
  const n = pixels.length;

  // Brightness: average luminance
  const brightness = pixels.reduce((s, v) => s + v, 0) / n;

  // Contrast: standard deviation of luminance
  const mean = brightness;
  const variance = pixels.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const contrast = Math.sqrt(variance);

  // Sharpness: simplified Laplacian variance on a small resize
  const smallBuf = await sharp(buffer)
    .resize(200, 200, { fit: 'inside' })
    .greyscale()
    .raw()
    .toBuffer();
  const sp = Array.from(smallBuf);
  const sw = await sharp(buffer).resize(200, 200, { fit: 'inside' }).metadata();
  const sWidth = sw.width || 200;
  const sHeight = sw.height || 200;
  let laplacianSum = 0;
  let laplacianCount = 0;
  for (let y = 1; y < sHeight - 1; y++) {
    for (let x = 1; x < sWidth - 1; x++) {
      const idx = y * sWidth + x;
      const center = sp[idx] * 4;
      const top = sp[(y - 1) * sWidth + x];
      const bottom = sp[(y + 1) * sWidth + x];
      const left = sp[y * sWidth + (x - 1)];
      const right = sp[y * sWidth + (x + 1)];
      const lap = center - top - bottom - left - right;
      laplacianSum += lap * lap;
      laplacianCount++;
    }
  }
  const sharpness = laplacianCount > 0 ? Math.sqrt(laplacianSum / laplacianCount) : 0;

  // Rating
  let score = 0;
  if (width >= MIN_DIMENSION && height >= MIN_DIMENSION) score += 1;
  else details.push('low resolution');
  if (brightness > 60 && brightness < 220) score += 1;
  else details.push(brightness <= 60 ? 'too dark' : 'too bright');
  if (contrast > 30) score += 1;
  else details.push('low contrast');
  if (sharpness > 15) score += 1;
  else details.push('blurry');

  let rating: 'good' | 'fair' | 'poor';
  if (score >= 3) rating = 'good';
  else if (score >= 2) rating = 'fair';
  else rating = 'poor';

  return { width, height, brightness, contrast, sharpness, rating, details };
}

/**
 * Normalize image: auto-orient (EXIF), resize for optimal OCR, ensure RGB.
 */
export async function normalizeImage(buffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  let pipeline = sharp(buffer).rotate(); // auto-orient from EXIF

  // Resize: upscale small images, downscale very large ones
  const maxDim = Math.max(width, height);
  if (maxDim < MIN_DIMENSION) {
    const scale = TARGET_DIMENSION / maxDim;
    pipeline = pipeline.resize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      kernel: 'lanczos3',
    });
  } else if (maxDim > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / maxDim;
    pipeline = pipeline.resize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      kernel: 'lanczos3',
    });
  }

  // Ensure we have an opaque RGB image (no alpha channel issues)
  return pipeline.flatten({ background: '#ffffff' }).toFormat('png').toBuffer();
}

/**
 * Create grayscale candidate.
 */
export async function toGrayscale(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).rotate().greyscale().toFormat('png').toBuffer();
}

/**
 * Create contrast-enhanced candidate using histogram equalization (CLAHE-like via normalize).
 */
export async function enhanceContrast(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .greyscale()
    .normalize()  // stretch contrast to full 0-255 range
    .toFormat('png')
    .toBuffer();
}

/**
 * Create adaptive-threshold candidate for uneven lighting.
 * Uses sharp's threshold with a moderate level.
 */
export async function adaptiveThreshold(buffer: Buffer): Promise<Buffer> {
  const grey = await sharp(buffer).rotate().greyscale().toBuffer();
  // Compute average intensity for threshold level
  const stats = await sharp(buffer).rotate().greyscale().stats();
  const avgIntensity = stats.channels[0]?.mean ?? 128;
  // Use slightly above average for threshold
  const threshold = Math.min(255, Math.max(0, Math.round(avgIntensity + 10)));
  return sharp(grey).threshold(threshold).toFormat('png').toBuffer();
}

/**
 * Create lightly denoised candidate.
 */
export async function denoise(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .greyscale()
    .median(3) // 3x3 median filter — removes salt-and-pepper noise
    .toFormat('png')
    .toBuffer();
}

/**
 * Create sharpened candidate.
 */
export async function sharpen(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .greyscale()
    .sharpen({ sigma: 1.5, m1: 0.5, m2: 0.5 })
    .toFormat('png')
    .toBuffer();
}

/**
 * Create contrast-enhanced + sharpened candidate (common best for receipts).
 */
export async function contrastPlusSharpen(buffer: Buffer): Promise<Buffer> {
  const normed = await sharp(buffer).rotate().greyscale().normalize().toBuffer();
  return sharp(normed).sharpen({ sigma: 1.0, m1: 0.3, m2: 0.3 }).toFormat('png').toBuffer();
}

/**
 * Generate candidate images for multi-pass OCR.
 * Returns a small set of preprocessed variants.
 */
export async function generateCandidates(buffer: Buffer): Promise<CandidateImage[]> {
  const candidates: CandidateImage[] = [];

  // 1. Normalized original (best baseline)
  const normalized = await normalizeImage(buffer);
  candidates.push({ label: 'normalized', buffer: normalized });

  // 2. Grayscale + contrast enhancement
  const contrasted = await enhanceContrast(buffer);
  candidates.push({ label: 'contrast', buffer: contrasted });

  // 3. Adaptive threshold (for uneven lighting)
  const threshold = await adaptiveThreshold(buffer);
  candidates.push({ label: 'threshold', buffer: threshold });

  // 4. Contrast + sharpen combo (often best for faded receipts)
  const contrastSharp = await contrastPlusSharpen(buffer);
  candidates.push({ label: 'contrast+sharp', buffer: contrastSharp });

  return candidates;
}
