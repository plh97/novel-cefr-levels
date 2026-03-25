export type ExampleNovel = {
  slug: string
  title: string
  caption: string
  sourcePath: string
  fileName: string
}

export const EXAMPLE_NOVELS: ExampleNovel[] = [
  {
    slug: 'novel-1',
    title: 'Harry Potter and the Sorcerer\'s Stone',
    caption: 'Server-rendered analysis from novels/Harry Potter and the Sorcerer\'s Stone',
    sourcePath: 'novels/Harry Potter and the Sorcerer\'s Stone.txt',
    fileName: 'Harry Potter and the Sorcerer\'s Stone.txt',
  },
  {
    slug: 'novel-2',
    title: 'HARRY POTTER AND THE CHAMBER OF SECRETS',
    caption: 'Server-rendered analysis from novels/HARRY POTTER AND THE CHAMBER OF SECRETS',
    sourcePath: 'novels/HARRY POTTER AND THE CHAMBER OF SECRETS.txt',
    fileName: 'HARRY POTTER AND THE CHAMBER OF SECRETS.txt',
  },
  {
    slug: 'novel-3',
    title: 'Harry Potter and the Prisoner of Azkaban',
    caption: 'Server-rendered analysis from novels/Harry Potter and the Prisoner of Azkaban',
    sourcePath: 'novels/Harry Potter and the Prisoner of Azkaban.txt',
    fileName: 'Harry Potter and the Prisoner of Azkaban.txt',
  },
  {
    slug: 'novel-4',
    title: 'Harry Potter and the Goblet of Fire',
    caption: 'Server-rendered analysis from novels/Harry Potter and the Goblet of Fire',
    sourcePath: 'novels/Harry Potter and the Goblet of Fire.txt',
    fileName: 'Harry Potter and the Goblet of Fire.txt',
  },
]

export function findExampleNovel(slug: string | null): ExampleNovel | null {
  if (!slug) {
    return null
  }

  return EXAMPLE_NOVELS.find((example) => example.slug === slug) ?? null
}