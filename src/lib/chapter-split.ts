export type ChapterChunk = {
  id: string
  heading: string
  title: string
  text: string
}

const CHAPTER_LINE_RE = /^\s*CHAPTER\s+([A-Z0-9][A-Z0-9\- ]*)(?:\s*[-:]\s*(.+))?\s*$/i

function looksLikeChapterTitle(line: string): boolean {
  const text = line.trim()
  if (!text || text.length > 120) {
    return false
  }

  const letters = [...text].filter((char) => /[A-Za-z]/.test(char))
  if (letters.length === 0) {
    return false
  }

  const uppercaseCount = letters.filter((char) => char === char.toUpperCase()).length
  return uppercaseCount / letters.length >= 0.7
}

function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function splitTextIntoChapters(text: string): ChapterChunk[] {
  const lines = text.split('\n')
  const starts: Array<{ lineIndex: number; heading: string; inlineTitle: string | null }> = []

  for (let index = 0; index < lines.length; index += 1) {
    const match = CHAPTER_LINE_RE.exec(lines[index])
    if (!match) {
      continue
    }

    starts.push({
      lineIndex: index,
      heading: `CHAPTER ${normalizeLabel(match[1])}`,
      inlineTitle: match[2] ? normalizeLabel(match[2]) : null,
    })
  }

  if (starts.length === 0) {
    return []
  }

  return starts.map((start, index) => {
    const nextStartLine = index + 1 < starts.length ? starts[index + 1].lineIndex : lines.length
    const chapterLines = lines.slice(start.lineIndex, nextStartLine)

    let title = start.inlineTitle
    if (!title) {
      for (const candidate of chapterLines.slice(1, 6)) {
        if (looksLikeChapterTitle(candidate)) {
          title = normalizeLabel(candidate)
          break
        }
      }
    }

    const textBlock = chapterLines.join('\n').trim()
    const safeTitle = title ?? start.heading

    return {
      id: `chapter-${index + 1}`,
      heading: start.heading,
      title: safeTitle,
      text: `${textBlock}\n`,
    }
  })
}
