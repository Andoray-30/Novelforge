"""
角色提取器模块
从multi_window_v5.py中提取的角色相关功能
"""

import asyncio
import re
from dataclasses import dataclass, field
from typing import List, Tuple, Optional
from pathlib import Path
from novelforge.core.models import Character, Gender, CharacterRole
from novelforge.extractors.base_extractor import (
    CharacterExtractorInterface, 
    ExtractionConfig
)
from novelforge.services.ai_service import AIService


class CharacterExtractor(CharacterExtractorInterface):
    """角色提取器实现"""
    
    def __init__(self, config: ExtractionConfig, ai_service: Optional[AIService] = None):
        self.config = config
        self.ai_service = ai_service
    async def extract_characters(self, text: str) -> List[Character]:
        """
        从文本中提取角色信息
        
        Args:
            text: 输入文本
            
        Returns:
            List[Character]: 提取的角色列表
        """
        if not self.ai_service:
            raise ValueError("AI service is required for character extraction")

        # 创建智能分片器
        chunker = SmartChunker(
            chunk_size=self.config.chunk_size,
            chunk_overlap=self.config.chunk_overlap
        )

        # 分片文本
        chunks = chunker.chunk(text)
        if not chunks:
            return []

        # 提取所有片段中的角色
        all_characters = []
        for chunk in chunks:
            characters = await self._extract_characters_from_chunk(chunk)
            all_characters.extend(characters)

        # 合并和去重
        if len(all_characters) <= 1:
            return all_characters

        merged_characters = await self._enhanced_merge_characters(all_characters, self.ai_service)
        return merged_characters
    
    def _parse_age(self, age_data) -> int:
        """解析年龄数据"""
        if isinstance(age_data, int):
            return age_data
        elif isinstance(age_data, str):
            # 尝试从字符串中提取数字
            import re
            match = re.search(r'\d+', age_data)
            if match:
                return int(match.group())
        return 0
    
    def _map_gender(self, gender_data) -> Gender:
        """映射性别数据"""
        if not gender_data:
            return Gender.UNKNOWN
        
        gender_str = str(gender_data).lower()
        if gender_str in ['male', '男', '男性', 'man', 'boy']:
            return Gender.MALE
        elif gender_str in ['female', '女', '女性', 'woman', 'girl']:
            return Gender.FEMALE
        else:
            return Gender.UNKNOWN
    
    def _map_character_role(self, role_str: str) -> CharacterRole:
        """映射角色类型"""
        if not role_str:
            return CharacterRole.MINOR
        
        role_lower = role_str.lower()
        if role_lower in ['protagonist', '主角', '主人公', 'main character']:
            return CharacterRole.PROTAGONIST
        elif role_lower in ['antagonist', '反派', '敌人', 'villain']:
            return CharacterRole.ANTAGONIST
        elif role_lower in ['supporting', '配角', '辅助角色', 'side character']:
            return CharacterRole.SUPPORTING
        elif role_lower in ['minor', '龙套', '路人', 'background character']:
            return CharacterRole.MINOR
        else:
            return CharacterRole.MINOR
    
    async def _ai_deduplicate_check(self, char1: Character, char2: Character, ai_service) -> Tuple[bool, str]:
        """使用AI判断两个角色是否为同一角色"""
        prompt = f"""
请判断以下两个角色是否指的是同一个人物：

角色1：
- 姓名: {char1.name}
- 描述: {char1.description}
- 性格: {char1.personality}
- 外貌: {char1.appearance}
- 年龄: {char1.age}
- 性别: {char1.gender}
- 职业: {char1.occupation}

角色2：
- 姓名: {char2.name}
- 描述: {char2.description}
- 性格: {char2.personality}
- 外貌: {char2.appearance}
- 年龄: {char2.age}
- 性别: {char2.gender}
- 职业: {char2.occupation}

请回答"是"或"否"，并简要说明理由。
"""

        try:
            response = await ai_service.chat(prompt, max_tokens=1000)
            
            # 解析AI的响应
            response_lower = response.lower()
            is_same = "是" in response_lower or "yes" in response_lower
            
            reason = response.strip()
            
            return is_same, reason
        except Exception as e:
            # 如果AI检查失败，使用快速检查
            return self._quick_deduplicate_check(char1, char2), f"AI检查失败: {e}"
    
    def _quick_deduplicate_check(self, char1: Character, char2: Character) -> bool:
        """使用简单的启发式规则判断两个角色是否为同一角色"""
        # 如果名字完全相同，则认为是同一角色
        if char1.name == char2.name:
            return True
        
        # 如果名字相似度很高，且性别、年龄相同，则认为是同一角色
        name_similarity = 0
        if char1.name and char2.name:
            min_len = min(len(char1.name), len(char2.name))
            if min_len > 0:
                matches = sum(1 for a, b in zip(char1.name, char2.name) if a == b)
                name_similarity = matches / min_len
        
        if name_similarity > 0.8 and char1.gender == char2.gender and char1.age == char2.age:
            return True
        
        return False
    
    async def _extract_characters_from_chunk(self, chunk: 'Chunk') -> List[Character]:
        """从单个片段中提取角色信息"""
        prompt = f"""你是一个专业的小说分析师。请仔细分析以下文本片段，提取角色信息并收集相关的原文上下文。

文本片段：
{chunk.content}

## 任务说明
- 提取所有重要角色的信息，包括他们的姓名、背景、性格、外貌、年龄、性别、职业、角色定位等
- 忽略明显不属于角色的实体（如物品、地点、抽象概念等）
- 对于每个角色，除了基本信息外，还需要提取原文中的相关上下文信息：
  - 上下文片段 (contexts) - 包含角色的关键描述、行为或对话的原文片段
  - 对话示例 (dialogues) - 角色在原文中的典型对话
  - 行为示例 (behaviors) - 角色在原文中的具体行为表现

## 详细要求
- 每个角色至少提取1-3个上下文片段，每个片段不超过200字符
- 提取2-5个对话示例，展现角色的语言风格
- 提取2-3个行为示例，展现角色的行为特点

## 输出格式
请以JSON格式输出，结构如下：
{{
    "characters": [
        {{
            "name": "角色姓名",
            "description": "角色背景描述",
            "personality": ["性格特点1", "性格特点2"],
            "background": "角色背景信息",
            "appearance": "外貌描述",
            "age": "年龄（如果知道）",
            "gender": "性别（如果知道）",
            "occupation": "职业（如果知道）",
            "abilities": ["能力1", "能力2"],  # 如果职业不明确但有特殊能力
            "role": "角色定位（主角、配角等）",
            "aliases": ["别名1", "别名2"],
            "relationships": {{
                "其他角色名": {{
                    "relationship": "关系描述",
                    "type": "关系类型（family, romantic, friend, enemy等）",
                    "strength": "关系强度（1-10）"
                }}
            }},
            "contexts": [
                "包含角色的关键描述或行为的原文片段1",
                "包含角色的关键描述或行为的原文片段2"
            ],
            "dialogues": [
                "角色的对话示例1",
                "角色的对话示例2"
            ],
            "behaviors": [
                "角色的行为示例1",
                "角色的行为示例2"
            ]
        }}
    ]
}}

请注意：只输出JSON，不要添加其他解释文字。"""

        # 重试机制
        for attempt in range(self.config.max_retries):
            try:
                response = await self.ai_service.chat(prompt, max_tokens=8000, timeout=self.config.timeout)
                data = self.ai_service._parse_json(response, dict)

                characters = []
                char_list = data.get("characters", []) if isinstance(data, dict) else data

                for char_data in char_list:
                    if not isinstance(char_data, dict):
                        continue

                    # 解析年龄
                    age_data = char_data.get("age", 0)
                    if isinstance(age_data, str):
                        age = self._parse_age(age_data)
                    else:
                        age = int(age_data) if age_data else 0

                    # 映射性别
                    gender_data = char_data.get("gender", "unknown")
                    gender = self._map_gender(gender_data)

                    # 映射角色类型
                    role_data = char_data.get("role", "other")
                    role = self._map_character_role(role_data)

                    # 确保列表字段是正确的格式
                    personality_data = char_data.get("personality", "")
                    if isinstance(personality_data, list):
                        personality = ", ".join(personality_data) if personality_data else ""
                    elif isinstance(personality_data, str):
                        personality = personality_data
                    else:
                        personality = str(personality_data) if personality_data else ""

                    aliases = char_data.get("aliases", [])
                    if isinstance(aliases, str):
                        aliases = [aliases] if aliases else []
                    elif not isinstance(aliases, list):
                        aliases = []

                    abilities = char_data.get("abilities", [])
                    if isinstance(abilities, str):
                        abilities = [abilities] if abilities else []
                    elif not isinstance(abilities, list):
                        abilities = []

                    contexts = char_data.get("contexts", [])
                    if isinstance(contexts, str):
                        contexts = [contexts] if contexts else []
                    elif not isinstance(contexts, list):
                        contexts = []

                    dialogues = char_data.get("dialogues", [])
                    if isinstance(dialogues, str):
                        dialogues = [dialogues] if dialogues else []
                    elif not isinstance(dialogues, list):
                        dialogues = []

                    behaviors = char_data.get("behaviors", [])
                    if isinstance(behaviors, str):
                        behaviors = [behaviors] if behaviors else []
                    elif not isinstance(behaviors, list):
                        behaviors = []

                    # 创建角色对象
                    character = Character(
                        name=str(char_data.get("name", "Unknown")),
                        description=str(char_data.get("description", "")),
                        personality=personality,
                        background=str(char_data.get("background", "")),
                        appearance=str(char_data.get("appearance", "")),
                        age=age,
                        gender=gender,
                        occupation=str(char_data.get("occupation", "")),
                        role=role,
                        tags=aliases,
                        abilities=abilities,
                        relationships=[],  # 关系网络将在后续处理
                        source_contexts=contexts,
                        example_dialogues=dialogues,
                        behavior_examples=behaviors
                    )
                    characters.append(character)

                return characters

            except Exception as e:
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay)
                else:
                    print(f"角色提取失败: {e}")
                    return []
    async def _enhanced_merge_characters(self, all_characters: List[Character], ai_service) -> List[Character]:
        """增强型角色合并"""
        # 阶段1: 基础合并
        basic_merged = await self._hierarchical_merge_characters(all_characters)
        
        # 阶段2: AI增强合并（可选）
        try:
            ai_enhanced = await self._ai_enhanced_merge_with_rate_limit(basic_merged, "character", ai_service)
            if ai_enhanced is not None and len(ai_enhanced) > 0:
                return ai_enhanced
            else:
                return basic_merged
        except Exception:
            return basic_merged
    
    async def _ai_enhanced_merge_with_rate_limit(self, items: List[Character], item_type: str, ai_service) -> List[Character]:
        """使用限速器的AI增强合并"""
        # 这里将实现AI增强合并逻辑
        # 目前返回原列表，后续会从原文件迁移具体实现
        return items
    
    async def _hierarchical_merge_characters(self, all_characters: List[Character]) -> List[Character]:
        """分层合并角色"""
        # 这里将实现分层合并逻辑
        # 目前返回原列表，后续会从原文件迁移具体实现
        return all_characters

    async def _identify_characters(self, text: str) -> List[str]:
        """
        Identify character names from text (CLI compatibility method)
        """
        # Extract characters and return their names
        characters = await self.extract_characters(text)
        return [char.name for char in characters if char.name]

    async def _extract_character_info(self, text: str, name: str) -> Character:
        """
        Extract detailed character information by name (CLI compatibility method)
        """
        # Extract all characters and find the one with matching name
        characters = await self.extract_characters(text)
        for char in characters:
            if char.name == name:
                return char
        # Return empty character if not found
        from novelforge.core.models import Character, Gender, CharacterRole
        return Character(
            name=name,
            description="",
            personality="",
            background="",
            appearance="",
            age=0,
            gender=Gender.UNKNOWN,
            occupation="",
            role=CharacterRole.MINOR,
            tags=[],
            relationships=[],
            source_contexts=[],
            example_dialogues=[],
            behavior_examples=[]
        )


