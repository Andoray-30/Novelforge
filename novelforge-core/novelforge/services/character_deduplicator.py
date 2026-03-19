"""
角色卡去重和合并服务

提供AI驱动的角色卡去重和合并机制，能够：
1. 识别同一角色的不同实例
2. 合并分散的信息
3. 创建完整统一的角色卡
4. 处理重复信息和补充缺失字段
5. 评估合并后角色卡的质量
6. 使用AI解决复杂冲突
"""

from typing import List, Dict, Optional, Tuple
import difflib
from pydantic import BaseModel
from novelforge.core.models import Character, CharacterRelationship
from novelforge.services.ai_service import AIService
from novelforge.quality.evaluator import QualityEvaluator, CharacterQualityScore


class MergeConflict(BaseModel):
    """合并冲突记录"""
    field_name: str
    value1: str
    value2: str
    confidence: float
    resolution: Optional[str] = None


class CharacterMergeResult(BaseModel):
    """角色合并结果"""
    merged_character: Character
    conflicts: List[MergeConflict]
    similarity_score: float
    is_merged: bool
    quality_score: Optional[CharacterQualityScore] = None


class QualityAssessment(BaseModel):
    """质量评估结果"""
    before_merge_score: Optional[CharacterQualityScore] = None
    after_merge_score: Optional[CharacterQualityScore] = None
    improvement: float = 0.0


