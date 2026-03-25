'use client'

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
  type MouseEvent,
} from 'react'
import { useAtom } from 'jotai'
import {
  type DerivedVocabularyEntry,
  type AnalysisReport,
} from './lib/analyzer'
import { CEFR_ORDER } from './lib/cefr'
import { deriveReport, parseWordList } from './lib/report-view'
import {
  activeReportIdAtom,
  knownWordsAtom,
  reportsAtom,
  selectedWordsAtom,
} from './state'

type ViewMode = 'unknown' | 'all' | 'known' | 'keywords' | 'proper'

const viewLabels: Array<{ value: ViewMode; label: string }> = [
  { value: 'unknown', label: 'Unknown words' },
  { value: 'all', label: 'All vocabulary' },
  { value: 'known', label: 'Known words' },
  { value: 'keywords', label: 'Key words' },
  { value: 'proper', label: 'Names & places' },
]

const PAGE_SIZE = 20

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function statCardTone(label: string): string {
  if (label === 'Comfortable') {
    return 'border-emerald-700/30 bg-emerald-100/70 text-emerald-950'
  }
  if (label === 'Readable') {
    return 'border-teal-700/30 bg-teal-100/70 text-teal-950'
  }
  if (label === 'Tolerable') {
    return 'border-amber-700/30 bg-amber-100/70 text-amber-950'
  }
  return 'border-rose-700/30 bg-rose-100/70 text-rose-950'
}

function rowTone(entry: DerivedVocabularyEntry): string {
  if (entry.isKnown) {
    return 'bg-emerald-50/70'
  }
  if (entry.isProperNoun) {
    return 'bg-sky-50/70'
  }
  return 'bg-white/60'
}

function selectedRowTone(isSelected: boolean): string {
  return isSelected ? 'ring-2 ring-[var(--accent)] ring-inset bg-amber-50/90' : ''
}

function isNestedInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(target.closest('button,input,a,textarea,select,label'))
}

