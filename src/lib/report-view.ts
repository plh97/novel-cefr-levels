import type { AnalysisReport, DerivedReport } from './analyzer'

export function normalizeToken(token: string): string {
  let next = token.toLowerCase().replaceAll('’', "'")
  if (next.endsWith("'s") && next.length > 3) {
    next = next.slice(0, -2)
  }

  if (next.length > 3) {
    if (next.endsWith('ies')) {
      next = `${next.slice(0, -3)}y`
    } else if (
      next.endsWith('ches') ||
      next.endsWith('shes') ||
      next.endsWith('xes') ||
      next.endsWith('zes') ||
      next.endsWith('ses')
    ) {
      next = next.slice(0, -2)
    } else if (!next.endsWith('ss') && !next.endsWith('us') && !next.endsWith('is') && next.endsWith('s')) {
      next = next.slice(0, -1)
    }
  }

  return next
}

export function parseWordList(text: string): string[] {
  const words = new Set<string>()
  for (const token of text.split(/[^A-Za-z']+/)) {
    const normalized = normalizeToken(token.trim())
    if (normalized) {
      words.add(normalized)
    }
  }
  return [...words].sort((left, right) => left.localeCompare(right))
}

function describeReadability(tokenCoverage: number): { label: string; hint: string } {
  if (tokenCoverage >= 0.98) {
    return {
      label: 'Comfortable',
      hint: 'You already know enough running words to read this with low friction.',
    }
  }

  if (tokenCoverage >= 0.95) {
    return {
      label: 'Readable',
      hint: 'You should read this book with occasional lookups, but without much pain.',
    }
  }

  if (tokenCoverage >= 0.9) {
    return {
      label: 'Tolerable',
      hint: 'You can read it, but the unknown vocabulary will slow you down.',
    }
  }

  return {
    label: 'Painful',
    hint: 'Too many running words are still unknown. Grow the known-word list first.',
  }
}

export function deriveReport(report: AnalysisReport, knownWords: string[]): DerivedReport {
  const knownSet = new Set(knownWords)
  const vocabulary = report.vocabulary.map((entry) => ({
    ...entry,
    isKnown: knownSet.has(entry.word),
  }))

  const knownUniqueCount = vocabulary.filter((entry) => entry.isKnown).length
  const knownTokenCount = vocabulary.reduce((sum, entry) => {
    return sum + (entry.isKnown ? entry.count : 0)
  }, 0)
  const knownTypeCoverage = report.uniqueVocabulary === 0 ? 0 : knownUniqueCount / report.uniqueVocabulary
  const knownTokenCoverage = report.totalTokens === 0 ? 0 : knownTokenCount / report.totalTokens
  const readability = describeReadability(knownTokenCoverage)

  const keywords = vocabulary
    .filter((entry) => !entry.isKnown && !entry.isStopword && !entry.isProperNoun)
    .sort((left, right) => {
      if (right.keywordScore !== left.keywordScore) {
        return right.keywordScore - left.keywordScore
      }
      return right.count - left.count
    })

  const properNouns = vocabulary
    .filter((entry) => entry.isProperNoun && !entry.isKnown)
    .sort((left, right) => right.count - left.count)

  return {
    report,
    vocabulary,
    knownUniqueCount,
    knownTokenCount,
    knownTypeCoverage,
    knownTokenCoverage,
    readabilityLabel: readability.label,
    readabilityHint: readability.hint,
    keywords,
    properNouns,
    memorizeVocabulary: keywords,
  }
}