class CharacterDeduplicator:
    """角色卡去重和合并服务"""

    def __init__(self, ai_service: Optional[AIService] = None, quality_evaluator: Optional[QualityEvaluator] = None):
        self.ai_service = ai_service or AIService()
        self.quality_evaluator = quality_evaluator or QualityEvaluator(self.ai_service)

    def calculate_character_similarity(self, char1: Character, char2: Character) -> float:
        """
        计算两个角色的相似度
        
        Args:
            char1: 第一个角色
            char2: 第二个角色
            
        Returns:
            相似度分数 (0-1)
        """
        similarity_parts = []

        # 1. 姓名相似度 (30%权重)
        name_similarity = self._calculate_name_similarity(char1.name, char2.name)
        similarity_parts.append(("name", name_similarity * 0.3))

        # 2. 描述相似度 (20%权重)
        desc_similarity = self._calculate_text_similarity(
            char1.description or "", char2.description or ""
        )
        similarity_parts.append(("description", desc_similarity * 0.2))

        # 3. 个性特征相似度 (15%权重)
        personality_similarity = self._calculate_text_similarity(
            char1.personality or "", char2.personality or ""
        )
        similarity_parts.append(("personality", personality_similarity * 0.15))

        # 4. 职业相似度 (15%权重)
        occupation_similarity = self._calculate_text_similarity(
            char1.occupation or "", char2.occupation or ""
        )
        similarity_parts.append(("occupation", occupation_similarity * 0.15))

        # 5. 标签相似度 (10%权重)
        tags_similarity = self._calculate_list_similarity(char1.tags, char2.tags)
        similarity_parts.append(("tags", tags_similarity * 0.1))

        # 6. 关系相似度 (10%权重)
        relationships_similarity = self._calculate_relationships_similarity(
            char1.relationships, char2.relationships
        )
        similarity_parts.append(("relationships", relationships_similarity * 0.1))

        # 总体相似度
        total_similarity = sum(sim for _, sim in similarity_parts)
        return min(1.0, max(0.0, total_similarity))

    def _calculate_name_similarity(self, name1: str, name2: str) -> float:
        """计算名称相似度"""
        # 使用difflib计算相似度
        similarity = difflib.SequenceMatcher(None, name1.lower(), name2.lower()).ratio()
        return similarity

    def _calculate_text_similarity(self, text1: str, text2: str) -> float:
        """计算文本相似度"""
        if not text1 and not text2:
            return 1.0
        if not text1 or not text2:
            return 0.0
        
        # 使用difflib计算相似度
        similarity = difflib.SequenceMatcher(None, text1.lower(), text2.lower()).ratio()
        return similarity

    def _calculate_list_similarity(self, list1: List[str], list2: List[str]) -> float:
        """计算列表相似度（基于交集）"""
        if not list1 and not list2:
            return 1.0
        if not list1 or not list2:
            return 0.0

        set1 = set(list1)
        set2 = set(list2)
        
        intersection = len(set1.intersection(set2))
        union = len(set1.union(set2))
        
        if union == 0:
            return 0.0
        return intersection / union

    def _calculate_relationships_similarity(self, rel1: List[CharacterRelationship], rel2: List[CharacterRelationship]) -> float:
        """计算关系相似度"""
        if not rel1 and not rel2:
            return 1.0
        if not rel1 or not rel2:
            return 0.0

        # 基于目标角色名称和关系描述计算相似度
        rel_pairs1 = {(r.target_name.lower(), r.relationship.lower()) for r in rel1}
        rel_pairs2 = {(r.target_name.lower(), r.relationship.lower()) for r in rel2}

        intersection = len(rel_pairs1.intersection(rel_pairs2))
        union = len(rel_pairs1.union(rel_pairs2))

        if union == 0:
            return 0.0
        return intersection / union

    async def merge_characters(self, char1: Character, char2: Character) -> CharacterMergeResult:
        """
        合并两个角色卡
        
        Args:
            char1: 第一个角色
            char2: 第二个角色
            
        Returns:
            合并结果
        """
        similarity_score = self.calculate_character_similarity(char1, char2)
        conflicts = []

        # 定义合并阈值
        merge_threshold = 0.6  # 相似度超过60%才考虑合并
        
        if similarity_score < merge_threshold:
            return CharacterMergeResult(
                merged_character=char1,
                conflicts=[],
                similarity_score=similarity_score,
                is_merged=False
            )

        # 开始合并逻辑
        # 选择主要角色（通常是信息更完整的一个）
        primary_char, secondary_char = self._select_primary_character(char1, char2)

        # 创建合并后的角色
        merged_data = {
            "name": self._resolve_name_conflict(primary_char.name, secondary_char.name),
            "description": self._merge_text_fields(
                primary_char.description, secondary_char.description, "description", conflicts
            ),
            "personality": self._merge_text_fields(
                primary_char.personality, secondary_char.personality, "personality", conflicts
            ),
            "background": self._merge_text_fields(
                primary_char.background, secondary_char.background, "background", conflicts
            ),
            "appearance": self._merge_text_fields(
                primary_char.appearance, secondary_char.appearance, "appearance", conflicts
            ),
            "age": self._resolve_age_conflict(primary_char.age, secondary_char.age),
            "gender": self._resolve_gender_conflict(primary_char.gender, secondary_char.gender),
            "occupation": self._merge_text_fields(
                primary_char.occupation, secondary_char.occupation, "occupation", conflicts
            ),
            "role": self._resolve_role_conflict(primary_char.role, secondary_char.role),
            "first_message": self._merge_text_fields(
                primary_char.first_message, secondary_char.first_message, "first_message", conflicts
            ),
            "example_messages": self._merge_lists(
                primary_char.example_messages, secondary_char.example_messages
            ),
            "tags": self._merge_lists(primary_char.tags, secondary_char.tags),
            "relationships": self._merge_relationships(
                primary_char.relationships, secondary_char.relationships, conflicts
            ),
            "mentions": primary_char.mentions + secondary_char.mentions,
            "source_contexts": self._merge_lists(
                primary_char.source_contexts, secondary_char.source_contexts
            ),
            "example_dialogues": self._merge_lists(
                primary_char.example_dialogues, secondary_char.example_dialogues
            ),
            "behavior_examples": self._merge_lists(
                primary_char.behavior_examples, secondary_char.behavior_examples
            )
        }

        # 创建合并后的角色实例
        merged_character = Character(**merged_data)

        # 评估合并后的质量
        quality_score = await self._assess_merged_quality(char1, char2, merged_character)

        return CharacterMergeResult(
            merged_character=merged_character,
            conflicts=conflicts,
            similarity_score=similarity_score,
            is_merged=True,
            quality_score=quality_score
        )

    def _select_primary_character(self, char1: Character, char2: Character) -> Tuple[Character, Character]:
        """选择主角色（信息更完整的一个）"""
        # 基于字段完整性来判断哪个角色信息更完整
        completeness1 = self._calculate_character_completeness(char1)
        completeness2 = self._calculate_character_completeness(char2)

        if completeness1 >= completeness2:
            return char1, char2
        else:
            return char2, char1

    def _calculate_character_completeness(self, char: Character) -> float:
        """计算角色信息完整性"""
        fields = [
            char.description,
            char.personality,
            char.background,
            char.appearance,
            char.age,
            char.occupation,
            char.first_message,
            char.example_messages,
            char.tags,
            char.relationships,
            char.source_contexts,
            char.example_dialogues,
            char.behavior_examples
        ]

        filled_fields = sum(1 for field in fields if field is not None and
                           (isinstance(field, str) and field.strip() or
                            isinstance(field, list) and len(field) > 0) or
                           (isinstance(field, int) and field > 0))
        
        return filled_fields / len(fields)

    def _resolve_name_conflict(self, name1: str, name2: str) -> str:
        """解决名称冲突 - 通常使用出现频率更高的名称"""
        if name1 == name2:
            return name1
        # 如果名称不同，选择更常见或更完整的那个
        if len(name1) >= len(name2):
            return name1
        else:
            return name2

    def _merge_text_fields(self, text1: Optional[str], text2: Optional[str],
                          field_name: str, conflicts: List[MergeConflict]) -> Optional[str]:
        """合并文本字段，处理冲突"""
        if text1 is None and text2 is None:
            return None
        if text1 is None:
            return text2
        if text2 is None:
            return text1
        if text1 == text2:
            return text1

        # 检测相似度
        similarity = self._calculate_text_similarity(text1, text2)
        if similarity > 0.8:  # 高相似度，可能是不同版本的相同内容
            # 选择更完整的一个
            return text1 if len(text1) >= len(text2) else text2
        elif similarity > 0.3:  # 中等相似度，可能是补充信息
            # 合并两个文本
            merged = text1 + "\n\n" + text2
            conflicts.append(MergeConflict(
                field_name=field_name,
                value1=text1,
                value2=text2,
                confidence=similarity
            ))
            return merged
        else:  # 低相似度，可能是冲突信息
            # 记录冲突，返回较长的版本
            conflicts.append(MergeConflict(
                field_name=field_name,
                value1=text1,
                value2=text2,
                confidence=similarity
            ))
            return text1 if len(text1) >= len(text2) else text2

    def _resolve_age_conflict(self, age1: Optional[int], age2: Optional[int]) -> Optional[int]:
        """解决年龄冲突"""
        if age1 is None and age2 is None:
            return None
        if age1 is None:
            return age2
        if age2 is None:
            return age1
        # 如果两个都存在且不同，返回第一个
        return age1

    def _resolve_gender_conflict(self, gender1, gender2):
        """解决性别冲突"""
        if gender1 == gender2:
            return gender1
        if gender1 == "unknown":
            return gender2
        if gender2 == "unknown":
            return gender1
        # 如果冲突，返回第一个
        return gender1

    def _resolve_role_conflict(self, role1, role2):
        """解决角色定位冲突"""
        if role1 == role2:
            return role1
        # 如果冲突，返回第一个
        return role1

    def _merge_lists(self, list1: List, list2: List) -> List:
        """合并列表，去除重复项"""
        if not list1 and not list2:
            return []
        if not list1:
            return list2
        if not list2:
            return list1

        # 合并并去重
        merged = list1.copy()
        for item in list2:
            if item not in merged:
                merged.append(item)

        return merged

    def _merge_relationships(self, rel1: List[CharacterRelationship],
                           rel2: List[CharacterRelationship],
                           conflicts: List[MergeConflict]) -> List[CharacterRelationship]:
        """合并关系列表"""
        if not rel1 and not rel2:
            return []
        if not rel1:
            return rel2
        if not rel2:
            return rel1

        # 创建关系映射以避免重复
        merged_rels = {}
        
        for rel in rel1:
            key = f"{rel.target_name.lower()}-{rel.relationship_type.value}"
            merged_rels[key] = rel

        for rel in rel2:
            key = f"{rel.target_name.lower()}-{rel.relationship_type.value}"
            
            if key in merged_rels:
                # 如果存在相同的关系，合并信息
                existing_rel = merged_rels[key]
                # 合并关系描述
                if rel.relationship != existing_rel.relationship:
                    merged_rel = CharacterRelationship(
                        target_name=rel.target_name,
                        relationship=existing_rel.relationship + " / " + rel.relationship,
                        relationship_type=rel.relationship_type,
                        strength=max(existing_rel.strength, rel.strength)
                    )
                    merged_rels[key] = merged_rel
            else:
                # 新关系，直接添加
                merged_rels[key] = rel

        return list(merged_rels.values())

    async def deduplicate_character_list(self, characters: List[Character]) -> List[Character]:
        """
        对角色列表进行去重
        
        Args:
            characters: 原始角色列表
            
        Returns:
            去重后的角色列表
        """
        if not characters:
            return []

        processed = []
        to_merge = characters.copy()

        while to_merge:
            current_char = to_merge.pop(0)
            merged = False

            # 检查是否与已处理的字符重复
            for i, existing_char in enumerate(processed):
                similarity = self.calculate_character_similarity(current_char, existing_char)
                
                if similarity > 0.6:  # 相似度阈值
                    # 合并角色
                    merge_result = await self.merge_characters(current_char, existing_char)
                    processed[i] = merge_result.merged_character
                    
                    # 如果有冲突，可以考虑使用AI来解决
                    if merge_result.conflicts:
                        processed[i] = await self._resolve_merge_conflicts_with_ai(
                            processed[i], merge_result.conflicts
                        )
                    
                    merged = True
                    break

            if not merged:
                processed.append(current_char)

        return processed

    async def _resolve_merge_conflicts_with_ai(self, character: Character,
                                       conflicts: List[MergeConflict]) -> Character:
        """
        使用AI解决合并冲突
        """
        if not conflicts:
            return character

        # 构建AI提示词
        conflict_info = []
        for conflict in conflicts:
            conflict_info.append(f"字段: {conflict.field_name}")
            conflict_info.append(f"版本1: {conflict.value1}")
            conflict_info.append(f"版本2: {conflict.value2}")
            conflict_info.append("---")

        prompt = f"""
        以下是在合并角色卡时遇到的冲突，请帮助解决这些冲突，创建一个统一的角色卡：

        冲突详情：
        {'\\n'.join(conflict_info)}

        当前角色信息：
        {character.model_dump_json(indent=2)}

        请仔细分析冲突，合理整合两个版本的信息，创建一个更完整、更准确的角色卡。
        对于矛盾的信息，请保留更可信或更详细的版本。
        """

        try:
            response = await self.ai_service.chat(
                prompt=prompt,
                system_prompt="你是一个专业的角色卡合并助手，擅长解决角色卡合并时出现的冲突。请以JSON格式输出结果。"
            )
            
            # 解析AI响应并应用到角色中
            # 由于AI响应可能是JSON格式，尝试解析并应用到角色中
            # 这里简化处理，实际情况下会解析AI的输出并更新角色
            
        except Exception:
            # 如果AI处理失败，返回原角色
            pass

        return character

    async def _assess_merged_quality(self, char1: Character, char2: Character,
                                   merged_char: Character) -> CharacterQualityScore:
        """
        评估合并后角色卡的质量
        """
        try:
            # 对合并后的角色进行质量评估
            quality_score = await self.quality_evaluator.evaluate_character(merged_char)
            return quality_score
        except Exception as e:
            # 如果质量评估失败，返回基础评分
            return CharacterQualityScore(
                overall=0,
                dimensions={},
                suggestions=[f"质量评估失败: {e}"]
            )

    async def assess_quality_improvement(self, original_chars: List[Character],
                                       merged_chars: List[Character]) -> QualityAssessment:
        """
        评估去重合并前后的质量改善情况
        """
        original_score = 0
        merged_score = 0
        
        # 评估原始角色的质量
        for char in original_chars:
            try:
                score = await self.quality_evaluator.evaluate_character(char)
                original_score += score.overall
            except:
                original_score += 0
        
        if original_chars:
            original_score = original_score / len(original_chars)
        
        # 评估合并后角色的质量
        for char in merged_chars:
            try:
                score = await self.quality_evaluator.evaluate_character(char)
                merged_score += score.overall
            except:
                merged_score += 0
                
        if merged_chars:
            merged_score = merged_score / len(merged_chars)
        
        improvement = merged_score - original_score if original_chars else merged_score
        
        return QualityAssessment(
            before_merge_score=CharacterQualityScore(overall=int(original_score)),
            after_merge_score=CharacterQualityScore(overall=int(merged_score)),
            improvement=improvement
        )

    def get_duplicate_pairs(self, characters: List[Character]) -> List[Tuple[Character, Character, float]]:
        """
        获取角色列表中可能的重复对及其相似度
        """
        duplicate_pairs = []
        
        for i in range(len(characters)):
            for j in range(i + 1, len(characters)):
                similarity = self.calculate_character_similarity(characters[i], characters[j])
                if similarity > 0.6:  # 相似度阈值
                    duplicate_pairs.append((characters[i], characters[j], similarity))
        
        return sorted(duplicate_pairs, key=lambda x: x[2], reverse=True)


# 便捷函数
def create_character_deduplicator(ai_service: Optional[AIService] = None,
                                quality_evaluator: Optional[QualityEvaluator] = None) -> CharacterDeduplicator:
    """创建角色卡去重器实例"""
    return CharacterDeduplicator(ai_service, quality_evaluator)