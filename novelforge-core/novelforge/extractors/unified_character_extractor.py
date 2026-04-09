"""
统一角色提取器 - 合并基础版和增强版的优点，充分利用大模型长上下文

设计原则：
1. 提取逻辑保持简单直接（继承基础版的优秀prompt）
2. 合并策略智能化但程序化（避免AI生成JSON导致字段丢失）
3. 批量处理最大化上下文利用（减少API调用次数）
4. 限速保护避免触发限流
"""

import asyncio
import re
from typing import List, Tuple, Optional, Dict, Set
from dataclasses import dataclass
from novelforge.core.models import Character, Gender, CharacterRole
from novelforge.extractors.base_extractor import (
    CharacterExtractorInterface,
    ExtractionConfig,
    SmartChunker,
    Chunk
)
from novelforge.services.ai_service import AIService


@dataclass
class CharacterGroup:
    """角色分组信息 - 用于AI去重返回"""
    indices: List[int]  # 角色索引列表
    canonical_name: str  # 标准名称


class UnifiedCharacterExtractor(CharacterExtractorInterface):
    """
    统一角色提取器

    核心改进：
    1. 批量提取：一次处理多个文本片段，充分利用上下文窗口
    2. 智能去重：AI只返回分组索引，合并逻辑完全程序化
    3. 信息保留：合并时整合所有字段，不丢失任何信息
    4. 限速保护：内置限速器避免触发API限流
    """

    # 大模型上下文窗口配置
    MAX_CONTEXT_TOKENS = 100000  # 假设100k上下文
    MAX_CHARS_PER_BATCH = 30     # 每批最多处理30个角色去重
    MAX_CHUNKS_PER_EXTRACTION = 5  # 每次提取最多合并5个片段

    def __init__(self, config: ExtractionConfig, ai_service: Optional[AIService] = None):
        self.config = config
        self.ai_service = ai_service
        self.chunker = SmartChunker(
            chunk_size=config.chunk_size,
            chunk_overlap=config.chunk_overlap
        )

    async def extract_characters(self, text: str) -> List[Character]:
        """
        从文本中提取角色信息 - 统一入口

        流程：
        1. 智能分片
        2. 批量提取（合并片段充分利用上下文）
        3. 智能去重（AI分组+程序化合并）
        4. 返回完整角色列表
        """
        if not self.ai_service:
            raise ValueError("AI service is required for character extraction")

        # 1. 分片
        chunks = self.chunker.chunk(text)
        if not chunks:
            return []

        # 2. 批量提取 - 合并多个片段一次性提取
        all_characters = await self._batch_extract_from_chunks(chunks)

        if len(all_characters) <= 1:
            return all_characters

        # 3. 智能去重
        merged_characters = await self._smart_merge_characters(all_characters)

        return merged_characters

    async def _batch_extract_from_chunks(self, chunks: List[Chunk]) -> List[Character]:
        """
        并行从多个片段中提取角色 - 由底层 AIService 自动进行智能并发控制
        """
        all_characters = []
        tasks = []
        
        async def worker(batch_chunks):
            # 直接调用提取，不再需要在这里手动限流，底层已接入动态并发
            combined_content = "\n\n=== 文本片段分隔 ===\n\n".join([
                f"[片段 {j+1}]\n{chunk.content}"
                for j, chunk in enumerate(batch_chunks)
            ])
            return await self._extract_from_combined_text(combined_content)

        # 准备所有并发任务
        for i in range(0, len(chunks), self.MAX_CHUNKS_PER_EXTRACTION):
            batch_chunks = chunks[i:i + self.MAX_CHUNKS_PER_EXTRACTION]
            tasks.append(worker(batch_chunks))

        # 并行执行并汇总结果
        results = await asyncio.gather(*tasks)
        for characters in results:
            all_characters.extend(characters)

        return all_characters

    async def _extract_from_combined_text(self, combined_text: str) -> List[Character]:
        """从合并后的文本中提取角色"""
        prompt = f"""你是一个专业的小说角色分析师。请仔细分析以下文本，深入提取所有重要角色信息。

文本内容：
{combined_text}

## 任务说明
从文本中提取所有重要角色，为每个角色创建详细的角色档案。角色档案应该像人物小传一样丰富和立体。

## 详细要求

### 1. 基本信息（必须完整）
- **name**: 角色姓名（必须准确）
- **description**: 角色背景描述（200-500字，包含出身、经历、现状）
- **personality**: 性格特点数组（3-8个关键词，如["冷静", "果断", "善良"]）
- **background**: 详细背景故事（300-800字，包含成长经历、重要事件）
- **appearance**: 外貌描写（200-400字，包含身高、体型、面容、穿着、气质）
- **age**: 年龄（数字或描述，如25或"中年"）
- **gender**: 性别（"男"/"女"/"未知"）
- **occupation**: 职业或身份
- **abilities**: 能力或技能数组（如有）
- **role**: 角色定位（"protagonist"/"supporting"/"antagonist"/"minor"）
- **aliases**: 别名或称号数组（如有）
- **relationships**: 该角色与其他角色的关系数组。每个关系包含：
    - **target**: 对方角色姓名
    - **type**: 关系类型（如"师徒", "敌人", "爱慕", "亲属"）
    - **description**: 关系描述（如"表面合作实则互相猜忌"）
    - **strength**: 强度（1-10）

### 2. 原文证据（必须提取）

- **contexts**: 原文中描述该角色的关键段落（2-5段，每段50-200字）
- **dialogues**: 角色的典型对话（3-8句，展现语言风格）
- **behaviors**: 角色的具体行为表现（3-5个场景描述）

### 3. 质量标准
- 描述必须具体、生动，避免空洞的形容词堆砌
- 背景故事要有时间线和因果关系
- 外貌描写要能让读者形成清晰画面
- 性格特点要通过具体行为体现

## 输出示例
{{
    "characters": [
        {{
            "name": "林墨",
            "description": "28岁的考古学家，出身于书香门第...",
            "personality": ["沉稳", "理性", "坚韧", "好奇心强", "有责任感"],
            "background": "林墨出生于北京一个知识分子家庭...",
            "appearance": "身高182cm，体型修长但结实...",
            "age": 28,
            "gender": "男",
            "occupation": "考古学家",
            "abilities": ["文物记忆感知", "古代文字解读", "考古现场分析"],
            "role": "protagonist",
            "aliases": ["林博士", "墨哥"],
            "contexts": [
                "林墨蹲下身，手指轻轻抚过石碑上的纹路...",
                "他的眼镜反射着探照灯的光芒..."
            ],
            "dialogues": [
                "这块石碑...它的纹路不属于任何已知的古代文明。",
                "我们必须小心，这里可能隐藏着改变历史的秘密。"
            ],
            "behaviors": [
                "面对危险时总是先保护队友",
                "研究文物时会完全沉浸，忘记时间",
                "遇到难题时会不自觉地转动手腕上的檀木珠"
            ]
        }}
    ]
}}

## 重要提醒
1. **必须输出JSON格式**，不要添加markdown代码块标记
2. **personality必须是数组**，不要输出逗号分隔的字符串
3. **description和background必须详细**，不能只有一句话
4. **appearance必须具体**，包含可视觉化的细节
5. **所有字段都必须有值**，如果没有明确信息用"未知"或[]填充
6. 如果文本片段中有多个角色，请全部提取

请分析文本并输出JSON："""

        for attempt in range(self.config.max_retries):
            try:
                response = await self.ai_service.chat(
                    prompt,
                    max_tokens=8000,
                    timeout=self.config.timeout
                )
                return self._parse_character_response(response)
            except Exception as e:
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay)
                else:
                    raise

        return []

    def _parse_character_response(self, response: str) -> List[Character]:
        """解析AI返回的角色JSON"""
        try:
            data = self.ai_service._parse_json(response, dict)
            char_list = data.get("characters", []) if isinstance(data, dict) else data

            characters = []
            for char_data in char_list:
                if not isinstance(char_data, dict):
                    continue

                character = self._create_character_from_dict(char_data)
                characters.append(character)

            return characters
        except Exception as e:
            print(f"解析角色响应失败: {e}")
            return []

    def _create_character_from_dict(self, char_data: dict) -> Character:
        """从字典创建Character对象"""
        # 解析年龄
        age_data = char_data.get("age", 0)
        age = self._parse_age(age_data)

        # 映射性别
        gender = self._map_gender(char_data.get("gender", "unknown"))

        # 映射角色类型
        role = self._map_character_role(char_data.get("role", "minor"))

        # 处理列表字段
        personality = self._ensure_list(char_data.get("personality", []))
        aliases = self._ensure_list(char_data.get("aliases", []))
        abilities = self._ensure_list(char_data.get("abilities", []))
        contexts = self._ensure_list(char_data.get("contexts", []))
        dialogues = self._ensure_list(char_data.get("dialogues", []))
        behaviors = self._ensure_list(char_data.get("behaviors", []))

        return Character(
            name=str(char_data.get("name", "Unknown")),
            description=str(char_data.get("description", "")),
            personality=", ".join(personality) if personality else "",
            background=str(char_data.get("background", "")),
            appearance=str(char_data.get("appearance", "")),
            age=age,
            gender=gender,
            occupation=str(char_data.get("occupation", "")),
            role=role,
            tags=aliases,
            abilities=abilities,
            relationships=[],
            source_contexts=contexts,
            example_dialogues=dialogues,
            behavior_examples=behaviors
        )

    def _parse_age(self, age_data) -> int:
        """解析年龄数据"""
        if isinstance(age_data, int):
            return age_data
        elif isinstance(age_data, str):
            match = re.search(r'\d+', age_data)
            if match:
                return int(match.group())
        return 0

    def _map_gender(self, gender_data: str) -> Gender:
        """映射性别数据"""
        if not gender_data:
            return Gender.UNKNOWN

        gender_str = str(gender_data).lower()
        if gender_str in ['male', '男', '男性', 'man', 'boy']:
            return Gender.MALE
        elif gender_str in ['female', '女', '女性', 'woman', 'girl']:
            return Gender.FEMALE
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
        return CharacterRole.MINOR

    def _ensure_list(self, data) -> List[str]:
        """确保数据是列表格式"""
        if isinstance(data, list):
            return [str(item) for item in data if item]
        elif isinstance(data, str) and data:
            return [data]
        return []

    async def _smart_merge_characters(self, all_characters: List[Character]) -> List[Character]:
        """
        智能合并角色 - 核心改进

        流程：
        1. 程序化预合并（按名称完全匹配）
        2. AI智能分组（批量判断哪些角色是同一人）
        3. 程序化合并（整合所有字段，不丢失信息）
        """
        # 阶段1: 程序化预合并 - 合并完全同名的角色
        pre_merged = self._merge_by_exact_name(all_characters)

        if len(pre_merged) <= 1:
            return pre_merged

        # 阶段2: AI智能分组 - 批量判断角色相似性
        groups = await self._ai_group_characters(pre_merged)

        # 阶段3: 程序化合并 - 按组合并，保留所有信息
        final_merged = self._merge_by_groups(pre_merged, groups)

        return final_merged

    def _merge_by_exact_name(self, characters: List[Character]) -> List[Character]:
        """按名称完全匹配合并"""
        name_map: Dict[str, Character] = {}

        for char in characters:
            name = char.name.strip()
            if not name:
                continue

            if name not in name_map:
                name_map[name] = char
            else:
                # 合并信息到已有角色
                self._merge_character_data(name_map[name], char)

        return list(name_map.values())

    def _merge_character_data(self, target: Character, source: Character):
        """合并两个角色的数据，保留所有信息"""
        # 合并描述（取最长的）
        if len(source.description) > len(target.description):
            target.description = source.description

        # 合并背景（取最长的）
        if len(source.background) > len(target.background):
            target.background = source.background

        # 合并外貌（取最长的）
        if len(source.appearance) > len(target.appearance):
            target.appearance = source.appearance

        # 合并性格（去重）
        target_personality = set(target.personality.split(", ")) if target.personality else set()
        source_personality = set(source.personality.split(", ")) if source.personality else set()
        merged_personality = target_personality | source_personality
        target.personality = ", ".join(sorted(merged_personality)) if merged_personality else ""

        # 合并年龄（如果target没有）
        if source.age and not target.age:
            target.age = source.age

        # 合并职业（取最长的）
        if len(source.occupation) > len(target.occupation):
            target.occupation = source.occupation

        # 合并角色定位（取最重要的）
        role_priority = {
            CharacterRole.PROTAGONIST: 3,
            CharacterRole.ANTAGONIST: 2,
            CharacterRole.SUPPORTING: 1,
            CharacterRole.MINOR: 0
        }
        if role_priority.get(source.role, 0) > role_priority.get(target.role, 0):
            target.role = source.role

        # 合并标签（去重）
        target.tags = list(set(target.tags + source.tags))

        # 合并能力（去重）
        target.abilities = list(set(target.abilities + source.abilities))

        # 合并上下文（去重保留）
        target.source_contexts = self._merge_lists(target.source_contexts, source.source_contexts)
        target.example_dialogues = self._merge_lists(target.example_dialogues, source.example_dialogues)
        target.behavior_examples = self._merge_lists(target.behavior_examples, source.behavior_examples)

    def _merge_lists(self, list1: List[str], list2: List[str]) -> List[str]:
        """合并两个列表，去重并保持顺序"""
        seen = set()
        result = []
        for item in list1 + list2:
            if item and item not in seen:
                seen.add(item)
                result.append(item)
        return result

    async def _ai_group_characters(self, characters: List[Character]) -> List[CharacterGroup]:
        """
        AI智能分组 - 核心改进

        让AI批量判断哪些角色是同一人，但只返回分组索引，不生成角色对象
        这样避免了AI生成JSON导致的字段丢失问题
        """
        if len(characters) <= 1:
            return [CharacterGroup(indices=[i], canonical_name=characters[i].name)
                    for i in range(len(characters))]

        # 分批处理，每批最多MAX_CHARS_PER_BATCH个角色
        all_groups = []

        for batch_start in range(0, len(characters), self.MAX_CHARS_PER_BATCH):
            batch_end = min(batch_start + self.MAX_CHARS_PER_BATCH, len(characters))
            batch = characters[batch_start:batch_end]

            batch_groups = await self._ai_group_batch(batch, batch_start)
            all_groups.extend(batch_groups)

        return all_groups

    async def _ai_group_batch(self, characters: List[Character], offset: int) -> List[CharacterGroup]:
        """对一批角色进行AI分组"""
        # 构建角色描述列表
        char_descriptions = []
        for i, char in enumerate(characters):
            desc = f"[{i}] 姓名: {char.name}"
            if char.description:
                desc += f", 描述: {char.description[:100]}..."
            if char.tags:
                desc += f", 别名: {', '.join(char.tags)}"
            if char.appearance:
                desc += f", 外貌: {char.appearance[:50]}..."
            char_descriptions.append(desc)

        prompt = f"""请分析以下角色列表，识别哪些角色是同一个人的不同称呼或描述。

角色列表：
{chr(10).join(char_descriptions)}

## 任务
判断列表中哪些角色实际上是指同一个人。考虑：
1. 完全相同的姓名
2. 昵称/别名（如"林墨"和"墨哥"）
3. 同一人物在不同片段中的描述

## 输出格式
请返回JSON格式，只包含分组索引：
{{
    "groups": [
        [0, 2],  // 表示索引0和2的角色是同一人
        [1],     // 表示索引1的角色是独立的
        [3, 4]   // 表示索引3和4的角色是同一人
    ]
}}

重要：只返回JSON分组索引，不要返回角色详细信息。"""

        try:
            response = await self.ai_service.chat(prompt, max_tokens=2000)
            data = self.ai_service._parse_json(response, dict)
            groups_data = data.get("groups", [])

            # 转换为CharacterGroup对象
            groups = []
            used_indices = set()

            for group_indices in groups_data:
                if not isinstance(group_indices, list):
                    continue

                # 转换相对索引为绝对索引
                absolute_indices = [offset + idx for idx in group_indices if isinstance(idx, int)]

                if absolute_indices:
                    # 使用组内第一个角色的名称作为标准名称
                    canonical_name = characters[group_indices[0]].name if group_indices[0] < len(characters) else "Unknown"
                    groups.append(CharacterGroup(
                        indices=absolute_indices,
                        canonical_name=canonical_name
                    ))
                    used_indices.update(absolute_indices)

            # 处理未被分组的角色（每个作为独立组）
            for i in range(len(characters)):
                absolute_idx = offset + i
                if absolute_idx not in used_indices:
                    groups.append(CharacterGroup(
                        indices=[absolute_idx],
                        canonical_name=characters[i].name
                    ))

            return groups

        except Exception as e:
            print(f"AI分组失败: {e}，回退到独立分组")
            # 回退：每个角色独立成组
            return [
                CharacterGroup(indices=[offset + i], canonical_name=char.name)
                for i, char in enumerate(characters)
            ]

    def _merge_by_groups(self, characters: List[Character], groups: List[CharacterGroup]) -> List[Character]:
        """按组合并角色"""
        merged = []

        for group in groups:
            if not group.indices:
                continue

            # 获取组内所有角色
            group_chars = [characters[i] for i in group.indices if i < len(characters)]

            if not group_chars:
                continue

            # 以第一个角色为基础，合并其他角色的信息
            base_char = group_chars[0]

            for other_char in group_chars[1:]:
                self._merge_character_data(base_char, other_char)

            # 更新为标准名称
            base_char.name = group.canonical_name

            merged.append(base_char)

        return merged
