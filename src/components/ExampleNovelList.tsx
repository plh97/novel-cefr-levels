import { Button, Tag } from 'antd'
import type { ExampleNovel } from '../lib/examples'

type ExampleNovelListProps = {
  examples: ExampleNovel[]
  activeExampleSlug: string | null
  allSamplesSavedLabel: string
  sampleLabel?: string
  onSelect: (slug: string) => void
  emptyClassName?: string
  listClassName?: string
  buttonClassName?: string
  activeButtonClassName?: string
  inactiveButtonClassName?: string
  showSampleBadge?: boolean
  emptySpanClassName?: string
}

function ExampleNovelList({
  examples,
  activeExampleSlug,
  allSamplesSavedLabel,
  sampleLabel,
  onSelect,
  emptyClassName = 'rounded-[22px] border border-[var(--line)] bg-white/80 px-4 py-4 text-sm text-[var(--muted)]',
  listClassName = 'grid gap-3',
  buttonClassName = 'rounded-[22px] border px-4 py-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-white',
  activeButtonClassName = 'border-[var(--accent)] bg-amber-50/80',
  inactiveButtonClassName = 'border-[var(--line)] bg-white/80',
  showSampleBadge = false,
  emptySpanClassName,
}: ExampleNovelListProps) {
  if (examples.length === 0) {
    return (
      <p className={emptyClassName}>
        {allSamplesSavedLabel}
      </p>
    )
  }

  return (
    <div className={listClassName}>
      {examples.map((example) => {
        const isActive = activeExampleSlug === example.slug

        return (
          <Button
            key={example.slug}
            className={`${buttonClassName} ${isActive ? activeButtonClassName : inactiveButtonClassName}`}
            onClick={() => onSelect(example.slug)}
          >
            <p className="font-semibold text-[var(--ink)]">{example.title}</p>
            {showSampleBadge && !isActive && sampleLabel ? (
              <Tag className={emptySpanClassName ?? 'mt-2 inline-flex rounded-full border border-[var(--line)] bg-stone-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]'}>
                {sampleLabel}
              </Tag>
            ) : null}
          </Button>
        )
      })}
    </div>
  )
}

export default ExampleNovelList