#!/usr/bin/env python3
"""
微信读书英文生词提取器
从微信读书书架中选择英文书籍，提取指定章节的生词并用 Claude API 翻译解析。

使用方法：
  1. 复制 .env.example 为 .env，填入你的 Cookie 和 Anthropic API Key
  2. pip install -r requirements.txt
  3. python weread_vocab.py
"""

import os
import sys
import re
import json
import time
import argparse
from typing import Optional

try:
    import requests
except ImportError:
    print("请先安装依赖: pip install -r requirements.txt")
    sys.exit(1)

try:
    import anthropic
except ImportError:
    print("请先安装依赖: pip install -r requirements.txt")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # .env 可选

WEREAD_BASE = "https://weread.qq.com"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://weread.qq.com/",
    "Accept": "application/json, text/plain, */*",
}

MAX_VOCAB_WORDS = 30
CLAUDE_MODEL = "claude-opus-4-7"


def die(msg: str) -> None:
    print(f"\n[错误] {msg}", file=sys.stderr)
    sys.exit(1)


def get_session() -> requests.Session:
    skey = os.getenv("WEREAD_SKEY", "").strip()
    if not skey:
        die(
            "未设置 WEREAD_SKEY 环境变量。\n"
            "请在浏览器登录 weread.qq.com，打开开发者工具 > Application > Cookies，\n"
            "复制 wr_skey 的值，写入 tools/.env 文件：\n"
            "  WEREAD_SKEY=你的wr_skey值"
        )

    session = requests.Session()
    session.headers.update(HEADERS)
    session.cookies.set("wr_skey", skey, domain=".weread.qq.com")

    vid = os.getenv("WEREAD_VID", "").strip()
    if vid:
        session.cookies.set("vid", vid, domain=".weread.qq.com")

    # 支持完整 cookie 字符串（更兼容）
    raw_cookie = os.getenv("WEREAD_COOKIE", "").strip()
    if raw_cookie:
        for item in raw_cookie.split(";"):
            item = item.strip()
            if "=" in item:
                k, v = item.split("=", 1)
                session.cookies.set(k.strip(), v.strip(), domain=".weread.qq.com")

    return session


