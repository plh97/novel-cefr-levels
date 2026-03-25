'use client'

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
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
import type { ExampleNovel } from './lib/examples'
import {
  activeReportIdAtom,
  knownWordsAtom,
  reportsAtom,
  selectedWordsAtom,
} from './state'

type ViewMode = 'unknown' | 'all' | 'known' | 'keywords' | 'proper'
type UiLanguage = 'en' | 'zh'

const UI_COPY: Record<UiLanguage, Record<string, string>> = {
  en: {
    badge: 'Novel Reader Audit',
    language: 'Language',
    heroTitle: 'Find out whether a novel is readable before you sink hours into it.',
    heroDescription: 'Upload a plain text book, compare its vocabulary against your own known-word list, and decide whether the reading experience will feel comfortable, tolerable, or painful.',
    upload: 'Upload',
    uploadDesc: 'TXT books only. Analysis runs locally in your browser.',
    results: 'Results',
    resultsDesc: 'Vocabulary counts, CEFR estimate, key words, and memorize lists.',
    knownWords: 'Known words',
    knownWordsDesc: 'Your vocabulary list stays in localStorage and updates readability instantly.',
    selection: 'Selection',
    selectionDesc: 'Multi-select unknown words and promote them into your known list.',
    exampleNovels: 'Example novels',
    allSamplesSaved: 'All samples are already saved.',
    uploadBook: 'Upload book',
    chooseNovel: 'Choose a .txt novel',
    chooseNovelHint: 'Click here to select a book file and store the analysis locally.',
    status: 'Status',
    statusIdle: 'Upload a .txt novel and the browser will analyze it locally.',
    statusWorking: 'Working through the text now...',
    clearSearch: 'Clear search',
    clearSavedReports: 'Clear saved reports',
    knownVocabulary: 'Known vocabulary',
    clear: 'Clear',
    knownWordsPlaceholder: 'Paste known words here, separated by spaces, commas, or new lines.',
    addWords: 'Add words',
    resetField: 'Reset field',
    noKnownWords: 'No known words yet.',
    savedAnalyses: 'Saved analyses',
    uploadFirstReport: 'Upload a book to create the first report.',
    wordsUnit: 'words',
    remove: 'Remove',
    sample: 'Sample',
    viewUnknown: 'Unknown words',
    viewAll: 'All vocabulary',
    viewKnown: 'Known words',
    viewKeywords: 'Key words',
    viewProper: 'Names & places',
    noNovel: 'No novel analyzed yet',
    noNovelDescription: 'Upload a plain text file to see vocabulary size, CEFR distribution, known-word coverage, key words, and a complete word table that you can use to grow your reading comfort.',
  },
  zh: {
    badge: '小说可读性审计',
    language: '语言',
    heroTitle: '在投入大量时间前，先判断这本小说是否适合你阅读。',
    heroDescription: '上传纯文本小说，对照你的已知词表，快速判断阅读体验是轻松、可读，还是吃力。',
    upload: '上传',
    uploadDesc: '仅支持 TXT。分析在浏览器本地完成。',
    results: '结果',
    resultsDesc: '词汇统计、CEFR 估计、关键词与记忆词清单。',
    knownWords: '已知词',
    knownWordsDesc: '你的词表保存在 localStorage，并实时更新可读性。',
    selection: '选择',
    selectionDesc: '可多选未知词并加入已知词。',
    exampleNovels: '示例小说',
    allSamplesSaved: '所有示例已保存。',
    uploadBook: '上传书籍',
    chooseNovel: '选择 .txt 小说',
    chooseNovelHint: '点击选择书籍文件，分析结果会保存在本地。',
    status: '状态',
    statusIdle: '上传 .txt 小说后，浏览器将本地分析。',
    statusWorking: '正在分析文本...',
    clearSearch: '清空搜索',
    clearSavedReports: '清空已保存分析',
    knownVocabulary: '已知词汇',
    clear: '清空',
    knownWordsPlaceholder: '在这里粘贴已知词，可用空格、逗号或换行分隔。',
    addWords: '添加词汇',
    resetField: '重置输入',
    noKnownWords: '暂无已知词。',
    savedAnalyses: '已保存分析',
    uploadFirstReport: '上传一本书以创建第一份分析。',
    wordsUnit: '词',
    remove: '删除',
    sample: '示例',
    viewUnknown: '未知词',
    viewAll: '全部词汇',
    viewKnown: '已知词',
    viewKeywords: '关键词',
    viewProper: '人名地名',
    noNovel: '还没有分析任何小说',
    noNovelDescription: '上传纯文本后，即可查看词汇规模、CEFR 分布、已知词覆盖率、关键词以及完整词表，帮助你更轻松阅读。',
  },
}