class SmartChunker:
    """智能文本分片器"""

    def __init__(self, chunk_size: int = 2000, chunk_overlap: int = 500):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def chunk(self, text: str) -> List['Chunk']:
        """将文本切分为重叠的片段"""
        if not text:
            return []

        # 按章节分割（如果存在）
        chunks = self._split_by_chapters(text)
        if len(chunks) <= 1:
            # 如果没有明显的章节分割，按固定大小分割
            chunks = self._split_by_size(text)

        # 添加重叠
        overlapped_chunks = self._add_overlap(chunks)

        # 创建Chunk对象
        result = []
        for i, chunk_text in enumerate(overlapped_chunks):
            result.append(Chunk(
                id=i + 1,
                title=f"片段 {i + 1}",
                content=chunk_text,
                start_pos=0,
                end_pos=len(chunk_text),
                metadata={}
            ))

        return result

    def _split_by_chapters(self, text: str) -> List[str]:
        """按章节分割文本"""
        import re
        # 尝试匹配常见的章节标题格式
        chapter_patterns = [
            r'\n第[一二三四五六七八九十百千]+[章节]',
            r'\nChapter \d+',
            r'\nCHAPTER \d+',
            r'\n第\d+[章节]',
        ]

        for pattern in chapter_patterns:
            if re.search(pattern, text):
                # 找到章节分隔符，按此分割
                parts = re.split(f'({pattern})', text)
                # 重新组合章节标题和内容
                chunks = []
                for i in range(1, len(parts), 2):
                    if i < len(parts) - 1:
                        chunk = parts[i] + parts[i + 1]
                        chunks.append(chunk.strip())
                if not chunks:  # 如果分割失败，返回原文本
                    return [text]
                return chunks

        return [text]

    def _split_by_size(self, text: str) -> List[str]:
        """按固定大小分割文本"""
        if len(text) <= self.chunk_size:
            return [text]

        chunks = []
        start = 0
        while start < len(text):
            end = min(start + self.chunk_size, len(text))
            chunks.append(text[start:end])
            start = end

        return chunks

    def _add_overlap(self, chunks: List[str]) -> List[str]:
        """为相邻片段添加重叠"""
        if len(chunks) <= 1 or self.chunk_overlap == 0:
            return chunks

        overlapped = []
        for i, chunk in enumerate(chunks):
            if i == 0:
                # 第一个片段
                overlapped.append(chunk)
            elif i == len(chunks) - 1:
                # 最后一个片段，只添加前向重叠
                prev_overlap = overlapped[-1][-self.chunk_overlap:]
                overlapped.append(prev_overlap + chunk)
            else:
                # 中间片段，添加前向和后向重叠
                prev_overlap = overlapped[-1][-self.chunk_overlap:]
                next_overlap = chunks[i + 1][:self.chunk_overlap]
                overlapped.append(prev_overlap + chunk + next_overlap)

        return overlapped


@dataclass
class Chunk:
    id: int
    title: str
    content: str
    start_pos: int = 0
    end_pos: int = 0
    metadata: dict = field(default_factory=dict)