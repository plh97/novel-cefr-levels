import { analyzeText, type AnalysisReport } from '../lib/analyzer'

type AnalyzeRequestMessage = {
  requestId: string
  text: string
  fileName: string
}

type AnalyzeSuccessMessage = {
  requestId: string
  report: AnalysisReport
}

type AnalyzeErrorMessage = {
  requestId: string
  error: string
}

self.onmessage = (event: MessageEvent<AnalyzeRequestMessage>) => {
  const { requestId, text, fileName } = event.data

  try {
    const report = analyzeText(text, fileName)
    const message: AnalyzeSuccessMessage = {
      requestId,
      report,
    }
    self.postMessage(message)
  } catch (error) {
    const message: AnalyzeErrorMessage = {
      requestId,
      error: error instanceof Error ? error.message : 'Failed to analyze text.',
    }
    self.postMessage(message)
  }
}