function renderTags(entry: DerivedVocabularyEntry) {
  return (
    <div className="flex flex-wrap gap-2">
      {entry.isKnown && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-950">known</span>}
      {entry.isProperNoun && <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-950">name</span>}
      {entry.isStopword && <span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs font-semibold text-stone-700">function</span>}
      {!entry.isKnown && !entry.isStopword && !entry.isProperNoun && (
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-950">memorize</span>
      )}
    </div>
  )
}

function App() {
  const [reports, setReports] = useAtom(reportsAtom)
  const [activeReportId, setActiveReportId] = useAtom(activeReportIdAtom)
  const [knownWords, setKnownWords] = useAtom(knownWordsAtom)
  const [selectedWords, setSelectedWords] = useAtom(selectedWordsAtom)

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [search, setSearch] = useState('')
  const [knownWordsDraft, setKnownWordsDraft] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('unknown')
  const [hideNamesAndPlaces, setHideNamesAndPlaces] = useState(true)
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null)
  const [rangeSelectionCount, setRangeSelectionCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [status, setStatus] = useState('Upload a .txt novel and the browser will analyze it locally.')

  const deferredSearch = useDeferredValue(search)
  const activeReport = reports.find((report) => report.id === activeReportId) ?? reports[0] ?? null
  const derived = activeReport ? deriveReport(activeReport, knownWords) : null

  let visibleRows = derived?.vocabulary ?? []
  if (derived) {
    if (viewMode === 'unknown') {
      visibleRows = derived.vocabulary.filter((entry) => !entry.isKnown)
    }
    if (viewMode === 'known') {
      visibleRows = derived.vocabulary.filter((entry) => entry.isKnown)
    }
    if (viewMode === 'keywords') {
      visibleRows = derived.keywords
    }
    if (viewMode === 'proper') {
      visibleRows = derived.properNouns
    }
  }

  const query = deferredSearch.trim().toLowerCase()
  if (query) {
    visibleRows = visibleRows.filter((entry) => entry.word.includes(query))
  }

  if (hideNamesAndPlaces && viewMode !== 'proper') {
    visibleRows = visibleRows.filter((entry) => !entry.isProperNoun)
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [activeReportId, viewMode, query])

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageStartIndex = (safeCurrentPage - 1) * PAGE_SIZE
  const pageEndIndex = pageStartIndex + PAGE_SIZE
  const pagedRows = visibleRows.slice(pageStartIndex, pageEndIndex)

  async function handleUpload(file: File | null) {
    if (!file) {
      return
    }

    setIsAnalyzing(true)
    setStatus(`Analyzing ${file.name}...`)

    try {
      const text = await file.text()
      requestAnimationFrame(() => {
        startTransition(async () => {
          const analyzer = await import('./lib/analyzer')
          const report: AnalysisReport = analyzer.analyzeText(text, file.name)
          setReports((previous) => [report, ...previous.filter((item) => item.id !== report.id)].slice(0, 12))
          setActiveReportId(report.id)
          setSelectedWords([])
          setViewMode('unknown')
          setStatus(`Finished analyzing ${file.name}.`)
          setIsAnalyzing(false)
        })
      })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to read the file.')
      setIsAnalyzing(false)
    }
  }

  function mergeKnownWords(words: string[]) {
    if (words.length === 0) {
      return
    }

    setKnownWords((previous) => {
      const next = new Set(previous)
      for (const word of words) {
        next.add(word)
      }
      return [...next].sort((left, right) => left.localeCompare(right))
    })
  }

  function addDraftKnownWords() {
    const nextWords = parseWordList(knownWordsDraft)
    mergeKnownWords(nextWords)
    setKnownWordsDraft('')
  }

  function removeKnownWord(word: string) {
    setKnownWords((previous) => previous.filter((item) => item !== word))
  }

  function toggleSelectedWord(word: string) {
    setSelectedWords((previous) => {
      if (previous.includes(word)) {
        return previous.filter((item) => item !== word)
      }
      return [...previous, word]
    })
  }

  function handleWordPick(word: string, shiftKey: boolean) {
    const selectableWords = pagedRows
      .filter((entry) => !entry.isKnown)
      .map((entry) => entry.word)

    if (!shiftKey || !selectionAnchor || !selectableWords.includes(selectionAnchor)) {
      setSelectionAnchor(word)
      setRangeSelectionCount(1)
      toggleSelectedWord(word)
      return
    }

    const startIndex = selectableWords.indexOf(selectionAnchor)
    const endIndex = selectableWords.indexOf(word)

    if (endIndex === -1) {
      setSelectionAnchor(word)
      setRangeSelectionCount(1)
      toggleSelectedWord(word)
      return
    }

    const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex]
    const rangeWords = selectableWords.slice(from, to + 1)

    setSelectedWords((previous) => [...new Set([...previous, ...rangeWords])])
    setRangeSelectionCount(rangeWords.length)
  }

  function handleCheckboxClick(word: string, event: MouseEvent<HTMLInputElement>) {
    event.preventDefault()
    handleWordPick(word, event.shiftKey)
  }

  function handleItemClick(
    word: string,
    isKnown: boolean,
    event: MouseEvent<HTMLElement>,
  ) {
    if (isKnown || isNestedInteractiveTarget(event.target)) {
      return
    }

    handleWordPick(word, event.shiftKey)
  }

  function selectVisibleUnknownWords() {
    const nextWords = pagedRows
      .filter((entry) => !entry.isKnown)
      .map((entry) => entry.word)

    setSelectedWords((previous) => [...new Set([...previous, ...nextWords])])
    setRangeSelectionCount(nextWords.length)
  }

  function unselectCurrentPageWords() {
    const currentPageWords = new Set(pagedRows.map((entry) => entry.word))
    setSelectedWords((previous) => previous.filter((word) => !currentPageWords.has(word)))
    setRangeSelectionCount(0)
  }

  function addSelectedToKnownWords() {
    mergeKnownWords(selectedWords)
    setSelectedWords([])
    setRangeSelectionCount(0)
    setSelectionAnchor(null)
  }

  function deleteReport(reportId: string) {
    setReports((previous) => previous.filter((report) => report.id !== reportId))
    if (activeReportId === reportId) {
      const next = reports.find((report) => report.id !== reportId) ?? null
      setActiveReportId(next?.id ?? null)
    }
  }

  const comfortTone = derived ? statCardTone(derived.readabilityLabel) : ''

  return (
    <main className="ink-grid min-h-screen px-4 py-6 text-stone-900 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="fade-up glass-card overflow-hidden rounded-[32px] border border-[var(--line)]">
          <div className="grid gap-6 px-6 py-8 sm:px-8 lg:grid-cols-[1.3fr_0.7fr] lg:px-10 lg:py-10">
            <div className="space-y-6">
              <span className="inline-flex rounded-full border border-[var(--line)] bg-white/60 px-4 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">
                Novel Reader Audit
              </span>
              <div className="space-y-4">
                <h1 className="max-w-4xl font-[var(--font-display)] text-4xl leading-none tracking-[-0.05em] text-[var(--ink)] sm:text-5xl lg:text-7xl">
                  Find out whether a novel is readable before you sink hours into it.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
                  Upload a plain text book, compare its vocabulary against your own known-word list, and decide whether the reading experience will feel comfortable, tolerable, or painful.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-3xl border border-[var(--line)] bg-white/70 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Upload</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">TXT books only. Analysis runs locally in your browser.</p>
                </div>
                <div className="rounded-3xl border border-[var(--line)] bg-white/70 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Results</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">Vocabulary counts, CEFR estimate, key words, and memorize lists.</p>
                </div>
                <div className="rounded-3xl border border-[var(--line)] bg-white/70 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Known words</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">Your vocabulary list stays in localStorage and updates readability instantly.</p>
                </div>
                <div className="rounded-3xl border border-[var(--line)] bg-white/70 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Selection</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">Multi-select unknown words and promote them into your known list.</p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(255,247,233,0.92))] p-5 sm:p-6">
              <div className="flex h-full flex-col gap-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Upload book</p>
                  <label className="mt-3 flex cursor-pointer flex-col gap-3 rounded-[24px] border border-dashed border-[var(--accent)] bg-white/90 p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                    <span className="font-[var(--font-display)] text-2xl text-[var(--ink)]">Choose a .txt novel</span>
                    <span className="text-sm leading-6 text-[var(--muted)]">Click here to select a book file and store the analysis locally.</span>
                    <input
                      className="hidden"
                      type="file"
                      accept=".txt,text/plain"
                      onChange={(event) => {
                        void handleUpload(event.target.files?.[0] ?? null)
                        event.currentTarget.value = ''
                      }}
                    />
                  </label>
                </div>

                <div className="rounded-[24px] border border-[var(--line)] bg-stone-950 px-4 py-4 text-stone-50">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Status</p>
                  <p className="mt-2 text-sm leading-6">{isAnalyzing ? 'Working through the text now...' : status}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    className="rounded-2xl border border-[var(--accent-strong)] bg-[var(--accent-strong)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                    type="button"
                    onClick={() => setSearch('')}
                  >
                    Clear search
                  </button>
                  <button
                    className="rounded-2xl border border-rose-800/20 bg-rose-100/80 px-4 py-3 text-sm font-semibold text-rose-950 transition hover:bg-rose-200"
                    type="button"
                    onClick={() => {
                      setReports([])
                      setActiveReportId(null)
                      setSelectedWords([])
                    }}
                  >
                    Clear saved reports
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="fade-up flex flex-col gap-6">
            <div className="glass-card rounded-[28px] border border-[var(--line)] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Known vocabulary</p>
                  <h2 className="mt-2 font-[var(--font-display)] text-3xl leading-none tracking-[-0.04em]">{knownWords.length}</h2>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]"
                  onClick={() => setKnownWords([])}
                >
                  Clear
                </button>
              </div>

              <textarea
                className="mt-4 min-h-32 w-full rounded-[22px] border border-[var(--line)] bg-white/80 px-4 py-3 text-sm leading-6 outline-none transition focus:border-[var(--accent)]"
                placeholder="Paste known words here, separated by spaces, commas, or new lines."
                value={knownWordsDraft}
                onChange={(event) => setKnownWordsDraft(event.target.value)}
              />

              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  className="rounded-2xl border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                  onClick={addDraftKnownWords}
                >
                  Add words
                </button>
                <button
                  type="button"
                  className="rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--ink)]"
                  onClick={() => setKnownWordsDraft('')}
                >
                  Reset field
                </button>
              </div>

              <div className="mt-4 flex max-h-72 flex-wrap gap-2 overflow-auto pr-1">
                {knownWords.length === 0 ? (
                  <p className="text-sm leading-6 text-[var(--muted)]">No known words yet.</p>
                ) : (
                  knownWords.map((word) => (
                    <button
                      key={word}
                      type="button"
                      className="rounded-full border border-[var(--line)] bg-white/80 px-3 py-1 text-sm text-[var(--ink)] transition hover:border-rose-700 hover:text-rose-700"
                      onClick={() => removeKnownWord(word)}
                    >
                      {word}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="glass-card rounded-[28px] border border-[var(--line)] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Saved analyses</p>
              <div className="mt-4 flex max-h-[32rem] flex-col gap-3 overflow-auto pr-1">
                {reports.length === 0 ? (
                  <p className="text-sm leading-6 text-[var(--muted)]">Upload a book to create the first report.</p>
                ) : (
                  reports.map((report) => (
                    <div
                      key={report.id}
                      className={`rounded-[22px] border p-4 ${activeReport?.id === report.id ? 'border-[var(--accent)] bg-white' : 'border-[var(--line)] bg-white/70'}`}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => setActiveReportId(report.id)}
                      >
                        <p className="line-clamp-2 text-sm font-semibold leading-6 text-[var(--ink)]">{report.fileName}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                          {formatDate(report.createdAt)}
                        </p>
                      </button>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
                        <span>{report.uniqueVocabulary} words</span>
                        <button type="button" className="font-semibold text-rose-700" onClick={() => deleteReport(report.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          <section className="fade-up flex flex-col gap-6">
            {derived ? (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <div className="glass-card rounded-[28px] border border-[var(--line)] p-5 xl:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Book</p>
                    <h2 className="mt-3 font-[var(--font-display)] text-3xl leading-none tracking-[-0.04em] text-[var(--ink)]">
                      {derived.report.fileName}
                    </h2>
                    <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-[var(--muted)]">
                      <div>
                        <p>Total tokens</p>
                        <p className="mt-1 text-2xl font-semibold text-[var(--ink)]">{derived.report.totalTokens.toLocaleString()}</p>
                      </div>
                      <div>
                        <p>Unique words</p>
                        <p className="mt-1 text-2xl font-semibold text-[var(--ink)]">{derived.report.uniqueVocabulary.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  <div className="glass-card rounded-[28px] border border-[var(--line)] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">CEFR</p>
                    <p className="mt-3 text-4xl font-semibold text-[var(--ink)]">{derived.report.cefr.allWords.estimatedBookLevel}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Core words without names: {derived.report.cefr.coreWordsNoNames.estimatedBookLevel}</p>
                  </div>

                  <div className={`glass-card rounded-[28px] border p-5 ${comfortTone}`}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em]">Readability</p>
                    <p className="mt-3 text-4xl font-semibold">{derived.readabilityLabel}</p>
                    <p className="mt-2 text-sm leading-6">{derived.readabilityHint}</p>
                  </div>

                  <div className="glass-card rounded-[28px] border border-[var(--line)] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Coverage</p>
                    <p className="mt-3 text-4xl font-semibold text-[var(--ink)]">{formatPercent(derived.knownTokenCoverage)}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Known token coverage. Type coverage: {formatPercent(derived.knownTypeCoverage)}</p>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="glass-card rounded-[28px] border border-[var(--line)] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Reading ability</p>
                        <h3 className="mt-2 font-[var(--font-display)] text-3xl tracking-[-0.04em]">How much of this book you already know</h3>
                      </div>
                      <div className="rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--ink)]">
                        {derived.knownUniqueCount.toLocaleString()} / {derived.report.uniqueVocabulary.toLocaleString()} unique words
                      </div>
                    </div>

                    <div className="mt-5 space-y-4">
                      <div>
                        <div className="mb-2 flex items-center justify-between text-sm text-[var(--muted)]">
                          <span>Known token coverage</span>
                          <span>{formatPercent(derived.knownTokenCoverage)}</span>
                        </div>
                        <div className="h-3 rounded-full bg-stone-200">
                          <div className="h-3 rounded-full bg-[var(--accent-strong)]" style={{ width: formatPercent(derived.knownTokenCoverage) }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 flex items-center justify-between text-sm text-[var(--muted)]">
                          <span>Known type coverage</span>
                          <span>{formatPercent(derived.knownTypeCoverage)}</span>
                        </div>
                        <div className="h-3 rounded-full bg-stone-200">
                          <div className="h-3 rounded-full bg-[var(--accent)]" style={{ width: formatPercent(derived.knownTypeCoverage) }}></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="glass-card rounded-[28px] border border-[var(--line)] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">CEFR token share</p>
                    <div className="mt-4 space-y-3">
                      {CEFR_ORDER.map((level) => (
                        <div key={level}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="font-semibold text-[var(--ink)]">{level}</span>
                            <span className="text-[var(--muted)]">{formatPercent(derived.report.cefr.allWords.tokenShare[level])}</span>
                          </div>
                          <div className="h-2 rounded-full bg-stone-200">
                            <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: formatPercent(derived.report.cefr.allWords.tokenShare[level]) }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="glass-card rounded-[28px] border border-[var(--line)] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Key words</p>
                        <h3 className="mt-2 font-[var(--font-display)] text-3xl tracking-[-0.04em]">Words worth learning first</h3>
                      </div>
                      <span className="rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--ink)]">
                        {derived.keywords.length.toLocaleString()} unknown
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3">
                      {derived.keywords.slice(0, 12).map((entry) => (
                        <button
                          key={entry.word}
                          type="button"
                          className={`flex items-center justify-between rounded-[22px] border px-4 py-3 text-left transition hover:border-[var(--accent)] ${selectedWords.includes(entry.word) ? 'border-[var(--accent)] bg-amber-50' : 'border-[var(--line)] bg-white/75'}`}
                          onClick={(event) => handleItemClick(entry.word, entry.isKnown, event)}
                        >
                          <div>
                            <p className="text-base font-semibold text-[var(--ink)]">{entry.word}</p>
                            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{entry.cefr} · {entry.count} hits</p>
                          </div>
                          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                            {selectedWords.includes(entry.word) ? 'Selected' : 'Select'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="glass-card rounded-[28px] border border-[var(--line)] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Proper nouns</p>
                        <h3 className="mt-2 font-[var(--font-display)] text-3xl tracking-[-0.04em]">Names and places</h3>
                      </div>
                      <span className="rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--ink)]">
                        {derived.properNouns.length.toLocaleString()} items
                      </span>
                    </div>

                    <div className="mt-4 flex max-h-[27rem] flex-wrap gap-2 overflow-auto pr-1">
                      {derived.properNouns.slice(0, 40).map((entry) => (
                        <span key={entry.word} className="rounded-full border border-sky-700/20 bg-sky-100/70 px-3 py-1 text-sm text-sky-950">
                          {entry.word} · {entry.count}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="glass-card rounded-[28px] border border-[var(--line)] p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Vocabulary table</p>
                      <h3 className="mt-2 font-[var(--font-display)] text-3xl tracking-[-0.04em]">All words, counts, CEFR, and selection</h3>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {viewLabels.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${viewMode === item.value ? 'bg-[var(--accent-strong)] text-white' : 'border border-[var(--line)] bg-white/80 text-[var(--ink)]'}`}
                          onClick={() => setViewMode(item.value)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto]">
                    <input
                      className="rounded-2xl border border-[var(--line)] bg-white/85 px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
                      placeholder="Search a word..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    <label className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/85 px-4 py-3 text-sm font-semibold text-[var(--ink)]">
                      <input
                        type="checkbox"
                        checked={hideNamesAndPlaces}
                        onChange={(event) => setHideNamesAndPlaces(event.target.checked)}
                      />
                      Hide names / places
                    </label>
                    <button
                      type="button"
                      className="rounded-2xl border border-[var(--accent-strong)] bg-[var(--accent-strong)] px-4 py-3 text-sm font-semibold text-white"
                      onClick={selectVisibleUnknownWords}
                    >
                      Select all on page
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-[var(--line)] bg-white/85 px-4 py-3 text-sm font-semibold text-[var(--ink)]"
                      onClick={unselectCurrentPageWords}
                    >
                      Unselect page
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-emerald-700/20 bg-emerald-100/80 px-4 py-3 text-sm font-semibold text-emerald-950"
                      onClick={() =>
                        mergeKnownWords(
                          pagedRows
                            .filter((entry) => !entry.isKnown)
                            .map((entry) => entry.word),
                        )
                      }
                    >
                      Mark page known
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-[var(--accent)] bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white"
                      onClick={addSelectedToKnownWords}
                    >
                      Add selected ({selectedWords.length})
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-[var(--line)] bg-white/85 px-4 py-3 text-sm font-semibold text-[var(--ink)]"
                      onClick={() => {
                        setSelectedWords([])
                        setRangeSelectionCount(0)
                        setSelectionAnchor(null)
                      }}
                    >
                      Clear selection
                    </button>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
                    Showing page {safeCurrentPage.toLocaleString()} of {totalPages.toLocaleString()} from {visibleRows.length.toLocaleString()} rows. Unknown words are the best place to build your personal vocabulary list.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
                    <span className="rounded-full border border-[var(--line)] bg-white/80 px-3 py-1.5 font-semibold text-[var(--ink)]">
                      Selected: {selectedWords.length.toLocaleString()}
                    </span>
                    <span className="rounded-full border border-[var(--line)] bg-white/80 px-3 py-1.5">
                      Range size: {rangeSelectionCount.toLocaleString()}
                    </span>
                    <span className="rounded-full border border-[var(--line)] bg-white/80 px-3 py-1.5">
                      Start: {selectionAnchor ?? 'not set'}
                    </span>
                    <span className="rounded-full border border-[var(--line)] bg-white/80 px-3 py-1.5">
                      Word forms: merged
                    </span>
                    <span>Tip: click one checkbox, then Shift-click another word to group select the range inside the current page.</span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="rounded-2xl border border-[var(--line)] bg-white/85 px-4 py-2 text-sm font-semibold text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={safeCurrentPage <= 1}
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    >
                      Previous page
                    </button>
                    <span className="rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--ink)]">
                      Page {safeCurrentPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className="rounded-2xl border border-[var(--line)] bg-white/85 px-4 py-2 text-sm font-semibold text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    >
                      Next page
                    </button>
                  </div>

                  <div className="mt-4 overflow-auto rounded-[24px] border border-[var(--line)] bg-white/70">
                    <div className="min-w-[960px]">
                      <div className="grid grid-cols-[72px_minmax(220px,1.6fr)_110px_100px_120px_minmax(240px,1fr)] border-b border-stone-800 bg-stone-950 text-left text-sm text-stone-50">
                        <div className="px-4 py-3 font-semibold">Pick</div>
                        <div className="px-4 py-3 font-semibold">Word</div>
                        <div className="px-4 py-3 font-semibold">Count</div>
                        <div className="px-4 py-3 font-semibold">CEFR</div>
                        <div className="px-4 py-3 font-semibold">Rank</div>
                        <div className="px-4 py-3 font-semibold">Tags</div>
                      </div>

                      <div>
                        {pagedRows.map((entry) => (
                          <div
                            key={entry.word}
                            className={`grid cursor-pointer grid-cols-[72px_minmax(220px,1.6fr)_110px_100px_120px_minmax(240px,1fr)] border-b border-[var(--line)] text-left text-sm transition hover:bg-stone-50/90 ${rowTone(entry)} ${selectedRowTone(selectedWords.includes(entry.word))}`}
                            onClick={(event) => handleItemClick(entry.word, entry.isKnown, event)}
                          >
                            <div className="px-4 py-3">
                              <input
                                type="checkbox"
                                readOnly
                                disabled={entry.isKnown}
                                checked={selectedWords.includes(entry.word)}
                                onClick={(event) => handleCheckboxClick(entry.word, event)}
                              />
                            </div>
                            <div className="px-4 py-3">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="font-semibold text-[var(--ink)]">{entry.word}</span>
                                {!entry.isKnown && (
                                  <button
                                    type="button"
                                    className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted)]"
                                    onClick={() => mergeKnownWords([entry.word])}
                                  >
                                    Know it
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="px-4 py-3 text-[var(--muted)]">{entry.count.toLocaleString()}</div>
                            <div className="px-4 py-3">
                              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-[var(--ink)]">{entry.cefr}</span>
                            </div>
                            <div className="px-4 py-3 text-[var(--muted)]">{entry.rank?.toLocaleString() ?? '—'}</div>
                            <div className="px-4 py-3">{renderTags(entry)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="glass-card rounded-[32px] border border-[var(--line)] p-10 text-center">
                <h2 className="font-[var(--font-display)] text-4xl tracking-[-0.05em] text-[var(--ink)]">No novel analyzed yet</h2>
                <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
                  Upload a plain text file to see vocabulary size, CEFR distribution, known-word coverage, key words, and a complete word table that you can use to grow your reading comfort.
                </p>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  )
}

export default App
