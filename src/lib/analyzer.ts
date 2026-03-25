import vocabularyRanks from 'vocabulary-list-statistics'
import { CEFR_ORDER, type CefrLevel } from './cefr'

type CefrStats = {
  tokenShare: Record<CefrLevel, number>
  typeShare: Record<CefrLevel, number>
  requiredLevelFor90: CefrLevel
  requiredLevelFor95: CefrLevel
  weightedLevel: CefrLevel
  dominantLevel: CefrLevel
}

export type VocabularyEntry = {
  word: string
  count: number
  rank: number | null
  cefr: CefrLevel
  isProperNoun: boolean
  isStopword: boolean
  keywordScore: number
}

export type AnalysisReport = {
  id: string
  fileName: string
  createdAt: string
  totalTokens: number
  uniqueVocabulary: number
  typeTokenRatio: number
  cefr: {
    allWords: {
      estimatedBookLevel: CefrLevel
      requiredLevelFor90TokenCoverage: CefrLevel
      requiredLevelFor95TokenCoverage: CefrLevel
      dominantTokenLevel: CefrLevel
      tokenShare: Record<CefrLevel, number>
      typeShare: Record<CefrLevel, number>
    }
    coreWordsNoNames: {
      estimatedBookLevel: CefrLevel
      requiredLevelFor90TokenCoverage: CefrLevel
      requiredLevelFor95TokenCoverage: CefrLevel
      dominantTokenLevel: CefrLevel
      tokenShare: Record<CefrLevel, number>
      typeShare: Record<CefrLevel, number>
    }
  }
  vocabulary: VocabularyEntry[]
}

export type DerivedVocabularyEntry = VocabularyEntry & {
  isKnown: boolean
}

export type DerivedReport = {
  report: AnalysisReport
  vocabulary: DerivedVocabularyEntry[]
  knownUniqueCount: number
  knownTokenCount: number
  knownTypeCoverage: number
  knownTokenCoverage: number
  readabilityLabel: string
  readabilityHint: string
  keywords: DerivedVocabularyEntry[]
  properNouns: DerivedVocabularyEntry[]
  memorizeVocabulary: DerivedVocabularyEntry[]
}

type RankRecord = {
  rank: number
  word: string
}

const STOPWORDS = new Set([
  'a',
  'about',
  'after',
  'again',
  'against',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  'did',
  'do',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'itself',
  'just',
  'me',
  'more',
  'most',
  'my',
  'myself',
  'no',
  'nor',
  'not',
  'now',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  'same',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
])

const CEFR_LIMITS: Array<{ level: CefrLevel; maxRank: number }> = [
  { level: 'A1', maxRank: 600 },
  { level: 'A2', maxRank: 1200 },
  { level: 'B1', maxRank: 2500 },
  { level: 'B2', maxRank: 5000 },
  { level: 'C1', maxRank: 10000 },
  { level: 'C2', maxRank: 20000 },
]

const KEYWORD_WEIGHTS: Record<CefrLevel, number> = {
  A1: 0.65,
  A2: 0.95,
  B1: 1.35,
  B2: 1.9,
  C1: 2.6,
  C2: 3.4,
}

const rankMap = new Map<string, number>()
for (const item of vocabularyRanks as RankRecord[]) {
  rankMap.set(item.word, item.rank)
}

const IRREGULAR_SINGULARS = new Map<string, string>([
  ['children', 'child'],
  ['men', 'man'],
  ['women', 'woman'],
  ['people', 'person'],
  ['feet', 'foot'],
  ['teeth', 'tooth'],
  ['mice', 'mouse'],
  ['geese', 'goose'],
])

