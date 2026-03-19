"""
增强版角色提取器模块

该模块实现了高级角色提取功能，集成了以下增强特性：
1. 角色卡智能去重合并：通过程序化和AI混合方法合并重复角色
2. 上下文信息提取：保存原文中的上下文片段、对话示例和行为示例
3. AI驱动的批量合并：使用大语言模型一次性处理整个角色列表
4. 分层合并策略：结合快速程序化合并和AI深度分析
5. 限速器支持：避免API调用频率超限
6. 保留最完整信息：合并过程中保留所有相关信息，避免信息丢失

主要功能：
- 智能分片处理：将长文本分片以提高提取精度
- 角色去重合并：识别并合并描述同一角色的多个条目
- 信息丰富化：整合来自不同文本片段的完整角色信息
- API兼容：保持与基础提取器的接口兼容性
"""
import asyncio
import re
from typing import List, Tuple, Optional, Dict, Any
from pathlib import Path
from novelforge.core.models import Character, Gender, CharacterRole
from novelforge.extractors.base_extractor import (
    CharacterExtractorInterface,
    ExtractionConfig
)
from novelforge.services.ai_service import AIService
from novelforge.extractors.character_extractor import CharacterExtractor, SmartChunker, Chunk
from novelforge.services.character_deduplicator import create_character_deduplicator, CharacterDeduplicator


