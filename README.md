
# PDF 结构化解析单页面应用

新增 `pdf-parser.html`：可在浏览器中上传 PDF，解析文本并输出结构化 JSON（包含 metadata/pages/keyValues/tables/rawText）。

使用方式：

1. 直接打开 `pdf-parser.html`。
2. 点击“选择 PDF”并上传文件。
3. 点击“解析并生成结构化数据”。
4. 可点击“下载 JSON”导出结果。


## PyMuPDF PDF 结构化解析脚本

新增 `parse_pdf_pymupdf.py`，使用 **PyMuPDF** 解析 PDF 并生成结构化 JSON。

### 安装依赖

```bash
pip install pymupdf
```

### 使用示例

```bash
python parse_pdf_pymupdf.py ./example.pdf -o ./example.structured.json
```

输出 JSON 结构包含：

- `metadata`：文件名、页数、解析时间、解析引擎
- `pages`：逐页宽高与行文本
- `keyValues`：基于 `key: value` 规则抽取
- `tables`：基于空白/制表符/`|` 的表格候选行
- `rawText`：全文行拼接文本

