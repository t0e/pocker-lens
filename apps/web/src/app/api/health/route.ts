import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    app: 'pocketlens-web',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    phase: 'Phase 1: Project Foundation',
  })
}
