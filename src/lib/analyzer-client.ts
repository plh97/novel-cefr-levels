import type { AnalysisReport } from './analyzer'

type AnalyzeWorkerSuccessMessage = {
  requestId: string
  report: AnalysisReport
}

type AnalyzeWorkerErrorMessage = {
  requestId: string
  error: string
}

type AnalyzeWorkerMessage = AnalyzeWorkerSuccessMessage | AnalyzeWorkerErrorMessage

export function analyzeTextInWorker(text: string, fileName: string): Promise<AnalysisReport> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/analyzer.worker.ts', import.meta.url), {
      type: 'module',
    })
    const requestId = crypto.randomUUID()

    worker.onmessage = (event: MessageEvent<AnalyzeWorkerMessage>) => {
      const message = event.data
      if (message.requestId !== requestId) {
        return
      }

      worker.terminate()
      if ('report' in message) {
        resolve(message.report)
        return
      }

      reject(new Error(message.error))
    }

    worker.onerror = () => {
      worker.terminate()
      reject(new Error('Failed to analyze text in the browser worker.'))
    }

    worker.postMessage({
      requestId,
      text,
      fileName,
    })
  })
}