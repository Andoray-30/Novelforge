"""
文本分片器
"""

from dataclasses import dataclass


@dataclass
class TextChunk:
    """文本分片"""
    index: int
    text: str
    start: int
    end: int


class TextSplitter:
    """文本分片器"""

    def __init__(
        self,
        chunk_size: int = 3000,
        chunk_overlap: int = 200,
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def split(self, text: str) -> list[TextChunk]:
        """将文本分割成多个片段"""
        if len(text) <= self.chunk_size:
            return [TextChunk(index=0, text=text, start=0, end=len(text))]

        chunks = []
        start = 0
        index = 0

        while start < len(text):
            end = min(start + self.chunk_size, len(text))

            # 尝试在句子边界分割
            if end < len(text):
                # 查找最近的句子结束符
                last_period = max(
                    text.rfind("。", start, end),
                    text.rfind("！", start, end),
                    text.rfind("？", start, end),
                    text.rfind(".", start, end),
                    text.rfind("!", start, end),
                    text.rfind("?", start, end),
                )
                if last_period > start + self.chunk_size // 2:
                    end = last_period + 1

            chunk_text = text[start:end]
            chunks.append(TextChunk(
                index=index,
                text=chunk_text,
                start=start,
                end=end,
            ))

            index += 1
            start = end - self.chunk_overlap

            if start >= len(text):
                break

        return chunks
