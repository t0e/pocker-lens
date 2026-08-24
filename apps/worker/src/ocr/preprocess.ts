import sharp from 'sharp';
import { detectDocument } from './detect.js';
import { perspectiveCorrect } from './warp.js';

export interface ImageQuality {
  width: number;
  height: number;
  brightness: number;
  contrast: number;
  sharpness: number;
  rating: 'good' | 'fair' | 'poor';
  details: string[];
}

export interface CandidateImage {
  label: string;
  buffer: Buffer;
  isCropped: boolean;
}

export interface OCRDebugInfo {
  documentDetected: boolean;
  documentConfidence: number;
  documentAreaFraction: number;
  perspectiveCorrected: boolean;
  originalDimensions: string;
  croppedDimensions: string;
  candidateLabels: string[];
}

const MAX_DIMENSION = 2000;
const TARGET_DIMENSION = 1600;
const MIN_DIMENSION = 800;

function memMB(): string {
  const m = process.memoryUsage();
  return `rss=${(m.rss / 1048576).toFixed(0)}MB heap=${(m.heapUsed / 1048576).toFixed(0)}/${(m.heapTotal / 1048576).toFixed(0)}MB ext=${(m.external / 1048576).toFixed(0)}MB`;
}

/**
 * Assess image quality for OCR suitability.
 */
export async function assessImageQuality(buffer: Buffer): Promise<ImageQuality> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const details: string[] = [];

  const analysisBuffer = await sharp(buffer)
    .resize(400, 400, { fit: 'inside' })
    .greyscale()
    .raw()
    .toBuffer();

  const pixels = Array.from(analysisBuffer);
  const n = pixels.length;

  const brightness = pixels.reduce((s, v) => s + v, 0) / n;
  const mean = brightness;
  const variance = pixels.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const contrast = Math.sqrt(variance);

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
 * Normalize image: auto-orient, downscale large images, ensure RGB.
 * Never upscales — only downscales for memory efficiency.
 */
export async function normalizeImage(buffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  let pipeline = sharp(buffer).rotate();

  const maxDim = Math.max(width, height);
  if (maxDim > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / maxDim;
    pipeline = pipeline.resize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      kernel: 'lanczos3',
    });
  }

  return pipeline.flatten({ background: '#ffffff' }).png({ compressionLevel: 1 }).toBuffer();
}

/**
 * Enhance contrast using histogram normalization.
 */
export async function enhanceContrast(buffer: Buffer): Promise<Buffer> {
  const result = await sharp(buffer)
    .rotate()
    .greyscale()
    .normalize()
    .png({ compressionLevel: 1 })
    .toBuffer();
  return result;
}

/**
 * Adaptive threshold for uneven lighting.
 */
export async function adaptiveThreshold(buffer: Buffer): Promise<Buffer> {
  const stats = await sharp(buffer).rotate().greyscale().stats();
  const avgIntensity = stats.channels[0]?.mean ?? 128;
  const threshold = Math.min(255, Math.max(0, Math.round(avgIntensity + 10)));
  const grey = await sharp(buffer).rotate().greyscale().toBuffer();
  return sharp(grey).threshold(threshold).png({ compressionLevel: 1 }).toBuffer();
}

/**
 * Contrast + sharpen combo.
 */
export async function contrastPlusSharpen(buffer: Buffer): Promise<Buffer> {
  const normed = await sharp(buffer).rotate().greyscale().normalize().toBuffer();
  return sharp(normed).sharpen({ sigma: 1.0, m1: 0.3, m2: 0.3 }).png({ compressionLevel: 1 }).toBuffer();
}

/**
 * Candidate generator — yields candidates one at a time.
 * Each candidate is generated from the source buffer and can be discarded
 * after OCR runs on it. This avoids holding all candidates in memory.
 *
 * Usage:
 *   for await (const candidate of generateCandidateSequence(normalized, cropped)) {
 *     const result = await runOCR(candidate);
 *     // candidate can be GC'd after this iteration
 *   }
 */
export async function* generateCandidateSequence(
  normalized: Buffer,
  cropped: Buffer | null,
  debug: OCRDebugInfo,
): AsyncGenerator<CandidateImage, void, unknown> {
  if (cropped) {
    // Cropped candidates first — best for OCR (less background noise)
    yield { label: 'crop:normalized', buffer: cropped, isCropped: true };
    const cropContrast = await enhanceContrast(cropped);
    yield { label: 'crop:contrast', buffer: cropContrast, isCropped: true };
    // Discard cropContrast after yield — GC will collect it

    const cropThreshold = await adaptiveThreshold(cropped);
    yield { label: 'crop:threshold', buffer: cropThreshold, isCropped: true };

    const cropContrastSharp = await contrastPlusSharpen(cropped);
    yield { label: 'crop:contrast+sharp', buffer: cropContrastSharp, isCropped: true };
  }

  // Full-image candidates as fallback
  yield { label: 'full:normalized', buffer: normalized, isCropped: false };

  const fullContrast = await enhanceContrast(normalized);
  yield { label: 'full:contrast', buffer: fullContrast, isCropped: false };

  const fullThreshold = await adaptiveThreshold(normalized);
  yield { label: 'full:threshold', buffer: fullThreshold, isCropped: false };

  const fullContrastSharp = await contrastPlusSharpen(normalized);
  yield { label: 'full:contrast+sharp', buffer: fullContrastSharp, isCropped: false };
}

/**
 * Full preprocessing pipeline.
 * Returns a candidate generator and debug info.
 * Candidates are yielded one at a time to minimize peak memory.
 */
export async function preprocessForOCR(buffer: Buffer): Promise<{
  generateCandidates: () => AsyncGenerator<CandidateImage, void, unknown>;
  debug: OCRDebugInfo;
  normalized: Buffer;
}> {
  const metadata = await sharp(buffer).metadata();
  const originalDims = `${metadata.width || 0}x${metadata.height || 0}`;

  // 1. Normalize (EXIF orient, downscale if huge)
  const normalized = await normalizeImage(buffer);

  // 2. Detect document boundary (operates on small internal copy)
  const boundary = await detectDocument(normalized);

  const debug: OCRDebugInfo = {
    documentDetected: !!boundary,
    documentConfidence: boundary?.confidence ?? 0,
    documentAreaFraction: boundary?.areaFraction ?? 0,
    perspectiveCorrected: false,
    originalDimensions: originalDims,
    croppedDimensions: '',
    candidateLabels: [],
  };

  let croppedBuffer: Buffer | null = null;

  // 3. If document detected, perspective-correct and crop
  if (boundary && boundary.confidence > 0.3) {
    try {
      croppedBuffer = await perspectiveCorrect(normalized, boundary.corners);
      const croppedMeta = await sharp(croppedBuffer).metadata();
      debug.croppedDimensions = `${croppedMeta.width || 0}x${croppedMeta.height || 0}`;
      debug.perspectiveCorrected = true;
    } catch {
      croppedBuffer = null;
    }
  }

  const labels: string[] = [];
  if (croppedBuffer) labels.push('crop:normalized', 'crop:contrast', 'crop:threshold', 'crop:contrast+sharp');
  labels.push('full:normalized', 'full:contrast', 'full:threshold', 'full:contrast+sharp');
  debug.candidateLabels = labels;

  return {
    generateCandidates: () => generateCandidateSequence(normalized, croppedBuffer, debug),
    debug,
    normalized,
  };
}
