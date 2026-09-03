export interface OCRResult {
  rawText: string
  confidence: number
  detectedLanguage?: string
  durationMs: number
  provider: string
}

export interface OCRProvider {
  extractText(imageBuffer: Buffer, mimeType: string): Promise<OCRResult>
}

export class MockOCRProvider implements OCRProvider {
  private mockText: string
  private confidence: number

  constructor(mockText = '', confidence = 90) {
    this.mockText = mockText
    this.confidence = confidence
  }

  async extractText(
    _imageBuffer: Buffer,
    _mimeType: string,
  ): Promise<OCRResult> {
    return {
      rawText: this.mockText,
      confidence: this.confidence,
      detectedLanguage: 'eng+vie',
      durationMs: 10,
      provider: 'mock-ocr',
    }
  }
}
