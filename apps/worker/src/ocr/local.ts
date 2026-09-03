import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { OCRProvider, OCRResult } from '@pocketlens/shared'
import {
  preprocessForOCR,
  ImageQuality,
  CandidateImage,
  OCRDebugInfo,
} from './preprocess.js'

export interface EnhancedOCRResult extends OCRResult {
  quality: ImageQuality
  candidateCount: number
  bestCandidate: string
  debug: OCRDebugInfo
}

const RECEIPT_KEYWORDS = [
  'total',
  'subtotal',
  'sub total',
  'tax',
  'vat',
  'cash',
  'change',
  'amount',
  'date',
  'receipt',
  'invoice',
  'payment',
  'tổng',
  'tổng cộng',
  'thành tiền',
  'tổng tiền',
  'thanh toán',
  'tiền mặt',
  'tiền thừa',
  'tiền khách',
  'hóa đơn',
  'phiếu',
  'giảm giá',
  'chiết khấu',
  'tạm tính',
  'thuế',
  'momo',
  'giá trị mua',
  'giá bán lẻ',
  'giá km',
]

/**
 * Score OCR text quality for receipt suitability.
 */
export function scoreOCRText(
  text: string,
  tesseractConfidence: number,
  isCropped = false,
): number {
  if (!text || text.trim().length === 0) return 0

  let score = 0
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  const totalChars = text.length
  const printableChars = text.replace(
    /[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g,
    '',
  ).length
  const printRatio = totalChars > 0 ? printableChars / totalChars : 0

  if (isCropped) score += 10

  if (totalChars > 200) score += 20
  else if (totalChars > 100) score += 15
  else if (totalChars > 50) score += 10
  else score += 3

  score += printRatio * 15

  if (lines.length > 10) score += 15
  else if (lines.length > 5) score += 10
  else score += 3

  const numericTokens = text.match(/\d{2,}/g) || []
  if (numericTokens.length > 5) score += 15
  else if (numericTokens.length > 2) score += 10
  else score += 2

  const lowerText = text.toLowerCase()
  const keywordMatches = RECEIPT_KEYWORDS.filter((kw) =>
    lowerText.includes(kw),
  ).length
  if (keywordMatches >= 4) score += 25
  else if (keywordMatches >= 2) score += 15
  else if (keywordMatches >= 1) score += 8

  score += (tesseractConfidence / 100) * 10

  if (!isCropped && totalChars > 1000) score -= 10

  return Math.round(score)
}

let nativeTesseractChecked = false
let hasNativeTesseract = false

async function checkNativeTesseract(): Promise<boolean> {
  if (nativeTesseractChecked) return hasNativeTesseract

  return new Promise((resolve) => {
    const child = spawn('tesseract', ['--version'])
    child.on('error', () => {
      nativeTesseractChecked = true
      hasNativeTesseract = false
      resolve(false)
    })
    child.on('close', (code) => {
      nativeTesseractChecked = true
      hasNativeTesseract = code === 0
      resolve(hasNativeTesseract)
    })
  })
}

/**
 * Execute OCR in an isolated child process reading an image file path.
 * This completely isolates OCR / WASM memory from the main Node worker.
 */
async function runIsolatedOCR(
  imagePath: string,
  languages: string,
  timeoutMs: number,
): Promise<{ rawText: string; confidence: number }> {
  const isNative = await checkNativeTesseract()

  if (isNative) {
    // Native C++ Tesseract CLI (installed in Docker / production)
    return new Promise((resolve, reject) => {
      const child = spawn(
        'tesseract',
        [imagePath, 'stdout', '-l', languages, '--psm', '6'],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )

      let stdout = ''
      let stderr = ''

      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`Native OCR timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf-8')
      })

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf-8')
      })

      child.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })

      child.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0 || stdout.trim().length > 0) {
          resolve({
            rawText: stdout,
            confidence: 85,
          })
        } else {
          reject(new Error(`Tesseract exited with code ${code}: ${stderr}`))
        }
      })
    })
  }

  // Node child process runner fallback (for local dev / environments without native tesseract)
  return new Promise((resolve, reject) => {
    // Determine path to cli-runner.js or cli-runner.ts
    const runnerDir = path.dirname(new URL(import.meta.url).pathname)
    const runnerScript = path.join(runnerDir, 'cli-runner.js')

    // In development / ts-node / tsx environments, use ts file if js not found
    const runnerArgs = [runnerScript, imagePath, languages]

    const child = spawn(process.execPath, runnerArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`Child OCR timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf-8')
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf-8')
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        try {
          const parsed = JSON.parse(stdout)
          resolve({
            rawText: parsed.rawText || '',
            confidence: parsed.confidence || 50,
          })
        } catch {
          resolve({
            rawText: stdout,
            confidence: 50,
          })
        }
      } else {
        reject(
          new Error(`OCR child process exited with code ${code}: ${stderr}`),
        )
      }
    })
  })
}

