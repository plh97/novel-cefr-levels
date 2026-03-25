import { atom } from 'jotai'
import { atomWithStorage, createJSONStorage } from 'jotai/utils'
import type { AnalysisReport } from './lib/analyzer'

const knownWordsStorage = createJSONStorage<string[]>(() => localStorage)
const reportsStorage = createJSONStorage<AnalysisReport[]>(() => localStorage)
const activeReportStorage = createJSONStorage<string | null>(() => localStorage)

export const knownWordsAtom = atomWithStorage<string[]>(
  'novel-reader-known-words',
  [],
  knownWordsStorage,
)

export const reportsAtom = atomWithStorage<AnalysisReport[]>(
  'novel-reader-analysis-reports',
  [],
  reportsStorage,
)

export const activeReportIdAtom = atomWithStorage<string | null>(
  'novel-reader-active-report-id',
  null,
  activeReportStorage,
)

export const selectedWordsAtom = atom<string[]>([])