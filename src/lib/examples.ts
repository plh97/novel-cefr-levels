import chamberUrl from '../../novels/HARRY POTTER AND THE CHAMBER OF SECRETS.txt?url'
import gobletUrl from '../../novels/Harry Potter and the Goblet of Fire.txt?url'
import prisonerUrl from '../../novels/Harry Potter and the Prisoner of Azkaban.txt?url'
import sorcererStoneUrl from '../../novels/Harry Potter and the Sorcerer\'s Stone.txt?url'

export type ExampleNovel = {
  slug: string
  title: string
  caption: string
  sourcePath: string
  fileName: string
  assetUrl: string
}

export const EXAMPLE_NOVELS: ExampleNovel[] = [
  {
    slug: 'novel-1',
    title: 'Harry Potter and the Sorcerer\'s Stone',
    caption: 'Example analysis from novels/Harry Potter and the Sorcerer\'s Stone',
    sourcePath: 'novels/Harry Potter and the Sorcerer\'s Stone.txt',
    fileName: 'Harry Potter and the Sorcerer\'s Stone.txt',
    assetUrl: sorcererStoneUrl,
  },
  {
    slug: 'novel-2',
    title: 'HARRY POTTER AND THE CHAMBER OF SECRETS',
    caption: 'Example analysis from novels/HARRY POTTER AND THE CHAMBER OF SECRETS',
    sourcePath: 'novels/HARRY POTTER AND THE CHAMBER OF SECRETS.txt',
    fileName: 'HARRY POTTER AND THE CHAMBER OF SECRETS.txt',
    assetUrl: chamberUrl,
  },
  {
    slug: 'novel-3',
    title: 'Harry Potter and the Prisoner of Azkaban',
    caption: 'Example analysis from novels/Harry Potter and the Prisoner of Azkaban',
    sourcePath: 'novels/Harry Potter and the Prisoner of Azkaban.txt',
    fileName: 'Harry Potter and the Prisoner of Azkaban.txt',
    assetUrl: prisonerUrl,
  },
  {
    slug: 'novel-4',
    title: 'Harry Potter and the Goblet of Fire',
    caption: 'Example analysis from novels/Harry Potter and the Goblet of Fire',
    sourcePath: 'novels/Harry Potter and the Goblet of Fire.txt',
    fileName: 'Harry Potter and the Goblet of Fire.txt',
    assetUrl: gobletUrl,
  },
]

export function findExampleNovel(slug: string | null): ExampleNovel | null {
  if (!slug) {
    return null
  }

  return EXAMPLE_NOVELS.find((example) => example.slug === slug) ?? null
}