/**
 * Standalone CLI OCR Worker
 *
 * Designed to be executed as a separate child process.
 * Reads image from a file path, runs Tesseract.js in an isolated process,
 * outputs structured JSON to stdout, and immediately exits.
 *
 * Usage:
 *   node cli-runner.js <imagePath> <languages>
 */

import { createWorker, PSM } from 'tesseract.js'

async function main() {
  const imagePath = process.argv[2]
  const languages = process.argv[3] || 'eng+vie'

  if (!imagePath) {
    console.error(JSON.stringify({ error: 'Missing imagePath argument' }))
    process.exit(1)
  }

  let worker: Awaited<ReturnType<typeof createWorker>> | null = null

  try {
    worker = await createWorker(languages, 1, {})
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    })

    const ret = await worker.recognize(imagePath)
    await worker.terminate()
    worker = null

    const result = {
      rawText: ret.data.text || '',
      confidence:
        typeof ret.data.confidence === 'number' ? ret.data.confidence : 50,
    }

    // Write result JSON to stdout for parent process to read
    process.stdout.write(JSON.stringify(result))
    process.exit(0)
  } catch (err) {
    if (worker) {
      try {
        await worker.terminate()
      } catch {
        /* ignore */
      }
    }
    const message = err instanceof Error ? err.message : String(err)
    console.error(JSON.stringify({ error: message }))
    process.exit(1)
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(JSON.stringify({ error: message }))
  process.exit(1)
})