const CONTRACTION_EXPANSIONS = new Map<string, string[]>([
  ["i'm", ['i', 'am']],
  ["you're", ['you', 'are']],
  ["we're", ['we', 'are']],
  ["they're", ['they', 'are']],
  ["he's", ['he', 'is']],
  ["she's", ['she', 'is']],
  ["it's", ['it', 'is']],
  ["that's", ['that', 'is']],
  ["there's", ['there', 'is']],
  ["what's", ['what', 'is']],
  ["who's", ['who', 'is']],
  ["i've", ['i', 'have']],
  ["you've", ['you', 'have']],
  ["we've", ['we', 'have']],
  ["they've", ['they', 'have']],
  ["i'll", ['i', 'will']],
  ["you'll", ['you', 'will']],
  ["we'll", ['we', 'will']],
  ["they'll", ['they', 'will']],
  ["he'll", ['he', 'will']],
  ["she'll", ['she', 'will']],
  ["it'll", ['it', 'will']],
  ["i'd", ['i', 'would']],
  ["you'd", ['you', 'would']],
  ["we'd", ['we', 'would']],
  ["they'd", ['they', 'would']],
  ["he'd", ['he', 'would']],
  ["she'd", ['she', 'would']],
  ["don't", ['do', 'not']],
  ["doesn't", ['does', 'not']],
  ["didn't", ['did', 'not']],
  ["can't", ['can', 'not']],
  ["couldn't", ['could', 'not']],
  ["won't", ['will', 'not']],
  ["wouldn't", ['would', 'not']],
  ["shouldn't", ['should', 'not']],
  ["isn't", ['is', 'not']],
  ["aren't", ['are', 'not']],
  ["wasn't", ['was', 'not']],
  ["weren't", ['were', 'not']],
  ["haven't", ['have', 'not']],
  ["hasn't", ['has', 'not']],
  ["hadn't", ['had', 'not']],
])

function normalizeToken(token: string): string {
  let next = token.toLowerCase().replaceAll('’', "'")
  if (next.endsWith("'s") && next.length > 3) {
    next = next.slice(0, -2)
  }
  return next
}