def api_get(session: requests.Session, path: str, params: dict = None) -> dict:
    url = f"{WEREAD_BASE}{path}"
    try:
        resp = session.get(url, params=params, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        die(f"请求失败 {url}: {e}")

    try:
        data = resp.json()
    except json.JSONDecodeError:
        die(f"响应不是 JSON 格式:\n{resp.text[:500]}")

    if isinstance(data, dict) and data.get("errCode", 0) not in (0, None):
        errmsg = data.get("errMsg", "未知错误")
        err_code = data.get("errCode")
        if err_code == -2012:
            die("Cookie 已过期，请重新从浏览器复制 wr_skey。")
        die(f"API 返回错误 {err_code}: {errmsg}")

    return data


def get_bookshelf(session: requests.Session) -> list[dict]:
    data = api_get(session, "/api/book/bookshelf")
    books = data.get("books", [])
    if not books:
        # 兼容另一种响应格式
        books = data.get("data", {}).get("books", [])
    return books


def get_chapters(session: requests.Session, book_id: str) -> list[dict]:
    data = api_get(session, "/api/book/chapter/list", params={"bookId": book_id})
    chapters = data.get("data", [])
    if not chapters and isinstance(data, list):
        chapters = data
    return chapters


def get_chapter_content(session: requests.Session, book_id: str, chapter_uid: int) -> str:
    ts = int(time.time())
    data = api_get(
        session,
        "/api/book/read",
        params={
            "bookId": book_id,
            "chapterUid": chapter_uid,
            "readingTimestamp": ts,
            "format": "html",
            "type": "2",
        },
    )

    # 兼容多种响应格式
    content = (
        data.get("chapterContent")
        or data.get("htmlContent")
        or data.get("content")
        or data.get("data", {}).get("chapterContent", "")
    )

    if not content:
        die(
            "未能获取章节内容。可能原因：\n"
            "  1. Cookie 权限不足（需要在浏览器中打开该书后再试）\n"
            "  2. 该章节需要付费解锁\n"
            f"  API 响应: {json.dumps(data, ensure_ascii=False)[:300]}"
        )

    # 清理 HTML 标签，保留可读文本
    text = re.sub(r"<br\s*/?>", "\n", content, flags=re.IGNORECASE)
    text = re.sub(r"<p[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</p>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&quot;", '"', text)
    text = re.sub(r"&#\d+;", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def extract_vocabulary_with_claude(
    text: str, book_title: str, chapter_title: str, max_words: int = MAX_VOCAB_WORDS
) -> str:
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        die(
            "未设置 ANTHROPIC_API_KEY 环境变量。\n"
            "请在 tools/.env 中添加：\n"
            "  ANTHROPIC_API_KEY=sk-ant-..."
        )

    client = anthropic.Anthropic(api_key=api_key)

    # 截取合理长度（太长会超出 token 限制）
    excerpt = text[:5000]
    if len(text) > 5000:
        excerpt += "\n\n[...文章已截取前5000字符]"

    prompt = f"""你是一位专业的英语词汇教师。以下是英文书籍《{book_title}》中"{chapter_title}"章节的内容。

请帮我从中找出 **对中文读者来说较难的英文生词**（建议选 B2/C1/C2 级别词汇，不超过 {max_words} 个），并提供详细的学习分析。

要求：
- 优先选择文章核心词汇、低频词或搭配特殊的词
- 跳过过于基础的常见词（如 the、good、book 等）
- 每个词必须附上**原文例句**

输出格式：

# 《{book_title}》—— {chapter_title} 生词表

## 词汇速览表

| 单词 / 短语 | 音标 | 词性 | 中文释义 |
|---|---|---|---|
（按出现顺序列出）

---

## 详细解析

每个词按以下格式：

### `单词`
- **音标**: /xxx/
- **词性**: n. / v. / adj. / adv. / phr. 等
- **中文释义**:
- **原文例句**: > "原文句子"（中文翻译）
- **记忆提示**: （词根、联想或近义词，可选）

---

章节内容如下：

{excerpt}
"""

    print("正在调用 Claude API 分析生词（可能需要 10-30 秒）...")

    try:
        message = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.AuthenticationError:
        die("ANTHROPIC_API_KEY 无效，请检查 API Key。")
    except anthropic.APIError as e:
        die(f"Claude API 调用失败: {e}")

    return message.content[0].text


# ── Notion 集成 ───────────────────────────────────────────────────────────────

def _parse_inline(text: str) -> list[dict]:
    """将行内 markdown 格式（**bold** `code` *italic*）转为 Notion rich_text。"""
    result = []
    pattern = re.compile(r'\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*|([^*`]+)', re.DOTALL)
    for m in pattern.finditer(text):
        if m.group(1):
            result.append({"type": "text", "text": {"content": m.group(1)},
                           "annotations": {"bold": True}})
        elif m.group(2):
            result.append({"type": "text", "text": {"content": m.group(2)},
                           "annotations": {"code": True}})
        elif m.group(3):
            result.append({"type": "text", "text": {"content": m.group(3)},
                           "annotations": {"italic": True}})
        elif m.group(4):
            result.append({"type": "text", "text": {"content": m.group(4)}})
    return result or [{"type": "text", "text": {"content": text}}]


def _blk(kind: str, rich_text: list) -> dict:
    return {"object": "block", "type": kind, kind: {"rich_text": rich_text}}


def markdown_to_notion_blocks(md: str) -> list[dict]:
    """将 markdown 字符串转换为 Notion block 列表。"""
    blocks: list[dict] = []
    lines = md.split("\n")
    i = 0
    while i < len(lines):
        raw = lines[i]
        s = raw.rstrip()

        if s.startswith("### "):
            blocks.append(_blk("heading_3", _parse_inline(s[4:].strip("`").strip())))
        elif s.startswith("## "):
            blocks.append(_blk("heading_2", _parse_inline(s[3:])))
        elif s.startswith("# "):
            blocks.append(_blk("heading_1", _parse_inline(s[2:])))
        elif s == "---":
            blocks.append({"object": "block", "type": "divider", "divider": {}})
        elif s.startswith("> "):
            blocks.append(_blk("quote", _parse_inline(s[2:])))
        elif s.startswith("- "):
            blocks.append(_blk("bulleted_list_item", _parse_inline(s[2:])))
        elif s.startswith("|") and i + 1 < len(lines) and re.match(r"\|[-| :]+\|", lines[i + 1]):
            # 解析 markdown 表格
            headers = [c.strip() for c in s.split("|")[1:-1]]
            col_n = len(headers)
            i += 2  # 跳过分隔行
            rows: list[list[str]] = [headers]
            while i < len(lines) and lines[i].strip().startswith("|"):
                row = [c.strip() for c in lines[i].split("|")[1:-1]]
                rows.append((row + [""] * col_n)[:col_n])
                i += 1
            blocks.append({
                "object": "block", "type": "table",
                "table": {
                    "table_width": col_n,
                    "has_column_header": True,
                    "has_row_header": False,
                    "children": [
                        {"object": "block", "type": "table_row",
                         "table_row": {"cells": [[{"type": "text", "text": {"content": c}}]
                                                  for c in row]}}
                        for row in rows
                    ],
                },
            })
            continue
        elif s.strip():
            # 普通段落，Notion 单块上限 2000 字符
            chunk = s
            while chunk:
                blocks.append(_blk("paragraph", _parse_inline(chunk[:2000])))
                chunk = chunk[2000:]
        i += 1
    return blocks


def send_to_notion(chapter_title: str, md_content: str) -> str:
    """将生词内容追加到已有 Notion 页面，章节名作为 h2 小标题，返回页面 URL。"""
    try:
        from notion_client import Client
    except ImportError:
        die("请先安装 notion-client：pip install -r requirements.txt")

    api_key = os.getenv("NOTION_API_KEY", "").strip()
    page_id = os.getenv("NOTION_PAGE_ID", "").strip()

    if not api_key:
        die(
            "未设置 NOTION_API_KEY。\n"
            "请到 https://www.notion.so/my-integrations 创建 Integration，\n"
            "将生成的 secret_xxx 写入 tools/.env：\n"
            "  NOTION_API_KEY=secret_xxx\n"
            "并在目标页面右上角 ··· → Connections 中添加该 Integration。"
        )
    if not page_id:
        die(
            "未设置 NOTION_PAGE_ID。\n"
            "从 Notion 页面 URL 复制 32 位 ID，写入 tools/.env：\n"
            "  NOTION_PAGE_ID=364d2f95ca0980a89e21c4a415a8894d"
        )

    notion = Client(auth=api_key)

    # 把 Claude 输出的 markdown 转为 Notion blocks，跳过首行 h1（书名已是页面标题）
    raw_blocks = markdown_to_notion_blocks(md_content)
    content_blocks = raw_blocks[1:] if raw_blocks and raw_blocks[0]["type"] == "heading_1" else raw_blocks

    # 章节名作为 h2 小标题，前加分隔线
    blocks = [
        {"object": "block", "type": "divider", "divider": {}},
        _blk("heading_2", _parse_inline(chapter_title)),
        *content_blocks,
    ]

    # Notion API 单次最多 100 个 block，分批追加
    for start in range(0, len(blocks), 100):
        notion.blocks.children.append(page_id, children=blocks[start:start + 100])

    return f"https://www.notion.so/{page_id.replace('-', '')}"


# ── 列表交互 ──────────────────────────────────────────────────────────────────

def select_from_list(items: list, label_fn, prompt: str) -> int:
    for i, item in enumerate(items):
        print(f"  [{i + 1:3d}] {label_fn(item)}")
    while True:
        try:
            raw = input(f"\n{prompt} (输入编号): ").strip()
            idx = int(raw) - 1
            if 0 <= idx < len(items):
                return idx
            print(f"    请输入 1 到 {len(items)} 之间的数字")
        except (ValueError, EOFError):
            print("    请输入有效数字")
        except KeyboardInterrupt:
            print("\n已取消")
            sys.exit(0)


def is_english_book(book: dict) -> bool:
    info = book.get("bookInfo", {})
    lang = info.get("language", "").lower()
    if lang in ("en", "english", "eng"):
        return True
    title = info.get("title", "")
    # 简单判断：标题中英文字符占多数
    en_chars = sum(1 for c in title if c.isascii() and c.isalpha())
    return en_chars > len(title) * 0.5 if title else False


def find_book(books: list[dict], query: str) -> Optional[dict]:
    """按书名关键词查找书籍（不区分大小写）。"""
    q = query.lower()
    # 优先完整匹配
    for b in books:
        title = b.get("bookInfo", {}).get("title", "").lower()
        if q == title:
            return b
    # 再做包含匹配
    matches = [b for b in books if q in b.get("bookInfo", {}).get("title", "").lower()]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        titles = [b.get("bookInfo", {}).get("title", "") for b in matches]
        print(f"找到多本匹配书籍：{titles}")
        print("请使用更精确的书名。")
        sys.exit(1)
    return None


def find_chapter(chapters: list[dict], query: str) -> Optional[dict]:
    """按章节编号（1-indexed）或标题关键词查找章节。"""
    # 尝试作为数字索引处理
    try:
        idx = int(query) - 1
        if 0 <= idx < len(chapters):
            return chapters[idx]
        die(f"章节编号 {query} 超出范围（共 {len(chapters)} 章）")
    except ValueError:
        pass
    # 按标题关键词匹配
    q = query.lower()
    matches = [c for c in chapters if q in c.get("chapterTitle", "").lower()]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        titles = [c.get("chapterTitle", "") for c in matches]
        print(f"找到多个匹配章节：{titles}")
        print("请使用更精确的章节名或编号。")
        sys.exit(1)
    return None


def main():
    parser = argparse.ArgumentParser(
        description="从微信读书英文书籍提取生词并用 Claude 翻译",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""示例:
  # 交互式选择
  python weread_vocab.py

  # 直接指定书名（模糊匹配）和章节
  python weread_vocab.py --book "Atomic Habits" --chapter 3
  python weread_vocab.py --book "Sapiens" --chapter "The Cognitive Revolution"

  # 只列出书架/章节，不生成词汇表
  python weread_vocab.py --list-books
  python weread_vocab.py --book "Atomic Habits" --list-chapters
""",
    )
    parser.add_argument("--book", "-b", help="书名关键词（模糊匹配，省略则交互选择）")
    parser.add_argument(
        "--chapter", "-c",
        help="章节编号（如 3）或章节标题关键词（省略则交互选择）",
    )
    parser.add_argument("--list-books", action="store_true", help="列出所有书籍后退出")
    parser.add_argument("--list-chapters", action="store_true", help="列出所选书籍的所有章节后退出")
    parser.add_argument("--all-books", action="store_true", help="不过滤语言，显示所有书籍")
    parser.add_argument("--max-words", type=int, default=MAX_VOCAB_WORDS, help="最多提取生词数量")
    parser.add_argument("--output", "-o", help="输出文件路径（默认自动命名）")
    parser.add_argument("--notion", action="store_true", help="同时发送生词表到 Notion（需设置 NOTION_API_KEY 和 NOTION_PAGE_ID）")
    args = parser.parse_args()

    print("=" * 55)
    print("  微信读书英文生词提取器（powered by Claude API）")
    print("=" * 55)

    session = get_session()

    # ── 1. 获取书架 ──────────────────────────────────────────
    print("\n正在获取书架...")
    books = get_bookshelf(session)
    if not books:
        die("书架为空，或 Cookie 无法访问书架数据。")

    if not args.all_books:
        pool = [b for b in books if is_english_book(b)] or books
    else:
        pool = books

    def book_label(b: dict) -> str:
        info = b.get("bookInfo", {})
        return f"{info.get('title', '?')}  ——  {info.get('author', '')}"

    # --list-books：只打印书架
    if args.list_books:
        print(f"\n书架（共 {len(pool)} 本）：\n")
        for i, b in enumerate(pool):
            print(f"  [{i + 1:3d}] {book_label(b)}")
        return

    # 选书
    if args.book:
        selected_book = find_book(pool, args.book)
        if not selected_book:
            # 尝试在全部书架里找
            selected_book = find_book(books, args.book)
        if not selected_book:
            die(f"书架中未找到《{args.book}》，请用 --list-books 查看完整列表。")
        book_info = selected_book.get("bookInfo", {})
        book_title = book_info.get("title", "未知书名")
        print(f"\n已匹配书籍：《{book_title}》")
    else:
        print(f"\n找到 {len(pool)} 本书籍：\n")
        book_idx = select_from_list(pool, book_label, "请选择书籍")
        selected_book = pool[book_idx]
        book_info = selected_book.get("bookInfo", {})
        book_title = book_info.get("title", "未知书名")
        print(f"\n已选择：《{book_title}》")

    book_id = book_info.get("bookId", "")

    # ── 2. 获取章节列表 ───────────────────────────────────────
    print("正在获取章节列表...")
    chapters = get_chapters(session, book_id)
    if not chapters:
        die("获取章节失败，该书可能不支持网页阅读或章节信息不可用。")

    def chapter_label(c: dict) -> str:
        return c.get("chapterTitle", f"Chapter {c.get('chapterUid', '?')}")

    # --list-chapters：只打印章节列表
    if args.list_chapters:
        print(f"\n《{book_title}》章节列表（共 {len(chapters)} 章）：\n")
        for i, c in enumerate(chapters):
            print(f"  [{i + 1:3d}] {chapter_label(c)}")
        return

    # 选章节
    if args.chapter:
        selected_chapter = find_chapter(chapters, args.chapter)
        if not selected_chapter:
            die(f'未找到章节 "{args.chapter}"，请用 --list-chapters 查看完整列表。')
        chapter_title = chapter_label(selected_chapter)
        print(f"已匹配章节：{chapter_title}")
    else:
        print(f"\n共 {len(chapters)} 章：\n")
        ch_idx = select_from_list(chapters[:50], chapter_label, "请选择章节")
        selected_chapter = chapters[ch_idx]
        chapter_title = chapter_label(selected_chapter)
        print(f"\n已选择章节：{chapter_title}")

    chapter_uid = selected_chapter.get("chapterUid")

    # ── 3. 获取章节内容 ───────────────────────────────────────
    print("正在获取章节内容...")
    content = get_chapter_content(session, book_id, chapter_uid)
    word_count = len(content.split())
    print(f"成功获取章节内容（约 {word_count} 词）")

    # ── 4. Claude 分析生词 ────────────────────────────────────
    result = extract_vocabulary_with_claude(
        content, book_title, chapter_title, args.max_words
    )

    # ── 5. 保存结果 ───────────────────────────────────────────
    safe_title = re.sub(r"[^\w一-鿿\-]", "_", f"{book_title}_{chapter_title}")[:60]
    output_path = args.output or f"vocab_{safe_title}.md"

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(result)

    print(f"\n生词表已保存至：{output_path}")

    if args.notion:
        print(f"\n正在追加到 Notion 页面，章节标题：{chapter_title} ...")
        url = send_to_notion(chapter_title, result)
        print(f"已追加到 Notion 页面：{url}")

    print("\n" + "=" * 55)
    print(result)


if __name__ == "__main__":
    main()