/**
 * Multi-pass OCR provider.
 * Uses isolated child processes and temp files.
 * Zero persistent memory retention in Node.
 */
export class LocalOCRProvider implements OCRProvider {
  private languages: string
  private timeoutMs: number

  constructor(languages = 'eng+vie', timeoutMs = 45000) {
    this.languages = languages
    this.timeoutMs = timeoutMs
  }

  async extractText(imageBuffer: Buffer, mimeType: string): Promise<OCRResult> {
    const startTime = Date.now()
    const jobId = crypto.randomUUID()
    const tempDir = path.join(os.tmpdir(), `pocketlens-ocr-${jobId}`)

    await fs.mkdir(tempDir, { recursive: true })

    let bestText = ''
    let bestScore = -1
    let bestConfidence = 0
    let bestCandidateLabel = 'none'
    let candidateCount = 0

    let quality: ImageQuality = {
      width: 0,
      height: 0,
      brightness: 128,
      contrast: 40,
      sharpness: 25,
      rating: 'fair',
      details: [],
    }

    let debug: OCRDebugInfo = {
      documentDetected: false,
      documentConfidence: 0,
      documentAreaFraction: 0,
      perspectiveCorrected: false,
      originalDimensions: '',
      croppedDimensions: '',
      candidateLabels: [],
    }

    try {
      // 1. Preprocessing: bounded candidate generator
      const preprocessResult = await preprocessForOCR(imageBuffer)
      quality = preprocessResult.quality
      debug = preprocessResult.debug

      // 2. Process candidates sequentially
      let candidateIndex = 0
      for await (const candidate of preprocessResult.generateCandidates()) {
        candidateIndex++
        candidateCount++

        const candidateFilePath = path.join(
          tempDir,
          `cand-${candidateIndex}.png`,
        )

        try {
          // Write candidate to temp file
          await fs.writeFile(candidateFilePath, candidate.buffer)

          // Run OCR in isolated child process
          const perCandidateTimeout = Math.floor(this.timeoutMs / 2)
          const result = await runIsolatedOCR(
            candidateFilePath,
            this.languages,
            perCandidateTimeout,
          )

          const score = scoreOCRText(
            result.rawText,
            result.confidence,
            candidate.isCropped,
          )

          if (score > bestScore) {
            bestScore = score
            bestText = result.rawText
            bestConfidence = result.confidence
            bestCandidateLabel = candidate.label
          }

          // Early exit: If high-quality score reached, stop and do not run further passes
          if (score >= 60) {
            break
          }
        } finally {
          // Immediately delete candidate file to release disk space
          await fs.unlink(candidateFilePath).catch(() => {})
        }
      }
    } finally {
      // Clean up temp directory
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }

    const durationMs = Date.now() - startTime

    const enhancedResult: EnhancedOCRResult = {
      rawText: bestText,
      confidence: bestConfidence,
      detectedLanguage: this.languages.includes('vie') ? 'vie' : 'eng',
      durationMs,
      provider: hasNativeTesseract
        ? 'tesseract-native-cli'
        : 'tesseract.js-child-process',
      quality,
      candidateCount,
      bestCandidate: bestCandidateLabel,
      debug,
    }

    return enhancedResult
  }
}
