import { createWorker } from 'tesseract.js';
import { OCRProvider, OCRResult } from '@pocketlens/shared';
import {
  assessImageQuality,
  preprocessForOCR,
  ImageQuality,
  CandidateImage,
  OCRDebugInfo,
} from './preprocess.js';

export interface EnhancedOCRResult extends OCRResult {
  quality: ImageQuality;
  candidateCount: number;
  bestCandidate: string;
  debug: OCRDebugInfo;
}

const RECEIPT_KEYWORDS = [
  'total', 'subtotal', 'sub total', 'tax', 'vat', 'cash', 'change',
  'amount', 'date', 'receipt', 'invoice', 'payment',
  'tổng', 'tổng cộng', 'thành tiền', 'tổng tiền', 'thanh toán',
  'tiền mặt', 'tiền thừa', 'tiền khách', 'hóa đơn', 'phiếu',
  'giảm giá', 'chiết khấu', 'tạm tính', 'thuế',
  'momo', 'giá trị mua', 'giá bán lẻ', 'giá km',
];

/**
 * Score OCR text quality for receipt suitability.
 */
export function scoreOCRText(text: string, tesseractConfidence: number, isCropped = false): number {
  if (!text || text.trim().length === 0) return 0;

  let score = 0;
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const totalChars = text.length;
  const printableChars = text.replace(/[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g, '').length;
  const printRatio = totalChars > 0 ? printableChars / totalChars : 0;

  if (isCropped) score += 10;

  if (totalChars > 200) score += 20;
  else if (totalChars > 100) score += 15;
  else if (totalChars > 50) score += 10;
  else score += 3;

  score += printRatio * 15;

  if (lines.length > 10) score += 15;
  else if (lines.length > 5) score += 10;
  else score += 3;

  const numericTokens = text.match(/\d{2,}/g) || [];
  if (numericTokens.length > 5) score += 15;
  else if (numericTokens.length > 2) score += 10;
  else score += 2;

  const lowerText = text.toLowerCase();
  const keywordMatches = RECEIPT_KEYWORDS.filter((kw) => lowerText.includes(kw)).length;
  if (keywordMatches >= 4) score += 25;
  else if (keywordMatches >= 2) score += 15;
  else if (keywordMatches >= 1) score += 8;

  score += (tesseractConfidence / 100) * 10;

  if (!isCropped && totalChars > 1000) score -= 10;

  return Math.round(score);
}

/**
 * Run OCR on a single image candidate and immediately release the buffer.
 */
async function runOCROnCandidate(
  candidate: CandidateImage,
  languages: string,
  timeoutMs: number,
): Promise<{ rawText: string; confidence: number }> {
  let worker: any = null;

  let timeoutTimer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutTimer = setTimeout(() => {
      reject(new Error(`OCR candidate timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    if (timeoutTimer && typeof timeoutTimer.unref === 'function') {
      timeoutTimer.unref();
    }
  });

  const ocrPromise = (async () => {
    worker = await createWorker(languages, 1, {});
    await worker.setParameters({
      tessedit_pageseg_mode: '6',
    });
    const ret = await worker.recognize(candidate.buffer);
    await worker.terminate();
    worker = null;
    return {
      rawText: ret.data.text || '',
      confidence: ret.data.confidence || 50,
    };
  })();

  try {
    const result = await Promise.race([ocrPromise, timeoutPromise]);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    return result;
  } catch (err: any) {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (worker) {
      try { await worker.terminate(); } catch { /* ignore */ }
    }
    throw err;
  }
}

/**
 * Multi-pass OCR provider.
 * Uses a generator to process candidates one at a time.
 * Never holds all candidate buffers in memory simultaneously.
 */
export class LocalOCRProvider implements OCRProvider {
  private languages: string;
  private timeoutMs: number;

  constructor(languages = 'eng+vie', timeoutMs = 60000) {
    this.languages = languages;
    this.timeoutMs = timeoutMs;
  }

  async extractText(imageBuffer: Buffer, mimeType: string): Promise<OCRResult> {
    const startTime = Date.now();

    // 1. Assess image quality
    const quality = await assessImageQuality(imageBuffer);

    // 2. Preprocessing: detect document, prepare candidates (generator-based)
    const { generateCandidates, debug } = await preprocessForOCR(imageBuffer);

    // 3. Run OCR on candidates sequentially — one at a time
    let bestText = '';
    let bestScore = -1;
    let bestConfidence = 0;
    let bestCandidateLabel = 'none';
    let candidateCount = 0;

    // Limit max candidates processed (early exit if we find a good one)
    const MAX_CANDIDATES_TO_TRY = 5;
    let candidatesTried = 0;

    for await (const candidate of generateCandidates()) {
      if (candidatesTried >= MAX_CANDIDATES_TO_TRY) break;
      candidatesTried++;

      const perCandidateTimeout = Math.floor(this.timeoutMs / MAX_CANDIDATES_TO_TRY);

      try {
        const result = await runOCROnCandidate(candidate, this.languages, perCandidateTimeout);
        candidateCount++;
        const score = scoreOCRText(result.rawText, result.confidence, candidate.isCropped);

        if (score > bestScore) {
          bestScore = score;
          bestText = result.rawText;
          bestConfidence = result.confidence;
          bestCandidateLabel = candidate.label;
        }

        // Early exit: if we found a good-enough result, stop processing more candidates
        if (score >= 80 && candidate.isCropped) break;
      } catch {
        // Candidate failed, continue to next
      }
      // candidate.buffer can now be GC'd — we don't hold a reference
    }

    const durationMs = Date.now() - startTime;

    const enhancedResult: EnhancedOCRResult = {
      rawText: bestText,
      confidence: bestConfidence,
      detectedLanguage: this.languages.includes('vie') ? 'vie' : 'eng',
      durationMs,
      provider: 'tesseract.js-local',
      quality,
      candidateCount,
      bestCandidate: bestCandidateLabel,
      debug,
    };

    return enhancedResult;
  }
}
