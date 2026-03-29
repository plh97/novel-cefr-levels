#!/usr/bin/env python3
"""Split plain-text novels into per-chapter files."""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


CHAPTER_HEADING_RE = re.compile(
    r"^CHAPTER\s+([A-Z0-9][A-Z0-9\- ]*)(?:\s*[-:]\s*(.+))?$",
    re.IGNORECASE,
)


@dataclass
class Chapter:
    index: int
    heading: str
    title: str | None
    content: str


def slugify(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").lower()
    return slug or "chapter"


def looks_like_chapter_title(line: str) -> bool:
    text = line.strip()
    if not text:
        return False
    if len(text) > 120:
        return False
    if text.endswith(tuple(str(number) for number in range(10))):
        return False
    letters = [char for char in text if char.isalpha()]
    if not letters:
        return False
    uppercase_ratio = sum(char.isupper() for char in letters) / len(letters)
    return uppercase_ratio >= 0.75


def split_into_chapters(text: str) -> list[Chapter]:
    lines = text.splitlines()
    chapter_starts: list[tuple[int, re.Match[str]]] = []

    for index, line in enumerate(lines):
        match = CHAPTER_HEADING_RE.match(line.strip())
        if match:
            chapter_starts.append((index, match))

    chapters: list[Chapter] = []
    for chapter_index, (start_line, match) in enumerate(chapter_starts, start=1):
        end_line = chapter_starts[chapter_index][0] if chapter_index < len(chapter_starts) else len(lines)
        block_lines = lines[start_line:end_line]
        heading_line = block_lines[0].strip()
        inline_title = match.group(2).strip() if match.group(2) else None

        title: str | None = inline_title
        if title is None:
            for candidate in block_lines[1:4]:
                if looks_like_chapter_title(candidate):
                    title = candidate.strip()
                    break
                if candidate.strip():
                    break

        content = "\n".join(block_lines).strip() + "\n"
        chapters.append(
            Chapter(
                index=chapter_index,
                heading=heading_line,
                title=title,
                content=content,
            )
        )

    return chapters


def iter_novel_paths(input_path: Path) -> Iterable[Path]:
    if input_path.is_file():
        yield input_path
        return

    for path in sorted(input_path.glob("*.txt")):
        if path.is_file():
            yield path


def write_chapters(input_path: Path, output_dir: Path) -> int:
    text = input_path.read_text(encoding="utf-8", errors="ignore")
    chapters = split_into_chapters(text)
    if not chapters:
        return 0

    novel_dir = output_dir / slugify(input_path.stem)
    novel_dir.mkdir(parents=True, exist_ok=True)

    for chapter in chapters:
        filename_parts = [f"{chapter.index:03d}", slugify(chapter.heading)]
        if chapter.title:
          filename_parts.append(slugify(chapter.title))
        file_name = "-".join(part for part in filename_parts if part) + ".txt"
        (novel_dir / file_name).write_text(chapter.content, encoding="utf-8")

    return len(chapters)


def main() -> None:
    parser = argparse.ArgumentParser(description="Split plain-text novels into chapter files.")
    parser.add_argument(
        "--input",
        default="novels",
        help="Text file or directory of text files to split. Defaults to novels/.",
    )
    parser.add_argument(
        "--output-dir",
        default="novels/chapters",
        help="Directory where per-novel chapter folders will be written.",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)

    if not input_path.exists():
        raise SystemExit(f"Input path not found: {input_path}")

    processed = 0
    for novel_path in iter_novel_paths(input_path):
        chapter_count = write_chapters(novel_path, output_dir)
        if chapter_count == 0:
            print(f"Skipped {novel_path}: no chapter headings found")
            continue

        processed += 1
        print(f"Split {novel_path} into {chapter_count} chapter files")

    if processed == 0:
        raise SystemExit("No novels were split.")


if __name__ == "__main__":
    main()