#!/usr/bin/env python3
"""Split plain-text novels into per-chapter files."""

from __future__ import annotations

import argparse
import difflib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


CHAPTER_HEADING_RE = re.compile(
    r"^CHAPTER\s+([A-Z0-9][A-Z0-9\- ]*)(?:\s*[-:]\s*(.+))?$",
    re.IGNORECASE,
)
SPACED_CHAPTER_HEADING_RE = re.compile(
    r"^C\s*H\s*A\s*P\s*T\s*E\s*R+\s+(.+)$",
    re.IGNORECASE,
)

CHAPTER_LABELS = [
    "ONE",
    "TWO",
    "THREE",
    "FOUR",
    "FIVE",
    "SIX",
    "SEVEN",
    "EIGHT",
    "NINE",
    "TEN",
    "ELEVEN",
    "TWELVE",
    "THIRTEEN",
    "FOURTEEN",
    "FIFTEEN",
    "SIXTEEN",
    "SEVENTEEN",
    "EIGHTEEN",
    "NINETEEN",
    "TWENTY",
    "TWENTYONE",
    "TWENTYTWO",
    "TWENTYTHREE",
    "TWENTYFOUR",
    "TWENTYFIVE",
    "TWENTYSIX",
    "TWENTYSEVEN",
    "TWENTYEIGHT",
    "TWENTYNINE",
    "THIRTY",
    "THIRTYONE",
    "THIRTYTWO",
    "THIRTYTHREE",
    "THIRTYFOUR",
    "THIRTYFIVE",
    "THIRTYSIX",
    "THIRTYSEVEN",
]


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


def normalize_ocr_heading(line: str) -> str:
    normalized = line.upper().replace("11", "H").replace("1", "I").replace("0", "O")
    normalized = re.sub(r"[^A-Z]", "", normalized)
    normalized = re.sub(r"(.)\1+", r"\1", normalized)
    return normalized


def fuzzy_chapter_label(candidate: str) -> str | None:
    matches = difflib.get_close_matches(candidate, CHAPTER_LABELS, n=1, cutoff=0.55)
    if matches:
        return matches[0]
    return None


def is_page_marker(line: str) -> bool:
    stripped = line.strip().strip("*")
    return stripped.isdigit() and len(stripped) <= 4


def previous_non_empty_line(lines: list[str], start_index: int, limit: int = 4) -> tuple[int, str] | None:
    for index in range(start_index - 1, max(-1, start_index - limit - 1), -1):
        if lines[index].strip():
            return index, lines[index]
    return None


def next_non_empty_line(lines: list[str], start_index: int, limit: int = 4) -> tuple[int, str] | None:
    for index in range(start_index + 1, min(len(lines), start_index + limit + 1)):
        if lines[index].strip():
            return index, lines[index]
    return None


def detect_title_anchors(lines: list[str]) -> list[tuple[int, str, str]]:
    anchors: list[tuple[int, str, str]] = []

    for index, line in enumerate(lines):
        title_candidate = line.strip()
        if not looks_like_chapter_title(title_candidate):
            continue
        if index < 5:
            continue

        previous_info = previous_non_empty_line(lines, index)
        next_info = next_non_empty_line(lines, index)
        if previous_info is None or next_info is None:
            continue

        previous_index, previous_line = previous_info
        _next_index, next_line = next_info
        if looks_like_chapter_title(next_line):
            continue

        normalized_previous = normalize_ocr_heading(previous_line)
        is_heading_neighbor = (
            match_chapter_heading(previous_line) is not None
            or normalized_previous.startswith("CHAPTER")
            or normalized_previous.startswith("HAPTER")
            or is_page_marker(previous_line)
        )
        if not is_heading_neighbor:
            continue

        heading_line = f"CHAPTER {len(anchors) + 1}"
        actual_heading = match_chapter_heading(previous_line)
        start_index = index
        if actual_heading is not None:
            heading_line = actual_heading[0]
            start_index = previous_index

        anchors.append((start_index, heading_line, title_candidate))

    return anchors


def match_chapter_heading(line: str) -> tuple[str, str | None] | None:
    stripped = line.strip()
    direct_match = CHAPTER_HEADING_RE.match(stripped)
    if direct_match:
        heading = stripped
        title = direct_match.group(2).strip() if direct_match.group(2) else None
        return heading, title

    spaced_match = SPACED_CHAPTER_HEADING_RE.match(stripped)
    if spaced_match:
        suffix = re.sub(r"\s+", " ", spaced_match.group(1)).strip()
        heading = f"CHAPTER {suffix}"
        return heading, None

    normalized = normalize_ocr_heading(stripped)
    for prefix in ("CHAPTER", "HAPTER"):
        if not normalized.startswith(prefix):
            continue

        suffix = normalized[len(prefix):]
        if not suffix:
            return None

        label = fuzzy_chapter_label(suffix)
        if label is None:
            return None

        return f"CHAPTER {label}", None

    return None


def split_into_chapters(text: str) -> list[Chapter]:
    lines = text.splitlines()
    chapter_starts: list[tuple[int, str, str | None]] = []

    for index, line in enumerate(lines):
        heading_match = match_chapter_heading(line)
        if heading_match:
            heading, inline_title = heading_match
            chapter_starts.append((index, heading, inline_title))

    title_anchors = detect_title_anchors(lines)
    if len(title_anchors) > len(chapter_starts):
        chapter_starts = title_anchors

    chapters: list[Chapter] = []
    for chapter_index, (start_line, heading_line, inline_title) in enumerate(chapter_starts, start=1):
        end_line = chapter_starts[chapter_index][0] if chapter_index < len(chapter_starts) else len(lines)
        block_lines = lines[start_line:end_line]

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
    for existing_file in novel_dir.glob("*.txt"):
        existing_file.unlink()

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