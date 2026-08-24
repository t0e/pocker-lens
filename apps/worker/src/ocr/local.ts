import { createWorker } from 'tesseract.js';
import { OCRProvider, OCRResult } from '@pocketlens/shared';
import {
  assessImageQuality,
  generateCandidates,
  ImageQuality,
  CandidateImage,
} from './preprocess.js';

export interface EnhancedOCRResult extends OCRResult {
  quality: ImageQuality;
  candidateCount: number;
  bestCandidate: string;
}

// Receipt keywords for scoring OCR output quality (EN + VI)
const RECEIPT_KEYWORDS = [
  'total', 'subtotal', 'sub total', 'tax', 'vat', 'cash', 'change',
  'amount', 'date', 'receipt', 'invoice', 'payment',
  'tổng', 'tổng cộng', 'thành tiền', 'tổng tiền', 'thanh toán',
  'tiền mặt', 'tiền thừa', 'tiền khách', 'hóa đơn', 'phiếu',
  'giảm giá', 'chiết khấu', 'tạm tính', 'thuế',
];

/**
 * Score OCR text quality for receipt suitability.
 * Higher score = better quality text output.
 */
export function scoreOCRText(text: string, tesseractConfidence: number): number {
  if (!text || text.trim().length === 0) return 0;

  let score = 0;
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const totalChars = text.length;
  const printableChars = text.replace(/[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g, '').length;
  const printRatio = totalChars > 0 ? printableChars / totalChars : 0;

  // 1. Character count (more text = more data for extraction)
  if (totalChars > 200) score += 20;
  else if (totalChars > 100) score += 15;
  else if (totalChars > 50) score += 10;
  else score += 3;

  // 2. Printable character ratio
  score += printRatio * 15;

  // 3. Number of lines (receipts typically have many lines)
  if (lines.length > 10) score += 15;
  else if (lines.length > 5) score += 10;
  else score += 3;

  // 4. Presence of numeric tokens (receipt amounts)
  const numericTokens = text.match(/\d{2,}/g) || [];
  if (numericTokens.length > 5) score += 15;
  else if (numericTokens.length > 2) score += 10;
  else score += 2;

  // 5. Receipt keyword matches
  const lowerText = text.toLowerCase();
  const keywordMatches = RECEIPT_KEYWORDS.filter((kw) => lowerText.includes(kw)).length;
  if (keywordMatches >= 4) score += 25;
  else if (keywordMatches >= 2) score += 15;
  else if (keywordMatches >= 1) score += 8;

  // 6. Tesseract confidence contribution
  score += (tesseractConfidence / 100) * 10;

  return Math.round(score);
}

/**
 * Run OCR on a single image candidate.
 */
async function runOCROnCandidate(
  candidate: CandidateImage,
  languages: string,
  timeoutMs: number
): Promise<{ rawText: string; confidence: number; durationMs: number }> {
  const startTime = Date.now();
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
    worker = await createWorker(languages, 1, {
      // PSM 6: Assume a single uniform block of text (good for receipt columns)
      // OEM 3: Default LSTM engine
    });
    await worker.setParameters({
      tessedit_pageseg_mode: '6', // Auto segment into lines
    });
    const ret = await worker.recognize(candidate.buffer);
    await worker.terminate();
    worker = null;
    return {
      rawText: ret.data.text || '',
      confidence: ret.data.confidence || 50,
      durationMs: Date.now() - startTime,
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
 * Generates multiple preprocessed candidates, runs OCR on each,
 * scores results, and returns the best one.
 */
export class LocalOCRProvider implements OCRProvider {
  private languages: string;
  private timeoutMs: number;

  constructor(languages = 'eng+vie', timeoutMs = 45000) {
    this.languages = languages;
    this.timeoutMs = timeoutMs;
  }

  async extractText(imageBuffer: Buffer, mimeType: string): Promise<OCRResult> {
    const startTime = Date.now();

    // 1. Assess image quality
    const quality = await assessImageQuality(imageBuffer);

    // 2. Generate candidate images
    const candidates = await generateCandidates(imageBuffer);

    // 3. Run OCR on each candidate, keeping best result
    let bestText = '';
    let bestScore = -1;
    let bestConfidence = 0;
    let bestCandidateLabel = 'none';
    let candidateCount = 0;

    const perCandidateTimeout = Math.floor(this.timeoutMs / Math.max(candidates.length, 1));

    for (const candidate of candidates) {
      try {
        const result = await runOCROnCandidate(candidate, this.languages, perCandidateTimeout);
        candidateCount++;
        const score = scoreOCRText(result.rawText, result.confidence);

        if (score > bestScore) {
          bestScore = score;
          bestText = result.rawText;
          bestConfidence = result.confidence;
          bestCandidateLabel = candidate.label;
        }
      } catch {
        // Candidate failed, try next
        continue;
      }
    }

    // 4. If all candidates failed, try one last time on normalized original
    if (!bestText && candidates.length > 0) {
      try {
        const fallback = await runOCROnCandidate(candidates[0], this.languages, perCandidateTimeout);
        bestText = fallback.rawText;
        bestConfidence = fallback.confidence;
        bestScore = scoreOCRText(bestText, bestConfidence);
        bestCandidateLabel = `${candidates[0].label}-fallback`;
        candidateCount++;
      } catch {
        // All OCR attempts failed
      }
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
    };

    return enhancedResult;
  }
}
