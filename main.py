#!/usr/bin/env python3
"""Analyze an English book: vocabulary size, CEFR estimate, frequency, and keywords.

Example:
	python main.py \
	  --input "novels/J. K. Rowling - Harry Potter 1 - Sorcerer's Stone.txt" \
	  --top 40
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Set, Tuple

try:
	from wordfreq import zipf_frequency
except ImportError as exc:
	raise SystemExit(
		"Missing dependency 'wordfreq'. Install with: pip install -r requirements.txt"
	) from exc


# Keep stopwords short and practical for keyword extraction.
STOPWORDS = {
	"a",
	"about",
	"after",
	"again",
	"against",
	"all",
	"am",
	"an",
	"and",
	"any",
	"are",
	"as",
	"at",
	"be",
	"because",
	"been",
	"before",
	"being",
	"below",
	"between",
	"both",
	"but",
	"by",
	"can",
	"did",
	"do",
	"does",
	"doing",
	"down",
	"during",
	"each",
	"few",
	"for",
	"from",
	"further",
	"had",
	"has",
	"have",
	"having",
	"he",
	"her",
	"here",
	"hers",
	"herself",
	"him",
	"himself",
	"his",
	"how",
	"i",
	"if",
	"in",
	"into",
	"is",
	"it",
	"its",
	"itself",
	"just",
	"me",
	"more",
	"most",
	"my",
	"myself",
	"no",
	"nor",
	"not",
	"now",
	"of",
	"off",
	"on",
	"once",
	"only",
	"or",
	"other",
	"our",
	"ours",
	"ourselves",
	"out",
	"over",
	"own",
	"same",
	"she",
	"should",
	"so",
	"some",
	"such",
	"than",
	"that",
	"the",
	"their",
	"theirs",
	"them",
	"themselves",
	"then",
	"there",
	"these",
	"they",
	"this",
	"those",
	"through",
	"to",
	"too",
	"under",
	"until",
	"up",
	"very",
	"was",
	"we",
	"were",
	"what",
	"when",
	"where",
	"which",
	"while",
	"who",
	"whom",
	"why",
	"will",
	"with",
	"would",
	"you",
	"your",
	"yours",
	"yourself",
	"yourselves",
}


CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]


@dataclass
class CefrStats:
	token_share: Dict[str, float]
	type_share: Dict[str, float]
	required_level_for_90: str
	required_level_for_95: str
	weighted_level: str
	dominant_level: str


def normalize_token(token: str) -> str:
	token = token.lower()
	token = token.replace("’", "'")
	if token.endswith("'s") and len(token) > 3:
		token = token[:-2]
	return token


def tokenize(text: str) -> List[str]:
	raw = re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text)
	return [normalize_token(w) for w in raw]


def parse_word_list(text: str) -> Set[str]:
	words = set()
	for token in re.split(r"[^A-Za-z']+", text):
		token = normalize_token(token.strip())
		if token:
			words.add(token)
	return words


def load_known_words(known_words_file: str, known_words_inline: str) -> Set[str]:
	known_words: Set[str] = set()

	if known_words_file:
		path = Path(known_words_file)
		if not path.exists():
			raise SystemExit(f"Known words file not found: {path}")
		raw = path.read_text(encoding="utf-8", errors="ignore").strip()
		if raw:
			if path.suffix.lower() == ".json":
				try:
					data = json.loads(raw)
				except json.JSONDecodeError:
					data = raw
				if isinstance(data, list):
					for item in data:
						known_words.update(parse_word_list(str(item)))
				else:
					known_words.update(parse_word_list(str(data)))
			else:
				known_words.update(parse_word_list(raw))

	if known_words_inline:
		known_words.update(parse_word_list(known_words_inline))

	return known_words


def detect_proper_nouns(text: str, min_occurrence: int = 3) -> Set[str]:
	"""Heuristic proper noun detection from capitalization patterns."""
	pattern = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")
	total = Counter()
	title_case = Counter()
	lower_case = Counter()

	for w in pattern.findall(text):
		norm = normalize_token(w)
		if len(norm) < 3:
			continue
		total[norm] += 1
		if w[0].isupper() and w[1:].islower():
			title_case[norm] += 1
		if w.islower():
			lower_case[norm] += 1

	nouns: Set[str] = set()
	for word, cnt in total.items():
		if cnt < min_occurrence:
			continue
		tc = title_case[word]
		lc = lower_case[word]
		if tc / cnt >= 0.8 and lc == 0:
			nouns.add(word)
	return nouns


def zipf_to_cefr(word: str) -> str:
	z = zipf_frequency(word, "en")
	if z >= 6.0:
		return "A1"
	if z >= 5.5:
		return "A2"
	if z >= 5.0:
		return "B1"
	if z >= 4.5:
		return "B2"
	if z >= 4.0:
		return "C1"
	return "C2"


def compute_cefr_stats(counter: Counter) -> CefrStats:
	total_tokens = sum(counter.values())
	total_types = len(counter)
	token_by_level: Dict[str, int] = defaultdict(int)
	type_by_level: Dict[str, int] = defaultdict(int)

	for word, freq in counter.items():
		lvl = zipf_to_cefr(word)
		token_by_level[lvl] += freq
		type_by_level[lvl] += 1

	token_share = {
		lvl: (token_by_level[lvl] / total_tokens if total_tokens else 0.0)
		for lvl in CEFR_ORDER
	}
	type_share = {
		lvl: (type_by_level[lvl] / total_types if total_types else 0.0)
		for lvl in CEFR_ORDER
	}

	cumulative = 0.0
	required_90 = "C2"
	required_95 = "C2"
	for lvl in CEFR_ORDER:
		cumulative += token_share[lvl]
		if cumulative >= 0.90 and required_90 == "C2":
			required_90 = lvl
		if cumulative >= 0.95:
			required_95 = lvl
			break

	weighted_score = 0.0
	for i, lvl in enumerate(CEFR_ORDER, start=1):
		weighted_score += i * token_share[lvl]
	nearest_idx = min(
		range(1, len(CEFR_ORDER) + 1), key=lambda x: abs(x - weighted_score)
	)
	weighted_level = CEFR_ORDER[nearest_idx - 1]

	dominant = max(CEFR_ORDER, key=lambda lvl: token_share[lvl])
	return CefrStats(
		token_share,
		type_share,
		required_90,
		required_95,
		weighted_level,
		dominant,
	)


def extract_keywords(
	counter: Counter,
	top_n: int,
	excluded_words: Set[str] | None = None,
	show_all: bool = False,
) -> List[Tuple[str, int, float]]:
	# Score favors frequent and less-common words in general English.
	excluded_words = excluded_words or set()
	scored: List[Tuple[str, int, float]] = []
	for word, freq in counter.items():
		if len(word) < 3 or word in STOPWORDS or word in excluded_words:
			continue
		z = zipf_frequency(word, "en")
		rarity = max(0.1, 7.5 - z)
		score = freq * rarity
		scored.append((word, freq, score))

	scored.sort(key=lambda x: x[2], reverse=True)
	return scored if show_all else scored[:top_n]


def print_table(headers: Iterable[str], rows: Iterable[Iterable[str]]) -> None:
	headers = list(headers)
	rows = [list(row) for row in rows]
	widths = [len(h) for h in headers]
	for row in rows:
		for i, cell in enumerate(row):
			widths[i] = max(widths[i], len(cell))

	def fmt(row: Iterable[str]) -> str:
		return " | ".join(cell.ljust(widths[i]) for i, cell in enumerate(row))

	print(fmt(headers))
	print("-+-".join("-" * w for w in widths))
	for row in rows:
		print(fmt(row))


def analyze_book(input_path: Path, top_n: int, known_words: Set[str] | None = None) -> Dict:
	text = input_path.read_text(encoding="utf-8", errors="ignore")
	tokens = tokenize(text)
	counter = Counter(tokens)
	proper_nouns = detect_proper_nouns(text)
	known_words = known_words or set()
	show_all = top_n <= 0

	cefr_all = compute_cefr_stats(counter)

	core_counter = Counter({
		w: c for w, c in counter.items() if w not in proper_nouns
	})
	cefr_core = compute_cefr_stats(core_counter)

	keywords = extract_keywords(
		counter,
		top_n,
		excluded_words=proper_nouns.union(known_words),
		show_all=show_all,
	)
	top_names = sorted(
		[(w, counter[w]) for w in proper_nouns if w not in known_words],
		key=lambda x: x[1],
		reverse=True,
	)
	if not show_all:
		top_names = top_names[:top_n]

	top_words = [(w, c) for w, c in counter.most_common() if w not in known_words]
	if not show_all:
		top_words = top_words[:top_n]

	memorize_candidates: List[Tuple[str, int, float, str, float]] = []
	for word, freq in counter.items():
		if word in known_words or word in proper_nouns or word in STOPWORDS or len(word) < 3:
			continue
		z = zipf_frequency(word, "en")
		rarity = max(0.1, 7.5 - z)
		score = freq * rarity
		memorize_candidates.append((word, freq, score, zipf_to_cefr(word), z))

	memorize_candidates.sort(key=lambda x: x[2], reverse=True)
	top_memorize = memorize_candidates if show_all else memorize_candidates[:top_n]
	total_tokens = len(tokens)
	unique_tokens = len(counter)
	ttr = unique_tokens / total_tokens if total_tokens else 0.0

	return {
		"file": str(input_path),
		"known_words_count": len(known_words),
		"total_tokens": total_tokens,
		"unique_vocabulary": unique_tokens,
		"type_token_ratio": ttr,
		"cefr": {
			"all_words": {
				"estimated_book_level": cefr_all.weighted_level,
				"required_level_for_90_token_coverage": cefr_all.required_level_for_90,
				"required_level_for_95_token_coverage": cefr_all.required_level_for_95,
				"dominant_token_level": cefr_all.dominant_level,
				"token_share": cefr_all.token_share,
				"type_share": cefr_all.type_share,
			},
			"core_words_no_names": {
				"estimated_book_level": cefr_core.weighted_level,
				"required_level_for_90_token_coverage": cefr_core.required_level_for_90,
				"required_level_for_95_token_coverage": cefr_core.required_level_for_95,
				"dominant_token_level": cefr_core.dominant_level,
				"token_share": cefr_core.token_share,
				"type_share": cefr_core.type_share,
			},
		},
		"top_words": [{"word": w, "count": c} for w, c in top_words],
		"top_proper_nouns": [{"word": w, "count": c} for w, c in top_names],
		"keywords": [
			{"word": w, "count": c, "score": round(s, 3)} for w, c, s in keywords
		],
		"memorize_vocabulary": [
			{
				"word": w,
				"count": c,
				"score": round(s, 3),
				"cefr": level,
				"zipf": round(z, 3),
			}
			for w, c, s, level, z in top_memorize
		],
	}


def print_report(result: Dict, top_n: int) -> None:
	label = "All" if top_n <= 0 else str(top_n)
	print("=== Book Vocabulary Report ===")
	print(f"File: {result['file']}")
	print(f"Known words loaded: {result['known_words_count']}")
	print(f"Total tokens: {result['total_tokens']}")
	print(f"Unique vocabulary: {result['unique_vocabulary']}")
	print(f"Type-token ratio: {result['type_token_ratio']:.4f}")

	cefr = result["cefr"]
	print("\n=== CEFR Estimate ===")
	print("All words (including names):")
	print(f"Estimated book level: {cefr['all_words']['estimated_book_level']}")
	print(
		"Required level for ~90% token coverage: "
		f"{cefr['all_words']['required_level_for_90_token_coverage']}"
	)
	print(
		"Required level for ~95% token coverage: "
		f"{cefr['all_words']['required_level_for_95_token_coverage']}"
	)
	print(f"Dominant token level: {cefr['all_words']['dominant_token_level']}")

	rows = []
	for lvl in CEFR_ORDER:
		rows.append(
			[
				lvl,
				f"{100 * cefr['all_words']['token_share'][lvl]:.2f}%",
				f"{100 * cefr['all_words']['type_share'][lvl]:.2f}%",
			]
		)
	print_table(["Level", "Token Share", "Type Share"], rows)

	print("\nCore words (proper nouns removed):")
	print(
		f"Estimated book level: {cefr['core_words_no_names']['estimated_book_level']}"
	)
	print(
		"Required level for ~90% token coverage: "
		f"{cefr['core_words_no_names']['required_level_for_90_token_coverage']}"
	)
	print(
		"Required level for ~95% token coverage: "
		f"{cefr['core_words_no_names']['required_level_for_95_token_coverage']}"
	)
	print(
		"Dominant token level: "
		f"{cefr['core_words_no_names']['dominant_token_level']}"
	)

	rows = []
	for lvl in CEFR_ORDER:
		rows.append(
			[
				lvl,
				f"{100 * cefr['core_words_no_names']['token_share'][lvl]:.2f}%",
				f"{100 * cefr['core_words_no_names']['type_share'][lvl]:.2f}%",
			]
		)
	print_table(["Level", "Token Share", "Type Share"], rows)

	print(f"\n=== {label} Vocabulary (Appear Times) ===")
	print_table(
		["Word", "Count"],
		[[item["word"], str(item["count"])] for item in result["top_words"]],
	)

	print(f"\n=== {label} Proper Nouns (Names/Places) ===")
	print_table(
		["Word", "Count"],
		[[item["word"], str(item["count"])] for item in result["top_proper_nouns"]],
	)

	print(f"\n=== {label} Keywords (Useful to Learn First) ===")
	print_table(
		["Keyword", "Count", "Score"],
		[
			[item["word"], str(item["count"]), f"{item['score']:.3f}"]
			for item in result["keywords"]
		],
	)

	print(f"\n=== {label} Memorize Vocabulary (Unknown Words) ===")
	print_table(
		["Word", "Count", "CEFR", "Zipf", "Score"],
		[
			[
				item["word"],
				str(item["count"]),
				item["cefr"],
				f"{item['zipf']:.3f}",
				f"{item['score']:.3f}",
			]
			for item in result["memorize_vocabulary"]
		],
	)


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(
		description=(
			"Calculate book vocabulary size, CEFR estimate, word frequency, and key words"
		)
	)
	parser.add_argument("--input", required=True, help="Path to text file")
	parser.add_argument(
		"--top",
		type=int,
		default=30,
		help="How many words to show; use 0 to show all (default: 30)",
	)
	parser.add_argument(
		"--json-out",
		default="",
		help="Optional path to save full JSON result",
	)
	parser.add_argument(
		"--known-words-file",
		default="",
		help="Path to known words list (.txt/.json). Those words will be filtered out.",
	)
	parser.add_argument(
		"--known-words",
		default="",
		help="Inline known words, separated by comma/space. Example: --known-words 'the,and,to'",
	)
	return parser.parse_args()


def main() -> None:
	args = parse_args()
	input_path = Path(args.input)
	if not input_path.exists():
		raise SystemExit(f"Input file not found: {input_path}")

	known_words = load_known_words(args.known_words_file, args.known_words)
	result = analyze_book(input_path, args.top, known_words=known_words)
	print_report(result, args.top)

	if args.json_out:
		out_path = Path(args.json_out)
		out_path.parent.mkdir(parents=True, exist_ok=True)
		out_path.write_text(
			json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
		)
		print(f"\nSaved JSON report: {out_path}")


if __name__ == "__main__":
	main()