const PAGE_SIZE = 20

export type AppProps = {
  exampleNovels?: ExampleNovel[]
  initialExampleSlug?: string | null
  exampleError?: string | null
  initialReports?: AnalysisReport[]
  initialActiveReportId?: string | null
}

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

function renderTags(entry: DerivedVocabularyEntry, labels: Record<string, string>) {
  return (
    <div className="flex flex-wrap gap-2">
      {entry.isKnown && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-950">{labels.viewKnown}</span>}
      {entry.isProperNoun && <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-950">{labels.viewProper}</span>}
      {entry.isStopword && <span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs font-semibold text-stone-700">function</span>}
      {!entry.isKnown && !entry.isStopword && !entry.isProperNoun && (
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-950">memorize</span>
      )}
    </div>
  )
}

function exampleHref(slug: string): string {
  return `/?example=${encodeURIComponent(slug)}`
}

function App({
  exampleNovels = [],
  initialExampleSlug = null,
  exampleError = null,
  initialReports = [],
  initialActiveReportId = null,
}: AppProps) {
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>('en')
  const [reports, setReports] = useAtom(reportsAtom)
  const [activeReportId, setActiveReportId] = useAtom(activeReportIdAtom)
  const [knownWords, setKnownWords] = useAtom(knownWordsAtom)
  const [selectedWords, setSelectedWords] = useAtom(selectedWordsAtom)
  const initialHydratedRef = useRef(false)

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [search, setSearch] = useState('')
  const [knownWordsDraft, setKnownWordsDraft] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('unknown')
  const [hideNamesAndPlaces, setHideNamesAndPlaces] = useState(true)
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null)
  const [rangeSelectionCount, setRangeSelectionCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [status, setStatus] = useState(UI_COPY.en.statusIdle)

  useEffect(() => {
    const storedLanguage = typeof window !== 'undefined' ? window.localStorage.getItem('novel-reader-language') : null
    if (storedLanguage === 'en' || storedLanguage === 'zh') {
      setUiLanguage(storedLanguage)
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('novel-reader-language', uiLanguage)
    }
  }, [uiLanguage])

  const labels = UI_COPY[uiLanguage]

  const viewLabels: Array<{ value: ViewMode; label: string }> = [
    { value: 'unknown', label: labels.viewUnknown },
    { value: 'all', label: labels.viewAll },
    { value: 'known', label: labels.viewKnown },
    { value: 'keywords', label: labels.viewKeywords },
    { value: 'proper', label: labels.viewProper },
  ]

  const deferredSearch = useDeferredValue(search)
  const activeReport = reports.find((report) => report.id === activeReportId) ?? reports[0] ?? null
  const derived = activeReport ? deriveReport(activeReport, knownWords) : null
  const savedReportFileNames = new Set(reports.map((report) => report.fileName))
  const availableExampleNovels = exampleNovels.filter(
    (example) => !savedReportFileNames.has(example.fileName),
  )

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

  useEffect(() => {
    if (initialHydratedRef.current) {
      return
    }

    if (initialReports.length > 0) {
      setReports((previous) => {
        const seen = new Set<string>()
        const merged: AnalysisReport[] = []
        for (const report of [...initialReports, ...previous]) {
          const key = `${report.id}:${report.fileName}`
          if (seen.has(key)) {
            continue
          }
          seen.add(key)
          merged.push(report)
        }
        return merged.slice(0, 12)
      })
    }

    if (initialActiveReportId) {
      setActiveReportId(initialActiveReportId)
    }

    if (exampleError) {
      setStatus(exampleError)
    } else if (initialExampleSlug) {
      const selectedExample = exampleNovels.find((example) => example.slug === initialExampleSlug)
      if (selectedExample) {
        setStatus(
          uiLanguage === 'zh'
            ? `已加载服务端示例：${selectedExample.title}。`
            : `Server-rendered example loaded: ${selectedExample.title}.`,
        )
      }
    }

    initialHydratedRef.current = true
  }, [exampleError, exampleNovels, initialActiveReportId, initialExampleSlug, initialReports, setActiveReportId, setReports, uiLanguage])

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const PAGINATION_WINDOW = 5
  const halfWindow = Math.floor(PAGINATION_WINDOW / 2)
  let windowStart = Math.max(1, safeCurrentPage - halfWindow)
  let windowEnd = Math.min(totalPages, windowStart + PAGINATION_WINDOW - 1)
  windowStart = Math.max(1, windowEnd - PAGINATION_WINDOW + 1)
  const visiblePageNumbers = Array.from({ length: windowEnd - windowStart + 1 }, (_, index) => windowStart + index)
  const pageStartIndex = (safeCurrentPage - 1) * PAGE_SIZE
  const pageEndIndex = pageStartIndex + PAGE_SIZE
  const pagedRows = visibleRows.slice(pageStartIndex, pageEndIndex)

  async function handleUpload(file: File | null) {
    if (!file) {
      return
    }

    setIsAnalyzing(true)
    setStatus(uiLanguage === 'zh' ? `正在分析 ${file.name}...` : `Analyzing ${file.name}...`)

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
          setStatus(uiLanguage === 'zh' ? `${file.name} 分析完成。` : `Finished analyzing ${file.name}.`)
          setIsAnalyzing(false)
        })
      })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : (uiLanguage === 'zh' ? '读取文件失败。' : 'Failed to read the file.'))
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex rounded-full border border-[var(--line)] bg-white/60 px-4 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">
                  {labels.badge}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{labels.language}</span>
                  <button
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${uiLanguage === 'en' ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--line)] bg-white/80 text-[var(--ink)]'}`}
                    onClick={() => setUiLanguage('en')}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${uiLanguage === 'zh' ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--line)] bg-white/80 text-[var(--ink)]'}`}
                    onClick={() => setUiLanguage('zh')}
                  >
                    中文
                  </button>
                </div>
              </div>
              <div className="space-y-4">
                <h1 className="max-w-4xl font-[var(--font-display)] text-4xl leading-none tracking-[-0.05em] text-[var(--ink)] sm:text-5xl lg:text-7xl">
                  {labels.heroTitle}
                </h1>
                <p className="max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
                  {labels.heroDescription}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-3xl border border-[var(--line)] bg-white/70 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">{labels.upload}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{labels.uploadDesc}</p>
                </div>
                <div className="rounded-3xl border border-[var(--line)] bg-white/70 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">{labels.results}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{labels.resultsDesc}</p>
                </div>
                <div className="rounded-3xl border border-[var(--line)] bg-white/70 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">{labels.knownWords}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{labels.knownWordsDesc}</p>
                </div>
                <div className="rounded-3xl border border-[var(--line)] bg-white/70 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">{labels.selection}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{labels.selectionDesc}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(255,247,233,0.92))] p-5 sm:p-6">
              <div className="flex h-full flex-col gap-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">{labels.exampleNovels}</p>
                  <div className="mt-3 grid gap-3">
                    {availableExampleNovels.length === 0 ? (
                      <p className="rounded-[22px] border border-[var(--line)] bg-white/80 px-4 py-4 text-sm text-[var(--muted)]">
                        {labels.allSamplesSaved}
                      </p>
                    ) : (
                      availableExampleNovels.map((example) => (
                        <a
                          key={example.slug}
                          className={`rounded-[22px] border px-4 py-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-white ${initialExampleSlug === example.slug ? 'border-[var(--accent)] bg-amber-50/80' : 'border-[var(--line)] bg-white/80'}`}
                          href={exampleHref(example.slug)}
                        >
                          <p className="font-semibold text-[var(--ink)]">{example.title}</p>
                        </a>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">{labels.uploadBook}</p>
                  <label className="mt-3 flex cursor-pointer flex-col gap-3 rounded-[24px] border border-dashed border-[var(--accent)] bg-white/90 p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                    <span className="font-[var(--font-display)] text-2xl text-[var(--ink)]">{labels.chooseNovel}</span>
                    <span className="text-sm leading-6 text-[var(--muted)]">{labels.chooseNovelHint}</span>
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
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">{labels.status}</p>
                  <p className="mt-2 text-sm leading-6">{isAnalyzing ? labels.statusWorking : status}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    className="rounded-2xl border border-[var(--accent-strong)] bg-[var(--accent-strong)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                    type="button"
                    onClick={() => setSearch('')}
                  >
                    {labels.clearSearch}
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
                    {labels.clearSavedReports}
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
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{labels.knownVocabulary}</p>
                  <h2 className="mt-2 font-[var(--font-display)] text-3xl leading-none tracking-[-0.04em]">{knownWords.length}</h2>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]"
                  onClick={() => setKnownWords([])}
                >
                  {labels.clear}
                </button>
              </div>

              <textarea
                className="mt-4 min-h-32 w-full rounded-[22px] border border-[var(--line)] bg-white/80 px-4 py-3 text-sm leading-6 outline-none transition focus:border-[var(--accent)]"
                placeholder={labels.knownWordsPlaceholder}
                value={knownWordsDraft}
                onChange={(event) => setKnownWordsDraft(event.target.value)}
              />

              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  className="rounded-2xl border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                  onClick={addDraftKnownWords}
                >
                  {labels.addWords}
                </button>
                <button
                  type="button"
                  className="rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--ink)]"
                  onClick={() => setKnownWordsDraft('')}
                >
                  {labels.resetField}
                </button>
              </div>

              <div className="mt-4 flex max-h-72 flex-wrap gap-2 overflow-auto pr-1">
                {knownWords.length === 0 ? (
                  <p className="text-sm leading-6 text-[var(--muted)]">{labels.noKnownWords}</p>
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
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{labels.savedAnalyses}</p>
              <div className="mt-4 flex max-h-[32rem] flex-col gap-3 overflow-auto pr-1">
                {reports.length === 0 ? (
                  <p className="text-sm leading-6 text-[var(--muted)]">{labels.uploadFirstReport}</p>
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
                        <span>{report.uniqueVocabulary} {labels.wordsUnit}</span>
                        <button type="button" className="font-semibold text-rose-700" onClick={() => deleteReport(report.id)}>
                          {labels.remove}
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

                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      aria-label="Previous page"
                      className="h-12 w-12 rounded-full border border-stone-300 bg-white/80 text-2xl leading-none text-stone-500 transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={safeCurrentPage <= 1}
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    >
                      &#8249;
                    </button>

                    {visiblePageNumbers.map((pageNumber) => {
                      const isActive = pageNumber === safeCurrentPage
                      return (
                        <button
                          key={pageNumber}
                          type="button"
                          aria-label={`Go to page ${pageNumber}`}
                          className={`h-12 w-12 rounded-full border text-3xl font-semibold leading-none transition ${isActive ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-stone-300 bg-white/80 text-stone-500 hover:border-[var(--accent)] hover:text-[var(--accent)]'}`}
                          onClick={() => setCurrentPage(pageNumber)}
                        >
                          {pageNumber}
                        </button>
                      )
                    })}

                    <button
                      type="button"
                      aria-label="Next page"
                      className="h-12 w-12 rounded-full border border-stone-300 bg-white/80 text-2xl leading-none text-stone-500 transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    >
                      &#8250;
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
                            <div className="px-4 py-3">{renderTags(entry, labels)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="glass-card rounded-[32px] border border-[var(--line)] p-10 text-center">
                <h2 className="font-[var(--font-display)] text-4xl tracking-[-0.05em] text-[var(--ink)]">{labels.noNovel}</h2>
                <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
                  {labels.noNovelDescription}
                </p>
                <div className="mx-auto mt-8 grid max-w-4xl gap-3 text-left sm:grid-cols-2">
                  {availableExampleNovels.length === 0 ? (
                    <p className="sm:col-span-2 rounded-[24px] border border-[var(--line)] bg-white/80 px-5 py-4 text-sm text-[var(--muted)]">
                      {labels.allSamplesSaved}
                    </p>
                  ) : (
                    availableExampleNovels.map((example) => (
                      <a
                        key={example.slug}
                        className="rounded-[24px] border border-[var(--line)] bg-white/80 px-5 py-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)]"
                        href={exampleHref(example.slug)}
                      >
                        <p className="font-semibold text-[var(--ink)]">{example.title}</p>
                        {initialExampleSlug !== example.slug && (
                          <span className="mt-2 inline-flex rounded-full border border-[var(--line)] bg-stone-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                            {labels.sample}
                          </span>
                        )}
                      </a>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  )
}

export default App
