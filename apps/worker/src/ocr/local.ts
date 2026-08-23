import { createWorker } from 'tesseract.js';
import { OCRProvider, OCRResult } from '@pocketlens/shared';

export class LocalOCRProvider implements OCRProvider {
  private languages: string;
  private timeoutMs: number;

  constructor(languages = 'eng+vie', timeoutMs = 45000) {
    this.languages = languages;
    this.timeoutMs = timeoutMs;
  }

  async extractText(imageBuffer: Buffer, mimeType: string): Promise<OCRResult> {
    const startTime = Date.now();
    let worker: any = null;

    let timeoutTimer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => {
        reject(new Error(`OCR processing timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      if (timeoutTimer && typeof timeoutTimer.unref === 'function') {
        timeoutTimer.unref();
      }
    });

    const ocrPromise = (async (): Promise<OCRResult> => {
      worker = await createWorker(this.languages);
      const ret = await worker.recognize(imageBuffer);
      await worker.terminate();
      worker = null;
      const durationMs = Date.now() - startTime;

      return {
        rawText: ret.data.text || '',
        confidence: ret.data.confidence || 80,
        detectedLanguage: this.languages.includes('vie') ? 'vie' : 'eng',
        durationMs,
        provider: 'tesseract.js-local',
      };
    })();

    try {
      const result = await Promise.race([ocrPromise, timeoutPromise]);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      return result;
    } catch (err: any) {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (worker) {
        try {
          await worker.terminate();
        } catch {
          // ignore
        }
      }
      throw err;
    }
  }
}
