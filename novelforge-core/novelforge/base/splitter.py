"""
文本分片器
"""

from dataclasses import dataclass
from typing import List


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

    def split(self, text: str) -> List[TextChunk]:
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
                # 查找最近的句子结束符（从后往前找）
                sentence_end_positions = []
                
                # 中文标点
                for punct in ["。", "！", "？"]:
                    pos = text.rfind(punct, start, end)
                    if pos != -1:
                        sentence_end_positions.append(pos)
                
                # 英文标点（优先处理）
                for punct in [".", "!", "?"]:
                    pos = text.rfind(punct, start, end)
                    if pos != -1:
                        # 基本检查：确保不是明显的缩写（如 A. B. C.）
                        # 简单策略：如果句号后面跟着空格或大写字母，认为是句子结束
                        if punct == "." and pos + 1 < len(text):
                            next_char = text[pos + 1]
                            if next_char in [' ', '\n', '\t'] or next_char.isupper():
                                sentence_end_positions.append(pos)
                        else:
                            # ! 和 ? 通常都是句子结束
                            sentence_end_positions.append(pos)
                
                # 如果找到了句子结束符，并且位置合理（不在开头附近）
                if sentence_end_positions:
                    last_period = max(sentence_end_positions)
                    # 确保不是太靠近开头（使用整数除法）
                    min_valid_pos = start + (self.chunk_size // 3)
                    if last_period > min_valid_pos:
                        end = last_period + 1

            chunk_text = text[start:end]
            chunks.append(TextChunk(
                index=index,
                text=chunk_text,
                start=start,
                end=end,
            ))

            index += 1
            # 计算下一个起始位置，考虑重叠
            next_start = end - self.chunk_overlap
            # 确保不会无限循环
            if next_start <= start:
                next_start = end
            start = next_start

            if start >= len(text):
                break

        return chunks
