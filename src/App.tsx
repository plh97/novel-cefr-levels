import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
  type MouseEvent,
} from 'react'
import { Button, Checkbox, Input, Pagination, Segmented, Table, Tag, Upload } from 'antd'
import type { TableColumnsType, TableProps } from 'antd'
import type { UploadProps } from 'antd'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import {
  type DerivedVocabularyEntry,
  type AnalysisReport,
} from './lib/analyzer'
import { CEFR_ORDER } from './lib/cefr'
import { deriveReport, parseWordList } from './lib/report-view'
import type { ExampleNovel } from './lib/examples'
import ExampleNovelList from './components/ExampleNovelList'
import { resources, type SupportedLanguage } from './i18n'
import {
  activeReportIdAtom,
  knownWordsAtom,
  reportsAtom,
  selectedWordsAtom,
} from './state'

type ViewMode = 'unknown' | 'all' | 'known' | 'keywords' | 'proper'

const PAGE_SIZE = 20

export type AppProps = {
  exampleNovels?: ExampleNovel[]
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatDate(value: string, uiLanguage: SupportedLanguage): string {
  return new Intl.DateTimeFormat(uiLanguage === 'zh' ? 'zh-CN' : 'en', {
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
  return isSelected ? 'bg-amber-50/90' : ''
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
      {entry.isKnown && <Tag color="green">{labels.viewKnown}</Tag>}
      {entry.isProperNoun && <Tag color="cyan">{labels.viewProper}</Tag>}
      {entry.isStopword && <Tag>{labels.stopwordTag}</Tag>}
      {!entry.isKnown && !entry.isStopword && !entry.isProperNoun && (
        <Tag color="gold">{labels.memorizeTag}</Tag>
      )}
    </div>
  )
}

function localizeReadability(label: string, labels: Record<string, string>) {
  if (label === 'Comfortable') {
    return labels.comfortable
  }
  if (label === 'Readable') {
    return labels.readable
  }
  if (label === 'Tolerable') {
    return labels.tolerable
  }
  return labels.painful
}

function localizeReadabilityHint(label: string, labels: Record<string, string>) {
  if (label === 'Comfortable') {
    return labels.readabilityHintComfortable
  }
  if (label === 'Readable') {
    return labels.readabilityHintReadable
  }
  if (label === 'Tolerable') {
    return labels.readabilityHintTolerable
  }
  return labels.readabilityHintPainful
}

function readExampleSlugFromLocation(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  return new URLSearchParams(window.location.search).get('example')
}

function replaceExampleSlug(slug: string | null) {
  if (typeof window === 'undefined') {
    return
  }

  const url = new URL(window.location.href)

  if (slug) {
    url.searchParams.set('example', slug)
  } else {
    url.searchParams.delete('example')
  }

  window.history.pushState({}, '', url)
}

function App({ exampleNovels = [] }: AppProps) {
  const { i18n } = useTranslation()
  const [reports, setReports] = useAtom(reportsAtom)
  const [activeReportId, setActiveReportId] = useAtom(activeReportIdAtom)
  const [knownWords, setKnownWords] = useAtom(knownWordsAtom)
  const [selectedWords, setSelectedWords] = useAtom(selectedWordsAtom)
  const [activeExampleSlug, setActiveExampleSlug] = useState<string | null>(() => readExampleSlugFromLocation())

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [search, setSearch] = useState('')
  const [knownWordsDraft, setKnownWordsDraft] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('unknown')
  const [hideNamesAndPlaces, setHideNamesAndPlaces] = useState(true)
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null)
  const [rangeSelectionCount, setRangeSelectionCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const uiLanguage: SupportedLanguage = i18n.resolvedLanguage === 'zh' ? 'zh' : 'en'
  const labels = resources[uiLanguage].translation
  const [status, setStatus] = useState<string>(labels.statusIdle)

  useEffect(() => {
    setStatus((previous) => (previous === resources.en.translation.statusIdle || previous === resources.zh.translation.statusIdle
      ? labels.statusIdle
      : previous))
  }, [labels.statusIdle])

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
    if (typeof window === 'undefined') {
      return undefined
    }

    const handlePopState = () => {
      setActiveExampleSlug(readExampleSlugFromLocation())
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  useEffect(() => {
    if (!activeExampleSlug) {
      return undefined
    }

    const selectedExample = exampleNovels.find((example) => example.slug === activeExampleSlug)
    if (!selectedExample) {
      setStatus(
        uiLanguage === 'zh'
          ? '找不到请求的示例小说。'
          : 'The requested example novel could not be found.',
      )
      return undefined
    }

    const existingReport = reports.find((report) => report.id === `example:${selectedExample.slug}`)
    if (existingReport) {
      setActiveReportId(existingReport.id)
      setStatus(
        uiLanguage === 'zh'
          ? `已加载示例：${selectedExample.title}。`
          : `Loaded example: ${selectedExample.title}.`,
      )
      return undefined
    }

    let cancelled = false

    setIsAnalyzing(true)
    setStatus(
      uiLanguage === 'zh'
        ? `正在加载示例：${selectedExample.title}...`
        : `Loading example: ${selectedExample.title}...`,
    )

    void fetch(selectedExample.assetUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${selectedExample.fileName}.`)
        }

        const text = await response.text()
        if (cancelled) {
          return
        }

        const report = (await import('./lib/analyzer')).analyzeText(text, selectedExample.fileName)
        report.id = `example:${selectedExample.slug}`

        setReports((previous) => [report, ...previous.filter((item) => item.id !== report.id)].slice(0, 12))
        setActiveReportId(report.id)
        setSelectedWords([])
        setViewMode('unknown')
        setStatus(
          uiLanguage === 'zh'
            ? `示例已加载：${selectedExample.title}。`
            : `Example loaded: ${selectedExample.title}.`,
        )
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }

        setStatus(
          error instanceof Error
            ? error.message
            : (uiLanguage === 'zh' ? '加载示例小说失败。' : 'Failed to load the example novel.'),
        )
      })
      .finally(() => {
        if (!cancelled) {
          setIsAnalyzing(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeExampleSlug, exampleNovels, reports, setActiveReportId, setReports, setSelectedWords, uiLanguage])

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
    setStatus(uiLanguage === 'zh' ? `正在分析 ${file.name}...` : `Analyzing ${file.name}...`)

    try {
      const text = await file.text()
      requestAnimationFrame(() => {
        startTransition(async () => {
          const analyzer = await import('./lib/analyzer')
          const report: AnalysisReport = analyzer.analyzeText(text, file.name)
          setReports((previous) => [report, ...previous.filter((item) => item.id !== report.id)].slice(0, 12))
          setActiveReportId(report.id)
          replaceExampleSlug(null)
          setActiveExampleSlug(null)
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

    if (reportId === `example:${activeExampleSlug}`) {
      replaceExampleSlug(null)
      setActiveExampleSlug(null)
    }
  }

  function handleExampleSelect(slug: string) {
    replaceExampleSlug(slug)
    setActiveExampleSlug(slug)
  }

  const uploadProps: UploadProps = {
    accept: '.txt,text/plain',
    showUploadList: false,
    beforeUpload: (file) => {
      void handleUpload(file as File)
      return false
    },
  }

  const comfortTone = derived ? statCardTone(derived.readabilityLabel) : ''
  const readabilityLabel = derived ? localizeReadability(derived.readabilityLabel, labels) : ''
  const readabilityHint = derived ? localizeReadabilityHint(derived.readabilityLabel, labels) : ''

  const rowSelection: TableProps<DerivedVocabularyEntry>['rowSelection'] = {
    selectedRowKeys: selectedWords,
    onSelect: (record, selected, _selectedRows, nativeEvent) => {
      if (record.isKnown) {
        return
      }

      if ('shiftKey' in nativeEvent && nativeEvent.shiftKey) {
        handleWordPick(record.word, true)
        return
      }

      setSelectionAnchor(record.word)
      setRangeSelectionCount(1)
      setSelectedWords((previous) => {
        if (selected) {
          return [...new Set([...previous, record.word])]
        }

        return previous.filter((word) => word !== record.word)
      })
    },
    onSelectAll: (selected, _selectedRows, changeRows) => {
      const changedWords = changeRows
        .filter((entry) => !entry.isKnown)
        .map((entry) => entry.word)

      if (selected) {
        setSelectedWords((previous) => [...new Set([...previous, ...changedWords])])
        setRangeSelectionCount(changedWords.length)
        return
      }

      const changedWordSet = new Set(changedWords)
      setSelectedWords((previous) => previous.filter((word) => !changedWordSet.has(word)))
      setRangeSelectionCount(0)
    },
    getCheckboxProps: (record) => ({
      disabled: record.isKnown,
      name: record.word,
    }),
  }

  const vocabularyColumns: TableColumnsType<DerivedVocabularyEntry> = [
    {
      title: labels.tableWord,
      dataIndex: 'word',
      key: 'word',
      width: 260,
      render: (_, entry) => (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-[var(--ink)]">{entry.word}</span>
          {!entry.isKnown && (
            <Button
              size="small"
              className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted)]"
              onClick={() => mergeKnownWords([entry.word])}
            >
              {labels.knowIt}
            </Button>
          )}
        </div>
      ),
    },
    {
      title: labels.tableCount,
      dataIndex: 'count',
      key: 'count',
      width: 110,
      render: (value: number) => <span className="text-[var(--muted)]">{value.toLocaleString()}</span>,
    },
    {
      title: labels.cefr,
      dataIndex: 'cefr',
      key: 'cefr',
      width: 100,
      render: (value: string) => (
        <Tag>{value}</Tag>
      ),
    },
    {
      title: labels.tableRank,
      dataIndex: 'rank',
      key: 'rank',
      width: 120,
      render: (value: number | null) => <span className="text-[var(--muted)]">{value?.toLocaleString() ?? '—'}</span>,
    },
    {
      title: labels.tableTags,
      dataIndex: 'word',
      key: 'tags',
      width: 260,
      render: (_, entry) => renderTags(entry, labels),
    },
  ]

  return (
    <main className="ink-grid min-h-screen px-4 py-6 text-stone-900 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="fade-up glass-card overflow-hidden rounded-[32px] border border-[var(--line)]">
          <div className="grid gap-6 px-6 py-8 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:py-10">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex rounded-full border border-[var(--line)] bg-white/60 px-4 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">
                  {labels.badge}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{labels.language}</span>
                  <Button
                    size="small"
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${uiLanguage === 'en' ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--line)] bg-white/80 text-[var(--ink)]'}`}
                    onClick={() => void i18n.changeLanguage('en')}
                  >
                    EN
                  </Button>
                  <Button
                    size="small"
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${uiLanguage === 'zh' ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--line)] bg-white/80 text-[var(--ink)]'}`}
                    onClick={() => void i18n.changeLanguage('zh')}
                  >
                    中文
                  </Button>
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

            </div>

            <div className="rounded-[28px] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(255,247,233,0.92))] p-5 sm:p-6">
              <div className="flex h-full flex-col gap-5">
                {availableExampleNovels.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">{labels.exampleNovels}</p>
                    <div className="mt-3">
                      <ExampleNovelList
                        examples={availableExampleNovels}
                        activeExampleSlug={activeExampleSlug}
                        allSamplesSavedLabel={labels.allSamplesSaved}
                        onSelect={handleExampleSelect}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">{labels.uploadBook}</p>
                  <Upload.Dragger {...uploadProps} className="mt-3 overflow-hidden rounded-[24px] border-[var(--accent)] bg-white/90">
                    <div className="flex flex-col gap-3 p-2">
                      <span className="font-[var(--font-display)] text-2xl text-[var(--ink)]">{labels.chooseNovel}</span>
                      <span className="text-sm leading-6 text-[var(--muted)]">{labels.chooseNovelHint}</span>
                    </div>
                  </Upload.Dragger>
                </div>

                <div className="rounded-[24px] border border-[var(--line)] bg-stone-950 px-4 py-4 text-stone-50">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">{labels.status}</p>
                  <p className="mt-2 text-sm leading-6">{isAnalyzing ? labels.statusWorking : status}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    className="rounded-2xl border border-[var(--accent-strong)] bg-[var(--accent-strong)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                    onClick={() => setSearch('')}
                  >
                    {labels.clearSearch}
                  </Button>
                  <Button
                    className="rounded-2xl border border-rose-800/20 bg-rose-100/80 px-4 py-3 text-sm font-semibold text-rose-950 transition hover:bg-rose-200"
                    onClick={() => {
                      setReports([])
                      setActiveReportId(null)
                      replaceExampleSlug(null)
                      setActiveExampleSlug(null)
                      setSelectedWords([])
                    }}
                  >
                    {labels.clearSavedReports}
                  </Button>
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
                <Button
                  size="small"
                  className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]"
                  onClick={() => setKnownWords([])}
                >
                  {labels.clear}
                </Button>
              </div>

              <Input.TextArea
                className="mt-4 min-h-32 w-full rounded-[22px] border border-[var(--line)] bg-white/80 px-4 py-3 text-sm leading-6 outline-none transition focus:border-[var(--accent)]"
                placeholder={labels.knownWordsPlaceholder}
                value={knownWordsDraft}
                onChange={(event) => setKnownWordsDraft(event.target.value)}
                autoSize={{ minRows: 6 }}
              />

              <div className="mt-3 flex gap-3">
                <Button
                  className="rounded-2xl border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                  onClick={addDraftKnownWords}
                >
                  {labels.addWords}
                </Button>
                <Button
                  className="rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--ink)]"
                  onClick={() => setKnownWordsDraft('')}
                >
                  {labels.resetField}
                </Button>
              </div>

              <div className="mt-4 flex max-h-72 flex-wrap gap-2 overflow-auto pr-1">
                {knownWords.length === 0 ? (
                  <p className="text-sm leading-6 text-[var(--muted)]">{labels.noKnownWords}</p>
                ) : (
                  knownWords.map((word) => (
                    <Tag
                      key={word}
                      closable
                      onClose={(event) => {
                        event.preventDefault()
                        removeKnownWord(word)
                      }}
                    >
                      {word}
                    </Tag>
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
                      <Button
                        type="text"
                        className="w-full text-left"
                        onClick={() => setActiveReportId(report.id)}
                      >
                        <p className="line-clamp-2 text-sm font-semibold leading-6 text-[var(--ink)]">{report.fileName}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                          {formatDate(report.createdAt, uiLanguage)}
                        </p>
                      </Button>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
                        <span>{report.uniqueVocabulary} {labels.wordsUnit}</span>
                        <Button type="text" danger className="font-semibold" onClick={() => deleteReport(report.id)}>
                          {labels.remove}
                        </Button>
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
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{labels.book}</p>
                    <h2 className="mt-3 font-[var(--font-display)] text-3xl leading-none tracking-[-0.04em] text-[var(--ink)]">
                      {derived.report.fileName}
                    </h2>
                    <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-[var(--muted)]">
                      <div>
                        <p>{labels.totalTokens}</p>
                        <p className="mt-1 text-2xl font-semibold text-[var(--ink)]">{derived.report.totalTokens.toLocaleString()}</p>
                      </div>
                      <div>
                        <p>{labels.uniqueWords}</p>
                        <p className="mt-1 text-2xl font-semibold text-[var(--ink)]">{derived.report.uniqueVocabulary.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  <div className="glass-card rounded-[28px] border border-[var(--line)] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{labels.cefr}</p>
                    <p className="mt-3 text-4xl font-semibold text-[var(--ink)]">{derived.report.cefr.allWords.estimatedBookLevel}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{labels.coreWordsNoNames}: {derived.report.cefr.coreWordsNoNames.estimatedBookLevel}</p>
                  </div>

                  <div className={`glass-card rounded-[28px] border p-5 ${comfortTone}`}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em]">{labels.readability}</p>
                    <p className="mt-3 text-4xl font-semibold">{readabilityLabel}</p>
                    <p className="mt-2 text-sm leading-6">{readabilityHint}</p>
                  </div>

                  <div className="glass-card rounded-[28px] border border-[var(--line)] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{labels.coverage}</p>
                    <p className="mt-3 text-4xl font-semibold text-[var(--ink)]">{formatPercent(derived.knownTokenCoverage)}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{labels.knownTokenCoverage}. {labels.knownTypeCoverage}: {formatPercent(derived.knownTypeCoverage)}</p>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="glass-card rounded-[28px] border border-[var(--line)] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{labels.readingAbility}</p>
                        <h3 className="mt-2 font-[var(--font-display)] text-3xl tracking-[-0.04em]">{labels.readingAbilityTitle}</h3>
                      </div>
                        <Tag className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--ink)]">
                        {derived.knownUniqueCount.toLocaleString()} / {derived.report.uniqueVocabulary.toLocaleString()} {labels.uniqueWordsCountLabel}
                        </Tag>
                    </div>

                    <div className="mt-5 space-y-4">
                      <div>
                        <div className="mb-2 flex items-center justify-between text-sm text-[var(--muted)]">
                          <span>{labels.knownTokenCoverage}</span>
                          <span>{formatPercent(derived.knownTokenCoverage)}</span>
                        </div>
                        <div className="h-3 rounded-full bg-stone-200">
                          <div className="h-3 rounded-full bg-[var(--accent-strong)]" style={{ width: formatPercent(derived.knownTokenCoverage) }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 flex items-center justify-between text-sm text-[var(--muted)]">
                          <span>{labels.knownTypeCoverage}</span>
                          <span>{formatPercent(derived.knownTypeCoverage)}</span>
                        </div>
                        <div className="h-3 rounded-full bg-stone-200">
                          <div className="h-3 rounded-full bg-[var(--accent)]" style={{ width: formatPercent(derived.knownTypeCoverage) }}></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="glass-card rounded-[28px] border border-[var(--line)] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{labels.cefrTokenShare}</p>
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

                <div className="glass-card rounded-[28px] border border-[var(--line)] p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{labels.vocabularyTable}</p>
                      <h3 className="mt-2 font-[var(--font-display)] text-3xl tracking-[-0.04em]">{labels.vocabularyTableTitle}</h3>
                    </div>

                    <Segmented<ViewMode>
                      options={viewLabels.map((item) => ({
                        label: item.label,
                        value: item.value,
                      }))}
                      value={viewMode}
                      onChange={(value) => setViewMode(value)}
                    />
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto]">
                    <Input
                      className="rounded-2xl border border-[var(--line)] bg-white/85 px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
                      placeholder={labels.searchWord}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    <label className="flex items-center rounded-2xl border border-[var(--line)] bg-white/85 px-4 py-3 text-sm font-semibold text-[var(--ink)]">
                      <Checkbox
                        checked={hideNamesAndPlaces}
                        onChange={(event) => setHideNamesAndPlaces(event.target.checked)}
                      >
                        {labels.hideNamesAndPlaces}
                      </Checkbox>
                    </label>
                    <Button
                      className="rounded-2xl border border-[var(--accent-strong)] bg-[var(--accent-strong)] px-4 py-3 text-sm font-semibold text-white"
                      onClick={selectVisibleUnknownWords}
                    >
                      {labels.selectAllOnPage}
                    </Button>
                    <Button
                      className="rounded-2xl border border-[var(--line)] bg-white/85 px-4 py-3 text-sm font-semibold text-[var(--ink)]"
                      onClick={unselectCurrentPageWords}
                    >
                      {labels.unselectPage}
                    </Button>
                    <Button
                      className="rounded-2xl border border-emerald-700/20 bg-emerald-100/80 px-4 py-3 text-sm font-semibold text-emerald-950"
                      onClick={() =>
                        mergeKnownWords(
                          pagedRows
                            .filter((entry) => !entry.isKnown)
                            .map((entry) => entry.word),
                        )
                      }
                    >
                      {labels.markPageKnown}
                    </Button>
                    <Button
                      className="rounded-2xl border border-[var(--accent)] bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white"
                      onClick={addSelectedToKnownWords}
                    >
                      {labels.addSelected} ({selectedWords.length})
                    </Button>
                    <Button
                      className="rounded-2xl border border-[var(--line)] bg-white/85 px-4 py-3 text-sm font-semibold text-[var(--ink)]"
                      onClick={() => {
                        setSelectedWords([])
                        setRangeSelectionCount(0)
                        setSelectionAnchor(null)
                      }}
                    >
                      {labels.clearSelection}
                    </Button>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
                    {labels.showingPage} {safeCurrentPage.toLocaleString()} {labels.of} {totalPages.toLocaleString()} {uiLanguage === 'zh' ? '' : labels.fromRows} {visibleRows.length.toLocaleString()} {labels.rows}. {labels.unknownWordsHelp}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
                    <Tag className="rounded-full px-3 py-1.5 font-semibold text-[var(--ink)]">
                      {labels.selectedCount}: {selectedWords.length.toLocaleString()}
                    </Tag>
                    <Tag className="rounded-full px-3 py-1.5">
                      {labels.rangeSize}: {rangeSelectionCount.toLocaleString()}
                    </Tag>
                    <Tag className="rounded-full px-3 py-1.5">
                      {labels.selectionStart}: {selectionAnchor ?? labels.notSet}
                    </Tag>
                    <Tag className="rounded-full px-3 py-1.5">
                      {labels.wordFormsMerged}
                    </Tag>
                    <span>{labels.shiftSelectTip}</span>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-[24px] border border-[var(--line)] bg-white/70">
                    <Table<DerivedVocabularyEntry>
                      className="novel-vocabulary-table"
                      columns={vocabularyColumns}
                      dataSource={pagedRows}
                      pagination={false}
                      rowKey="word"
                      rowSelection={rowSelection}
                      scroll={{ x: 960 }}
                      onRow={(entry) => ({
                        onClick: (event) => handleItemClick(entry.word, entry.isKnown, event),
                      })}
                      rowClassName={(entry) => `${rowTone(entry)} ${selectedRowTone(selectedWords.includes(entry.word))}`}
                    />
                  </div>

                  <div className="mt-4 flex justify-center overflow-auto">
                    <Pagination
                      current={safeCurrentPage}
                      pageSize={PAGE_SIZE}
                      total={visibleRows.length}
                      showSizeChanger={false}
                      onChange={(pageNumber) => setCurrentPage(pageNumber)}
                      showLessItems
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="glass-card rounded-[32px] border border-[var(--line)] p-10 text-center">
                <h2 className="font-[var(--font-display)] text-4xl tracking-[-0.05em] text-[var(--ink)]">{labels.noNovel}</h2>
                <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
                  {labels.noNovelDescription}
                </p>
                <div className="mx-auto mt-8 max-w-4xl text-left">
                  <ExampleNovelList
                    examples={availableExampleNovels}
                    activeExampleSlug={activeExampleSlug}
                    allSamplesSavedLabel={labels.allSamplesSaved}
                    sampleLabel={labels.sample}
                    onSelect={handleExampleSelect}
                    listClassName="grid gap-3 sm:grid-cols-2"
                    buttonClassName="rounded-[24px] border border-[var(--line)] bg-white/80 px-5 py-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)]"
                    activeButtonClassName="border-[var(--accent)] bg-amber-50/80"
                    inactiveButtonClassName="border-[var(--line)] bg-white/80"
                    showSampleBadge
                    emptyClassName="sm:col-span-2 rounded-[24px] border border-[var(--line)] bg-white/80 px-5 py-4 text-sm text-[var(--muted)]"
                  />
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
