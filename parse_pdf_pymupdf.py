#!/usr/bin/env python3
"""使用 PyMuPDF 解析 PDF 并生成结构化 JSON。"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF


KEY_VALUE_PATTERN = re.compile(r"^([^:：]{1,60})[:：]\s*(.+)$")


@dataclass
class ParserOptions:
    merge_line_gap: float = 3.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="解析 PDF 并输出结构化 JSON（metadata/pages/keyValues/tables/rawText）。"
    )
    parser.add_argument("input", type=Path, help="输入 PDF 文件路径")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("parsed.structured.json"),
        help="输出 JSON 路径（默认: parsed.structured.json）",
    )
    parser.add_argument(
        "--indent",
        type=int,
        default=2,
        help="JSON 缩进空格数（默认: 2）",
    )
    return parser.parse_args()


def group_words_to_lines(words: list[list[Any]], gap: float) -> list[str]:
    """基于词坐标将页面 words 聚合为行文本。"""
    if not words:
        return []

    words_sorted = sorted(words, key=lambda w: (round(float(w[1]), 1), float(w[0])))
    lines: list[list[list[Any]]] = []

    for w in words_sorted:
        x0, y0, _, _, text, *_ = w
        if not text or not str(text).strip():
            continue

        if not lines:
            lines.append([w])
            continue

        prev_line = lines[-1]
        prev_y = float(prev_line[-1][1])
        if abs(float(y0) - prev_y) <= gap:
            prev_line.append(w)
        else:
            lines.append([w])

    merged_lines: list[str] = []
    for line_words in lines:
        line_words = sorted(line_words, key=lambda item: float(item[0]))
        merged = " ".join(str(item[4]).strip() for item in line_words if str(item[4]).strip())
        if merged:
            merged_lines.append(merged)
    return merged_lines


def extract_key_values(lines: list[str]) -> list[dict[str, str]]:
    results: list[dict[str, str]] = []
    for line in lines:
        match = KEY_VALUE_PATTERN.match(line)
        if not match:
            continue
        key = match.group(1).strip()
        value = match.group(2).strip()
        if key and value:
            results.append({"key": key, "value": value, "source": line})
    return results


def extract_table_candidates(lines: list[str]) -> list[dict[str, Any]]:
    """用简单规则识别“表格候选行”。"""
    table_rows: list[dict[str, Any]] = []
    for line in lines:
        cols = [c.strip() for c in re.split(r"\s{2,}|\t|\|", line) if c.strip()]
        if len(cols) >= 3:
            table_rows.append({"columns": cols, "source": line})
    return table_rows


def parse_pdf(pdf_path: Path, options: ParserOptions) -> dict[str, Any]:
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF 文件不存在: {pdf_path}")

    doc = fitz.open(pdf_path)
    try:
        pages: list[dict[str, Any]] = []
        all_lines: list[str] = []

        for page_index in range(doc.page_count):
            page = doc.load_page(page_index)
            words = page.get_text("words")
            lines = group_words_to_lines(words, options.merge_line_gap)
            all_lines.extend(lines)

            pages.append(
                {
                    "pageNumber": page_index + 1,
                    "width": page.rect.width,
                    "height": page.rect.height,
                    "lines": lines,
                }
            )

        key_values = extract_key_values(all_lines)
        tables = extract_table_candidates(all_lines)

        result = {
            "metadata": {
                "fileName": pdf_path.name,
                "filePath": str(pdf_path.resolve()),
                "pageCount": doc.page_count,
                "parsedAt": datetime.now(timezone.utc).isoformat(),
                "engine": "PyMuPDF",
            },
            "pages": pages,
            "keyValues": key_values,
            "tables": tables,
            "rawText": "\n".join(all_lines),
        }
        return result
    finally:
        doc.close()


def main() -> None:
    args = parse_args()
    options = ParserOptions()
    result = parse_pdf(args.input, options)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, ensure_ascii=False, indent=args.indent),
        encoding="utf-8",
    )
    print(f"解析完成，JSON 已输出: {args.output}")


if __name__ == "__main__":
    main()
