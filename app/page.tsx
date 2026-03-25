import { readFile } from 'node:fs/promises'
import path from 'node:path'
import App from '../src/App'
import { analyzeText, type AnalysisReport } from '../src/lib/analyzer'
import { EXAMPLE_NOVELS, findExampleNovel } from '../src/lib/examples'

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const rawExample = resolvedSearchParams.example
  const exampleSlug = Array.isArray(rawExample) ? (rawExample[0] ?? null) : (rawExample ?? null)
  const exampleNovel = findExampleNovel(exampleSlug)

  let exampleError: string | null = null
  let initialReports: AnalysisReport[] = []
  let initialActiveReportId: string | null = null

  if (exampleSlug && !exampleNovel) {
    exampleError = 'The requested example novel could not be found.'
  }

  if (exampleNovel) {
    const filePath = path.join(process.cwd(), exampleNovel.sourcePath)

    try {
      const text = await readFile(filePath, 'utf8')
      const report = analyzeText(text, exampleNovel.fileName)
      report.id = `example:${exampleNovel.slug}`
      initialReports = [report]
      initialActiveReportId = report.id
    } catch (error) {
      exampleError = error instanceof Error ? error.message : 'Failed to load the example novel.'
    }
  }

  return (
    <App
      exampleNovels={EXAMPLE_NOVELS}
      initialExampleSlug={exampleNovel?.slug ?? null}
      exampleError={exampleError}
      initialReports={initialReports}
      initialActiveReportId={initialActiveReportId}
    />
  )
}