function singularizeToken(token: string): string {
  if (token.length <= 3 || STOPWORDS.has(token)) {
    return token
  }

  const irregular = IRREGULAR_SINGULARS.get(token)
  if (irregular) {
    return irregular
  }

  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`
  }

  if (
    token.endsWith('ches') ||
    token.endsWith('shes') ||
    token.endsWith('xes') ||
    token.endsWith('zes') ||
    token.endsWith('ses')
  ) {
    return token.slice(0, -2)
  }

  if (token.endsWith('s') && !token.endsWith('ss') && !token.endsWith('us') && !token.endsWith('is')) {
    return token.slice(0, -1)
  }

  return token
}

function canonicalizeToken(token: string): string {
  const singular = singularizeToken(token)
  if (singular !== token) {
    return singular
  }
  return token
}

function expandToken(token: string): string[] {
  const expanded = CONTRACTION_EXPANSIONS.get(token)
  if (!expanded) {
    return [canonicalizeToken(token)]
  }

  return expanded.map((item) => canonicalizeToken(item))
}

function tokenize(text: string): string[] {
  const matches = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []
  return matches.flatMap((match) => expandToken(normalizeToken(match)))
}

function detectProperNouns(text: string, minOccurrence = 3): Set<string> {
  const words = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []
  const total = new Map<string, number>()
  const titleCase = new Map<string, number>()
  const lowerCase = new Map<string, number>()

  for (const word of words) {
    const normalized = canonicalizeToken(normalizeToken(word))
    if (normalized.length < 3) {
      continue
    }

    total.set(normalized, (total.get(normalized) ?? 0) + 1)
    if (word[0] === word[0]?.toUpperCase() && word.slice(1) === word.slice(1).toLowerCase()) {
      titleCase.set(normalized, (titleCase.get(normalized) ?? 0) + 1)
    }
    if (word === word.toLowerCase()) {
      lowerCase.set(normalized, (lowerCase.get(normalized) ?? 0) + 1)
    }
  }

  const properNouns = new Set<string>()
  for (const [word, count] of total.entries()) {
    if (count < minOccurrence) {
      continue
    }

    const titleHits = titleCase.get(word) ?? 0
    const lowerHits = lowerCase.get(word) ?? 0
    if (titleHits / count >= 0.8 && lowerHits === 0) {
      properNouns.add(word)
    }
  }

  return properNouns
}

function rankToCefr(rank: number | null): CefrLevel {
  if (rank == null) {
    return 'C2'
  }

  for (const limit of CEFR_LIMITS) {
    if (rank <= limit.maxRank) {
      return limit.level
    }
  }

  return 'C2'
}

function computeKeywordScore(count: number, cefr: CefrLevel, rank: number | null): number {
  const rankBoost = rank == null ? 1.25 : 1 + Math.min(rank, 20000) / 20000
  return Number((count * KEYWORD_WEIGHTS[cefr] * rankBoost).toFixed(3))
}

function blankShare(): Record<CefrLevel, number> {
  return {
    A1: 0,
    A2: 0,
    B1: 0,
    B2: 0,
    C1: 0,
    C2: 0,
  }
}

function computeCefrStats(entries: VocabularyEntry[]): CefrStats {
  const totalTokens = entries.reduce((sum, entry) => sum + entry.count, 0)
  const totalTypes = entries.length
  const tokenByLevel = blankShare()
  const typeByLevel = blankShare()

  for (const entry of entries) {
    tokenByLevel[entry.cefr] += entry.count
    typeByLevel[entry.cefr] += 1
  }

  const tokenShare = blankShare()
  const typeShare = blankShare()
  for (const level of CEFR_ORDER) {
    tokenShare[level] = totalTokens === 0 ? 0 : tokenByLevel[level] / totalTokens
    typeShare[level] = totalTypes === 0 ? 0 : typeByLevel[level] / totalTypes
  }

  let cumulative = 0
  let requiredLevelFor90: CefrLevel = 'C2'
  let requiredLevelFor95: CefrLevel = 'C2'

  for (const level of CEFR_ORDER) {
    cumulative += tokenShare[level]
    if (cumulative >= 0.9 && requiredLevelFor90 === 'C2') {
      requiredLevelFor90 = level
    }
    if (cumulative >= 0.95) {
      requiredLevelFor95 = level
      break
    }
  }

  let weightedScore = 0
  for (const [index, level] of CEFR_ORDER.entries()) {
    weightedScore += (index + 1) * tokenShare[level]
  }

  let weightedLevel: CefrLevel = 'C2'
  let bestDistance = Number.POSITIVE_INFINITY
  for (const [index, level] of CEFR_ORDER.entries()) {
    const distance = Math.abs(index + 1 - weightedScore)
    if (distance < bestDistance) {
      weightedLevel = level
      bestDistance = distance
    }
  }

  let dominantLevel: CefrLevel = 'A1'
  let dominantShare = -1
  for (const level of CEFR_ORDER) {
    if (tokenShare[level] > dominantShare) {
      dominantShare = tokenShare[level]
      dominantLevel = level
    }
  }

  return {
    tokenShare,
    typeShare,
    requiredLevelFor90,
    requiredLevelFor95,
    weightedLevel,
    dominantLevel,
  }
}

export function analyzeText(text: string, fileName: string): AnalysisReport {
  const tokens = tokenize(text)
  const counter = new Map<string, number>()

  for (const token of tokens) {
    counter.set(token, (counter.get(token) ?? 0) + 1)
  }

  const properNouns = detectProperNouns(text)
  const vocabulary = [...counter.entries()]
    .map(([word, count]) => {
      const rank = rankMap.get(word) ?? null
      const cefr = rankToCefr(rank)
      const isStopword = STOPWORDS.has(word)
      const isProperNoun = properNouns.has(word)

      return {
        word,
        count,
        rank,
        cefr,
        isProperNoun,
        isStopword,
        keywordScore: isStopword || isProperNoun ? 0 : computeKeywordScore(count, cefr, rank),
      }
    })
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count
      }
      return left.word.localeCompare(right.word)
    })

  const allWordsStats = computeCefrStats(vocabulary)
  const coreWordsStats = computeCefrStats(vocabulary.filter((entry) => !entry.isProperNoun))

  return {
    id: crypto.randomUUID(),
    fileName,
    createdAt: new Date().toISOString(),
    totalTokens: tokens.length,
    uniqueVocabulary: vocabulary.length,
    typeTokenRatio: tokens.length === 0 ? 0 : vocabulary.length / tokens.length,
    cefr: {
      allWords: {
        estimatedBookLevel: allWordsStats.weightedLevel,
        requiredLevelFor90TokenCoverage: allWordsStats.requiredLevelFor90,
        requiredLevelFor95TokenCoverage: allWordsStats.requiredLevelFor95,
        dominantTokenLevel: allWordsStats.dominantLevel,
        tokenShare: allWordsStats.tokenShare,
        typeShare: allWordsStats.typeShare,
      },
      coreWordsNoNames: {
        estimatedBookLevel: coreWordsStats.weightedLevel,
        requiredLevelFor90TokenCoverage: coreWordsStats.requiredLevelFor90,
        requiredLevelFor95TokenCoverage: coreWordsStats.requiredLevelFor95,
        dominantTokenLevel: coreWordsStats.dominantLevel,
        tokenShare: coreWordsStats.tokenShare,
        typeShare: coreWordsStats.typeShare,
      },
    },
    vocabulary,
  }
}