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

const MAX_DIMENSION = 1600;
const MIN_DIMENSION = 600;

/**
 * Assess image quality for OCR suitability using native Sharp stats
 * without converting raw pixels to JavaScript arrays.
 */
export async function assessImageQuality(buffer: Buffer): Promise<ImageQuality> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const details: string[] = [];

  // Compute brightness and contrast via native libvips stats (zero JS array allocations)
  const stats = await sharp(buffer)
    .rotate()
    .greyscale()
    .stats();

  const channelStats = stats.channels[0];
  const brightness = channelStats ? channelStats.mean : 128;
  const contrast = channelStats ? channelStats.stdev : 40;

  // Sharpness approximation using small resized edge detection
  let sharpness = 25;
  try {
    const edgeStats = await sharp(buffer)
      .rotate()
      .resize(200, 200, { fit: 'inside' })
      .greyscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [0, -1, 0, -1, 4, -1, 0, -1, 0],
      })
      .stats();
    sharpness = edgeStats.channels[0]?.stdev || 25;
  } catch {
    sharpness = 25;
  }

  let score = 0;
  if (width >= MIN_DIMENSION && height >= MIN_DIMENSION) score += 1;
  else details.push('low resolution');

  if (brightness > 60 && brightness < 220) score += 1;
  else details.push(brightness <= 60 ? 'too dark' : 'too bright');

  if (contrast > 25) score += 1;
  else details.push('low contrast');

  if (sharpness > 10) score += 1;
  else details.push('blurry');

  let rating: 'good' | 'fair' | 'poor';
  if (score >= 3) rating = 'good';
  else if (score >= 2) rating = 'fair';
  else rating = 'poor';

  return { width, height, brightness, contrast, sharpness, rating, details };
}

/**
 * Normalize image: auto-orient, downscale large images, ensure grayscale for OCR.
 * Never upscales — only downscales for memory and CPU efficiency.
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

  return pipeline
    .greyscale()
    .flatten({ background: '#ffffff' })
    .png({ compressionLevel: 1 })
    .toBuffer();
}

/**
 * Enhance contrast using histogram normalization on normalized working image.
 */
export async function enhanceContrast(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .normalize()
    .png({ compressionLevel: 1 })
    .toBuffer();
}

/**
 * Adaptive threshold for uneven lighting.
 */
export async function adaptiveThreshold(buffer: Buffer): Promise<Buffer> {
  const stats = await sharp(buffer).stats();
  const avgIntensity = stats.channels[0]?.mean ?? 128;
  const threshold = Math.min(240, Math.max(20, Math.round(avgIntensity + 8)));
  return sharp(buffer)
    .threshold(threshold)
    .png({ compressionLevel: 1 })
    .toBuffer();
}

/**
 * Candidate generator — yields a small set of 2-3 bounded candidates sequentially.
 * Each candidate is generated on demand and can be discarded immediately.
 */
export async function* generateCandidateSequence(
  workingImage: Buffer,
  isCropped: boolean,
  quality: ImageQuality,
): AsyncGenerator<CandidateImage, void, unknown> {
  const prefix = isCropped ? 'crop' : 'full';

  // Candidate 1: Normalized grayscale (best default pass)
  yield {
    label: `${prefix}:normalized`,
    buffer: workingImage,
    isCropped,
  };

  // Candidate 2: Contrast-enhanced
  const contrastBuf = await enhanceContrast(workingImage);
  yield {
    label: `${prefix}:contrast`,
    buffer: contrastBuf,
    isCropped,
  };

  // Candidate 3: Adaptive threshold only if quality rating is poor or contrast is low
  if (quality.rating === 'poor' || quality.contrast < 30 || quality.brightness < 80) {
    const thresholdBuf = await adaptiveThreshold(workingImage);
    yield {
      label: `${prefix}:threshold`,
      buffer: thresholdBuf,
      isCropped,
    };
  }
}

/**
 * Full preprocessing pipeline.
 * Returns a candidate generator and debug info.
 * Limits candidate count to max 2-3 variants.
 */
export async function preprocessForOCR(buffer: Buffer): Promise<{
  generateCandidates: () => AsyncGenerator<CandidateImage, void, unknown>;
  debug: OCRDebugInfo;
  normalized: Buffer;
  quality: ImageQuality;
}> {
  const metadata = await sharp(buffer).metadata();
  const originalDims = `${metadata.width || 0}x${metadata.height || 0}`;

  // 1. Assess quality using native stats
  const quality = await assessImageQuality(buffer);

  // 2. Normalize (EXIF orient, downscale if huge to <= 1600px, greyscale)
  const normalized = await normalizeImage(buffer);

  // 3. Detect document boundary
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

  let primaryWorkingBuffer = normalized;
  let isCropped = false;

  // 4. If high-confidence document detected, perspective-correct
  if (boundary && boundary.confidence >= 0.35 && boundary.areaFraction >= 0.15) {
    try {
      const warped = await perspectiveCorrect(normalized, boundary.corners);
      const croppedMeta = await sharp(warped).metadata();
      debug.croppedDimensions = `${croppedMeta.width || 0}x${croppedMeta.height || 0}`;
      debug.perspectiveCorrected = true;
      primaryWorkingBuffer = warped;
      isCropped = true;
    } catch {
      primaryWorkingBuffer = normalized;
      isCropped = false;
    }
  }

  const labels: string[] = [
    `${isCropped ? 'crop' : 'full'}:normalized`,
    `${isCropped ? 'crop' : 'full'}:contrast`,
  ];
  if (quality.rating === 'poor' || quality.contrast < 30 || quality.brightness < 80) {
    labels.push(`${isCropped ? 'crop' : 'full'}:threshold`);
  }
  debug.candidateLabels = labels;

  return {
    generateCandidates: () => generateCandidateSequence(primaryWorkingBuffer, isCropped, quality),
    debug,
    normalized,
    quality,
  };
}