class EnhancedCharacterExtractor(CharacterExtractorInterface):
    """增强版角色提取器实现"""
    
    def __init__(self, config: ExtractionConfig, ai_service: Optional[AIService] = None):
        """
        初始化增强版角色提取器
        
        Args:
            config: 提取配置参数
            ai_service: AI服务实例，用于智能处理
        """
        self.config = config
        self.ai_service = ai_service
        # 创建基础提取器实例，复用基础功能
        self.base_extractor = CharacterExtractor(config, ai_service)
    
    async def extract_characters(self, text: str) -> List[Character]:
        """
        从文本中提取角色信息 - 增强版实现
        
        该方法实现了完整的角色提取流程，包括：
        1. 文本智能分片
        2. 分片并行提取
        3. 程序化智能合并
        4. AI增强合并
        
        Args:
            text: 输入文本
            
        Returns:
            List[Character]: 提取的角色列表，已去重合并
        """
        if not self.ai_service:
            raise ValueError("AI service is required for character extraction")

        # 创建智能分片器，将长文本分割为处理单元
        chunker = SmartChunker(
            chunk_size=self.config.chunk_size,
            chunk_overlap=self.config.chunk_overlap
        )

        # 分片文本，为并行处理做准备
        chunks = chunker.chunk(text)
        if not chunks:
            return []

        # 提取所有片段中的角色
        all_characters = []
        for chunk in chunks:
            characters = await self._extract_characters_from_chunk(chunk)
            all_characters.extend(characters)

        # 如果角色数量不多，直接返回
        if len(all_characters) <= 1:
            return all_characters

        # 使用增强的合并方法，结合程序化和AI技术
        merged_characters = await self._enhanced_merge_characters(all_characters, self.ai_service)
        return merged_characters
    
    def _parse_age(self, age_data) -> int:
        """解析年龄数据"""
        return self.base_extractor._parse_age(age_data)
    
    def _map_gender(self, gender_data) -> Gender:
        """映射性别数据"""
        return self.base_extractor._map_gender(gender_data)
    
    def _map_character_role(self, role_str: str) -> CharacterRole:
        """映射角色类型"""
        return self.base_extractor._map_character_role(role_str)
    
    async def _ai_deduplicate_check(self, char1: Character, char2: Character, ai_service) -> Tuple[bool, str]:
        """使用AI判断两个角色是否为同一角色"""
        return await self.base_extractor._ai_deduplicate_check(char1, char2, ai_service)
    
    def _quick_deduplicate_check(self, char1: Character, char2: Character) -> bool:
        """使用简单的启发式规则判断两个角色是否为同一角色"""
        return self.base_extractor._quick_deduplicate_check(char1, char2)
    
    async def _extract_characters_from_chunk(self, chunk: 'Chunk') -> List[Character]:
        """从单个片段中提取角色信息"""
        return await self.base_extractor._extract_characters_from_chunk(chunk)
    
    async def _enhanced_merge_characters(self, all_characters: List[Character], ai_service) -> List[Character]:
        """
        增强型角色合并 - 结合程序化和AI方法
        
        实现两阶段合并策略：
        1. 基础合并：使用程序化方法快速合并明显重复项
        2. AI增强合并：使用大语言模型处理复杂合并场景
        3. 高级去重：使用专门的去重器处理变体名称等复杂情况
        
        Args:
            all_characters: 待合并的角色列表
            ai_service: AI服务实例
            
        Returns:
            List[Character]: 合并后的角色列表
        """
        if not all_characters:
            return []
        
        from rich.console import Console
        console = Console()
        console.print(f"[cyan]开始增强型角色合并，处理 {len(all_characters)} 个角色...[/cyan]")
        
        # 阶段1: 基础合并 - 快速处理明显重复项
        basic_merged = await self._hierarchical_merge_characters(all_characters)
        console.print(f"[cyan]基础合并完成: {len(all_characters)} -> {len(basic_merged)}[/cyan]")
        
        # 阶段2: 高级去重 - 使用专门的去重器处理变体名称
        try:
            deduplicator = create_character_deduplicator(ai_service)
            advanced_deduplicated = await deduplicator.deduplicate_character_list(basic_merged)
            console.print(f"[cyan]高级去重完成: {len(basic_merged)} -> {len(advanced_deduplicated)}[/cyan]")
        except Exception as e:
            console.print(f"[yellow]高级去重发生异常: {e}，使用基础合并结果[/yellow]")
            advanced_deduplicated = basic_merged
        
        # 阶段3: AI增强合并（可选）- 解决复杂合并场景
        try:
            ai_enhanced = await self._ai_enhanced_merge_with_rate_limit(advanced_deduplicated, "character", ai_service)
            if ai_enhanced is not None and len(ai_enhanced) > 0:
                console.print(f"[green]AI增强合并完成: {len(advanced_deduplicated)} -> {len(ai_enhanced)}[/green]")
                return ai_enhanced
            else:
                console.print("[yellow]AI合并失败，使用高级去重结果[/yellow]")
                return advanced_deduplicated
        except Exception as e:
            console.print(f"[yellow]AI增强合并发生异常: {e}，使用高级去重结果[/yellow]")
            return advanced_deduplicated
    
    async def _ai_enhanced_merge_with_rate_limit(self, items: List[Character], item_type: str, ai_service) -> List[Character]:
        """使用限速器的AI增强合并"""
        if not items or len(items) <= 1:
            return items
        
        # 为AI服务添加限速器（如果尚未添加）
        if not hasattr(ai_service, 'rate_limiter'):
            from novelforge.base.rate_limiter import RateLimiter
            ai_service.rate_limiter = RateLimiter(
                rpm_limit=self.config.rpm_limit if hasattr(self.config, 'rpm_limit') else 500,
                tpm_limit=self.config.tpm_limit if hasattr(self.config, 'tpm_limit') else 2_000_000
            )
        
        try:
            # 获取限流许可
            await ai_service.rate_limiter.acquire(estimated_tokens=2000)
            
            # 根据项目类型调用相应的AI批量合并方法
            if item_type == "character":
                return await self._ai_batch_merge_characters(items, ai_service)
            else:
                # 对其他类型也可以实现类似方法
                return items
        except Exception as e:
            from rich.console import Console
            console = Console()
            console.print(f"[yellow]AI增强合并失败: {e}[/yellow]")
            return items
    
    async def _ai_batch_merge_characters(self, characters: List[Character], ai_service: AIService) -> List[Character]:
        """
        使用AI批量合并角色列表中的重复项
        """
        if not characters or len(characters) <= 1:
            return characters
        
        # 为AI服务添加限速器（如果尚未添加）
        if not hasattr(ai_service, 'rate_limiter'):
            from novelforge.base.rate_limiter import RateLimiter
            ai_service.rate_limiter = RateLimiter(
                rpm_limit=self.config.rpm_limit if hasattr(self.config, 'rpm_limit') else 500,
                tpm_limit=self.config.tpm_limit if hasattr(self.config, 'tpm_limit') else 2_000_000
            )
        
        # 获取限流许可
        await ai_service.rate_limiter.acquire(estimated_tokens=2000)
        
        # 创建AI提示词，让AI一次性处理整个角色列表
        character_descriptions = []
        for i, char in enumerate(characters, 1):
            desc = f"{i}. 姓名: {char.name}"
            if char.description:
                desc += f", 描述: {char.description}"
            if char.personality:
                desc += f", 性格: {char.personality}"
            if char.appearance:
                desc += f", 外貌: {char.appearance}"
            if char.age:
                desc += f", 年龄: {char.age}"
            if char.gender:
                desc += f", 性别: {char.gender}"
            if char.occupation:
                desc += f", 职业: {char.occupation}"
            
            character_descriptions.append(desc)
        
        prompt = f"""请分析以下角色列表，识别并合并表示同一人物的多个角色条目：
 
角色列表：
{"\n".join(character_descriptions)}

请返回合并后的角色列表JSON格式，确保：
1. 同一个人物只保留一个条目
2. 合并所有相关信息（描述、性格、外貌、关系等）
3. 保留最完整和准确的信息
4. 维持原始字段结构不变
5. 不要删除或编造任何信息

返回格式为JSON数组，包含合并后的角色对象。"""
        
        try:
            response = await ai_service.chat(prompt, max_tokens=4000)
            
            # 尝试从响应中提取JSON部分
            import json
            import re
            
            # 查找JSON数组
            json_match = re.search(r'\[.*\]', response, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
                try:
                    merged_chars_data = json.loads(json_str)
                except json.JSONDecodeError:
                    # 如果直接解析失败，尝试使用AI服务的解析方法
                    try:
                        merged_chars_data = ai_service._parse_json(response, list)
                    except:
                        from rich.console import Console
                        console = Console()
                        console.print("[yellow]AI批量合并角色：JSON解析失败，回退到程序化合并[/yellow]")
                        return await self._deduplicate_characters_with_ai_fallback(characters, ai_service)
                
                # 将数据转换为Character对象
                merged_chars = []
                for char_data in merged_chars_data:
                    try:
                        # 确保数据符合Character模型格式
                        char_obj = Character(**char_data)
                        merged_chars.append(char_obj)
                    except Exception as e:
                        from rich.console import Console
                        console = Console()
                        console.print(f"[yellow]转换角色数据失败: {e}[/yellow]")
                        # 如果转换失败，跳过该角色
                        continue
                
                return merged_chars
            else:
                # 尝试使用AI服务的解析方法
                try:
                    merged_chars_data = ai_service._parse_json(response, list)
                    # 将数据转换为Character对象
                    merged_chars = []
                    for char_data in merged_chars_data:
                        try:
                            # 确保数据符合Character模型格式
                            char_obj = Character(**char_data)
                            merged_chars.append(char_obj)
                        except Exception as e:
                            from rich.console import Console
                            console = Console()
                            console.print(f"[yellow]转换角色数据失败: {e}[/yellow]")
                            # 如果转换失败，跳过该角色
                            continue
                    return merged_chars
                except:
                    # 如果无法找到JSON，回退到原有逻辑
                    from rich.console import Console
                    console = Console()
                    console.print("[yellow]AI批量合并未返回有效JSON，回退到程序化合并[/yellow]")
                    return await self._deduplicate_characters_with_ai_fallback(characters, ai_service)
                
        except Exception as e:
            from rich.console import Console
            console = Console()
            console.print(f"[yellow]AI批量合并出错: {e}，回退到程序化合并[/yellow]")
            return await self._deduplicate_characters_with_ai_fallback(characters, ai_service)

    async def _deduplicate_characters_with_ai_fallback(self, characters: List[Character], ai_service: AIService) -> List[Character]:
        """原有逻辑的备选方法，用于回退"""
        if not characters:
            return []
        
        # 首先使用快速去重
        deduplicated = [characters[0]]
        
        for char in characters[1:]:
            is_duplicate = False
            for existing_char in deduplicated:
                # 使用AI检查是否为同一角色
                is_same, reason = await self._ai_deduplicate_check(char, existing_char, ai_service)
                if is_same:
                    # 合并角色信息
                    self._merge_character_info(existing_char, char)
                    is_duplicate = True
                    break
            
            if not is_duplicate:
                deduplicated.append(char)
        
        return deduplicated

    async def _hierarchical_merge_characters(self, all_characters: List[Character]) -> List[Character]:
        """分层合并角色 - 主要的优化合并方法"""
        if not all_characters:
            return []
        
        from rich.console import Console
        console = Console()
        console.print(f"[cyan]开始程序化+AI混合合并 {len(all_characters)} 个角色...[/cyan]")
        
        # 首先使用程序化方法基于名称合并
        characters_dict = {}
        for char in all_characters:
            name = char.name.strip() if char.name else ""
            if not name:
                continue
                
            if name not in characters_dict:
                characters_dict[name] = char.dict()
            else:
                # 合并信息
                existing = characters_dict[name]
                current = char.dict()
                
                # 合并描述
                if current.get('description') and not existing.get('description'):
                    existing['description'] = current['description']
                elif current.get('description') and existing.get('description') and current['description'] != existing['description']:
                    existing['description'] = f"{existing['description']} {current['description']}".strip()
                
                # 合并性格
                if current.get('personality') and not existing.get('personality'):
                    existing['personality'] = current['personality']
                elif current.get('personality') and existing.get('personality') and current['personality'] != existing['personality']:
                    existing['personality'] = f"{existing['personality']}, {current['personality']}".strip()
                
                # 合并外貌
                if current.get('appearance') and not existing.get('appearance'):
                    existing['appearance'] = current['appearance']
                
                # 合并年龄
                if current.get('age') and not existing.get('age'):
                    existing['age'] = current['age']
                
                # 合并职业
                if current.get('occupation') and not existing.get('occupation'):
                    existing['occupation'] = current['occupation']
                
                # 合并标签
                if current.get('tags'):
                    existing_tags = existing.get('tags', [])
                    existing['tags'] = list(set(existing_tags + current['tags']))
                
                # 合并关系
                if current.get('relationships'):
                    existing_rels = existing.get('relationships', [])
                    existing['relationships'] = existing_rels + current['relationships']
                
                # 合并 mentions
                existing['mentions'] = existing.get('mentions', 0) + current.get('mentions', 1)
                
                # 合并新增的上下文字段
                # 合并原文上下文片段，去重
                if current.get('source_contexts'):
                    existing_contexts = existing.get('source_contexts', [])
                    existing['source_contexts'] = list(dict.fromkeys(existing_contexts + current['source_contexts']))  # 保持顺序的去重
                
                # 合并对话示例，去重
                if current.get('example_dialogues'):
                    existing_dialogues = existing.get('example_dialogues', [])
                    existing['example_dialogues'] = list(dict.fromkeys(existing_dialogues + current['example_dialogues']))  # 保持顺序的去重
                
                # 合并行为示例，去重
                if current.get('behavior_examples'):
                    existing_behaviors = existing.get('behavior_examples', [])
                    existing['behavior_examples'] = list(dict.fromkeys(existing_behaviors + current['behavior_examples']))  # 保持顺序的去重
        
        # 转换回Character对象
        programmatic_merged = []
        for char_data in characters_dict.values():
            try:
                char_obj = Character(**char_data)
                programmatic_merged.append(char_obj)
            except Exception as e:
                from rich.console import Console
                console = Console()
                console.print(f"[yellow]转换角色数据失败: {e}[/yellow]")
                continue
        
        console.print(f"[cyan]程序化合并完成：{len(all_characters)} -> {len(programmatic_merged)}[/cyan]")
        
        return programmatic_merged

    def _merge_character_info(self, target: Character, source: Character):
        """合并两个角色的信息"""
        # 合并描述
        if source.description and not target.description:
            target.description = source.description
        elif source.description and target.description and source.description != target.description:
            target.description = f"{target.description} {source.description}".strip()
        
        # 合并性格
        if source.personality:
            target_personality_list = target.personality.split(", ") if target.personality else []
            source_personality_list = source.personality.split(", ") if source.personality else []
            merged_personality = list(set(target_personality_list + source_personality_list))
            target.personality = ", ".join(merged_personality)
        
        # 合并外貌
        if source.appearance and not target.appearance:
            target.appearance = source.appearance
        elif source.appearance and target.appearance and source.appearance != target.appearance:
            target.appearance = f"{target.appearance} {source.appearance}".strip()
        
        # 合并年龄（如果target没有而source有）
        if source.age and not target.age:
            target.age = source.age
        
        # 合并性别（如果target没有而source有）
        if source.gender and target.gender == Gender.UNKNOWN:
            target.gender = source.gender
        
        # 合并职业
        if source.occupation and not target.occupation:
            target.occupation = source.occupation
        
        # 合并角色定位（如果source更重要）
        if (source.role == CharacterRole.PROTAGONIST and target.role != CharacterRole.PROTAGONIST) or \
           (source.role == CharacterRole.SUPPORTING and target.role in [CharacterRole.MINOR, CharacterRole.ANTAGONIST]):
            target.role = source.role
        
        # 合并标签
        target.tags.extend(source.tags)
        target.tags = list(set(target.tags))  # 去重
        
        # 合并关系
        target.relationships.extend(source.relationships)
        
        # 合并新增的上下文字段
        # 合并原文上下文片段，去重
        target.source_contexts.extend(source.source_contexts)
        target.source_contexts = list(dict.fromkeys(target.source_contexts))  # 保持顺序的去重
        
        # 合并对话示例，去重
        target.example_dialogues.extend(source.example_dialogues)
        target.example_dialogues = list(dict.fromkeys(target.example_dialogues))  # 保持顺序的去重
        
        # 合并行为示例，去重
        target.behavior_examples.extend(source.behavior_examples)
        target.behavior_examples = list(dict.fromkeys(target.behavior_examples))  # 保持顺序的去重

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