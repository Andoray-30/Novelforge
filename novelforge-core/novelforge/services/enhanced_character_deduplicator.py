"""
增强型角色卡去重和合并服务

扩展基础角色卡去重器，支持增强型角色卡的去重和合并，
特别针对角色灵魂特征进行优化处理。
"""

from typing import List, Dict, Optional, Tuple
import difflib
from pydantic import BaseModel

from novelforge.core.enhanced_character_model import (
    EnhancedCharacter, 
    BehaviorPattern, 
    CoreValue, 
    PsychologicalProfile,
    CharacterSoulAnalyzer
)
from novelforge.core.models import CharacterRelationship
from novelforge.services.ai_service import AIService
from novelforge.quality.evaluator import QualityEvaluator, CharacterQualityScore
from novelforge.services.character_deduplicator import CharacterDeduplicator, MergeConflict, CharacterMergeResult


class EnhancedMergeConflict(BaseModel):
    """增强型合并冲突记录"""
    field_name: str
    value1: str
    value2: str
    confidence: float
    resolution: Optional[str] = None
    conflict_type: str = "text"  # text, list, object等


class EnhancedCharacterMergeResult(BaseModel):
    """增强型角色合并结果"""
    merged_character: EnhancedCharacter
    conflicts: List[EnhancedMergeConflict]
    similarity_score: float
    is_merged: bool
    quality_score: Optional[CharacterQualityScore] = None
    soul_depth_improvement: float = 0.0


class EnhancedCharacterDeduplicator(CharacterDeduplicator):
    """增强型角色卡去重和合并服务"""
    
    def __init__(self, ai_service: Optional[AIService] = None, quality_evaluator: Optional[QualityEvaluator] = None):
        super().__init__(ai_service, quality_evaluator)
        
    def calculate_enhanced_character_similarity(self, char1: EnhancedCharacter, char2: EnhancedCharacter) -> float:
        """
        计算两个增强型角色的相似度
        
        Args:
            char1: 第一个增强型角色
            char2: 第二个增强型角色
            
        Returns:
            相似度分数 (0-1)
        """
        similarity_parts = []
        
        # 1. 基础字段相似度 (40% 权重)
        # 姓名相似度 (15%权重)
        name_similarity = self._calculate_name_similarity(char1.name, char2.name)
        similarity_parts.append(("name", name_similarity * 0.15))
        
        # 描述相似度 (8%权重)
        desc_similarity = self._calculate_text_similarity(
            char1.description or "", char2.description or ""
        )
        similarity_parts.append(("description", desc_similarity * 0.08))
        
        # 个性特征相似度 (8%权重)
        personality_similarity = self._calculate_text_similarity(
            char1.personality or "", char2.personality or ""
        )
        similarity_parts.append(("personality", personality_similarity * 0.08))
        
        # 职业相似度 (5%权重)
        occupation_similarity = self._calculate_text_similarity(
            char1.occupation or "", char2.occupation or ""
        )
        similarity_parts.append(("occupation", occupation_similarity * 0.05))
        
        # 标签相似度 (4%权重)
        tags_similarity = self._calculate_list_similarity(char1.tags, char2.tags)
        similarity_parts.append(("tags", tags_similarity * 0.04))
        
        # 2. 增强字段相似度 (60% 权重)
        # 情感倾向相似度 (5%权重)
        emotional_similarity = 1.0 if char1.emotional_tendency == char2.emotional_tendency else 0.0
        similarity_parts.append(("emotional_tendency", emotional_similarity * 0.05))
        
        # 核心价值观相似度 (15%权重)
        values_similarity = self._calculate_core_values_similarity(char1.core_values, char2.core_values)
        similarity_parts.append(("core_values", values_similarity * 0.15))
        
        # 行为模式相似度 (15%权重)
        behavior_similarity = self._calculate_behavior_patterns_similarity(char1.behavior_patterns, char2.behavior_patterns)
        similarity_parts.append(("behavior_patterns", behavior_similarity * 0.15))
        
        # 心理档案相似度 (10%权重)
        psych_similarity = self._calculate_psychological_profile_similarity(
            char1.psychological_profile, char2.psychological_profile
        )
        similarity_parts.append(("psychological_profile", psych_similarity * 0.10))
        
        # 动机相似度 (10%权重)
        motivation_similarity = self._calculate_motivation_similarity(char1, char2)
        similarity_parts.append(("motivation", motivation_similarity * 0.10))
        
        # 关系相似度 (5%权重)
        relationships_similarity = self._calculate_relationships_similarity(
            char1.relationships, char2.relationships
        )
        similarity_parts.append(("relationships", relationships_similarity * 0.05))
        
        # 总体相似度
        total_similarity = sum(sim for _, sim in similarity_parts)
        return min(1.0, max(0.0, total_similarity))
    
    def _calculate_core_values_similarity(self, values1: List[CoreValue], values2: List[CoreValue]) -> float:
        """计算核心价值观相似度"""
        if not values1 and not values2:
            return 1.0
        if not values1 or not values2:
            return 0.0
        
        # 计算价值观的交集
        values1_set = {cv.value.lower() for cv in values1}
        values2_set = {cv.value.lower() for cv in values2}
        
        intersection = len(values1_set.intersection(values2_set))
        union = len(values1_set.union(values2_set))
        
        if union == 0:
            return 0.0
        return intersection / union
    
    def _calculate_behavior_patterns_similarity(self, patterns1: List[BehaviorPattern], patterns2: List[BehaviorPattern]) -> float:
        """计算行为模式相似度"""
        if not patterns1 and not patterns2:
            return 1.0
        if not patterns1 or not patterns2:
            return 0.0
        
        # 计算行为模式的相似度
        total_similarity = 0
        matched_pairs = 0
        
        for p1 in patterns1:
            best_match_score = 0
            for p2 in patterns2:
                # 计算触发情境和响应的相似度
                trigger_sim = self._calculate_text_similarity(p1.trigger, p2.trigger)
                response_sim = self._calculate_text_similarity(p1.response, p2.response)
                avg_sim = (trigger_sim + response_sim) / 2
                if avg_sim > best_match_score:
                    best_match_score = avg_sim
            
            if best_match_score > 0.5:  # 只考虑相似度大于0.5的匹配
                total_similarity += best_match_score
                matched_pairs += 1
        
        if len(patterns1) == 0:
            return 0.0 if len(patterns2) > 0 else 1.0
        
        # 平均相似度
        avg_similarity = total_similarity / len(patterns1) if len(patterns1) > 0 else 0.0
        return avg_similarity
    
    def _calculate_psychological_profile_similarity(self, profile1: PsychologicalProfile, profile2: PsychologicalProfile) -> float:
        """计算心理档案相似度"""
        if not profile1 and not profile2:
            return 1.0
        if not profile1 or not profile2:
            return 0.0
        
        similarity_parts = []
        
        # 恐惧相似度
        fear_similarity = self._calculate_list_similarity(profile1.fears, profile2.fears)
        similarity_parts.append(fear_similarity * 0.2)
        
        # 渴望相似度
        desire_similarity = self._calculate_list_similarity(profile1.desires, profile2.desires)
        similarity_parts.append(desire_similarity * 0.2)
        
        # 不安全感相似度
        insecurity_similarity = self._calculate_list_similarity(profile1.insecurities, profile2.insecurities)
        similarity_parts.append(insecurity_similarity * 0.15)
        
        # 防御机制相似度
        defense_similarity = self._calculate_list_similarity(profile1.defense_mechanisms, profile2.defense_mechanisms)
        similarity_parts.append(defense_similarity * 0.15)
        
        # 情感触发点相似度
        trigger_similarity = self._calculate_list_similarity(profile1.emotional_triggers, profile2.emotional_triggers)
        similarity_parts.append(trigger_similarity * 0.15)
        
        # 应对策略相似度
        coping_similarity = self._calculate_list_similarity(profile1.coping_strategies, profile2.coping_strategies)
        similarity_parts.append(coping_similarity * 0.15)
        
        return sum(similarity_parts)
    
    def _calculate_motivation_similarity(self, char1: EnhancedCharacter, char2: EnhancedCharacter) -> float:
        """计算动机相似度"""
        # 主要动机相似度
        primary_similarity = 1.0 if char1.primary_motivation == char2.primary_motivation else 0.0
        
        # 次要动机相似度
        secondary1 = set(char1.secondary_motivations)
        secondary2 = set(char2.secondary_motivations)
        if not secondary1 and not secondary2:
            secondary_similarity = 1.0
        elif not secondary1 or not secondary2:
            secondary_similarity = 0.0
        else:
            intersection = len(secondary1.intersection(secondary2))
            union = len(secondary1.union(secondary2))
            secondary_similarity = intersection / union if union > 0 else 0.0
        
        # 综合动机相似度
        return (primary_similarity * 0.7 + secondary_similarity * 0.3)
    
    async def merge_enhanced_characters(self, char1: EnhancedCharacter, char2: EnhancedCharacter) -> EnhancedCharacterMergeResult:
        """
        合并两个增强型角色卡
        
        Args:
            char1: 第一个增强型角色
            char2: 第二个增强型角色
            
        Returns:
            增强型合并结果
        """
        similarity_score = self.calculate_enhanced_character_similarity(char1, char2)
        conflicts = []

        # 定义合并阈值
        merge_threshold = 0.5  # 对增强型角色使用略低的阈值，因为有更多维度
        
        if similarity_score < merge_threshold:
            return EnhancedCharacterMergeResult(
                merged_character=char1,
                conflicts=[],
                similarity_score=similarity_score,
                is_merged=False
            )

        # 开始合并逻辑
        # 选择主要角色（通常是信息更完整的一个）
        primary_char, secondary_char = self._select_enhanced_primary_character(char1, char2)

        # 创建合并后的角色
        merged_data = {
            "name": self._resolve_name_conflict(primary_char.name, secondary_char.name),
            "description": self._merge_text_fields_with_conflict_tracking(
                primary_char.description, secondary_char.description, "description", conflicts
            ),
            "personality": self._merge_text_fields_with_conflict_tracking(
                primary_char.personality, secondary_char.personality, "personality", conflicts
            ),
            "background": self._merge_text_fields_with_conflict_tracking(
                primary_char.background, secondary_char.background, "background", conflicts
            ),
            "appearance": self._merge_text_fields_with_conflict_tracking(
                primary_char.appearance, secondary_char.appearance, "appearance", conflicts
            ),
            "age": self._resolve_age_conflict(primary_char.age, secondary_char.age),
            "gender": self._resolve_gender_conflict(primary_char.gender, secondary_char.gender),
            "occupation": self._merge_text_fields_with_conflict_tracking(
                primary_char.occupation, secondary_char.occupation, "occupation", conflicts
            ),
            "role": self._resolve_role_conflict(primary_char.role, secondary_char.role),
            "first_message": self._merge_text_fields_with_conflict_tracking(
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
            ),
            # 增强字段
            "emotional_tendency": self._resolve_emotional_tendency_conflict(
                primary_char.emotional_tendency, secondary_char.emotional_tendency
            ),
            "psychological_profile": self._merge_psychological_profiles(
                primary_char.psychological_profile, secondary_char.psychological_profile
            ),
            "core_values": self._merge_core_values(
                primary_char.core_values, secondary_char.core_values, conflicts
            ),
            "behavior_patterns": self._merge_behavior_patterns(
                primary_char.behavior_patterns, secondary_char.behavior_patterns, conflicts
            ),
            "quirks": self._merge_lists(primary_char.quirks, secondary_char.quirks),
            "speech_patterns": self._merge_lists(primary_char.speech_patterns, secondary_char.speech_patterns),
            "primary_motivation": self._resolve_primary_motivation_conflict(
                primary_char.primary_motivation, secondary_char.primary_motivation, conflicts
            ),
            "secondary_motivations": self._merge_motivation_lists(
                primary_char.secondary_motivations, secondary_char.secondary_motivations
            ),
            "short_term_goals": self._merge_lists(
                primary_char.short_term_goals, secondary_char.short_term_goals
            ),
            "long_term_goals": self._merge_lists(
                primary_char.long_term_goals, secondary_char.long_term_goals
            ),
            "social_dynamics": self._merge_social_dynamics(
                primary_char.social_dynamics, secondary_char.social_dynamics
            ),
            "character_arc": self._merge_character_arcs(
                primary_char.character_arc, secondary_char.character_arc, conflicts
            ),
            "growth_trajectory": self._merge_lists(
                primary_char.growth_trajectory, secondary_char.growth_trajectory
            ),
            "defining_moments": self._merge_lists(
                primary_char.defining_moments, secondary_char.defining_moments
            ),
            "consistency_indicators": self._merge_consistency_indicators(
                primary_char.consistency_indicators, secondary_char.consistency_indicators
            )
        }

        # 创建合并后的增强型角色实例
        merged_character = EnhancedCharacter(**merged_data)
        
        # 计算灵魂深度评分前后的变化
        soul_analyzer = CharacterSoulAnalyzer()
        prev_soul_depth = (primary_char.soul_depth_score + secondary_char.soul_depth_score) / 2
        merged_character.soul_depth_score = soul_analyzer.analyze_soul_depth(merged_character)
        soul_depth_improvement = merged_character.soul_depth_score - prev_soul_depth

        # 评估合并后的质量
        quality_score = await self._assess_merged_quality(char1, char2, merged_character)

        return EnhancedCharacterMergeResult(
            merged_character=merged_character,
            conflicts=conflicts,
            similarity_score=similarity_score,
            is_merged=True,
            quality_score=quality_score,
            soul_depth_improvement=soul_depth_improvement
        )
    
    def _select_enhanced_primary_character(self, char1: EnhancedCharacter, char2: EnhancedCharacter) -> Tuple[EnhancedCharacter, EnhancedCharacter]:
        """选择主角色（信息更完整的一个）"""
        # 基于字段完整性来判断哪个角色信息更完整
        completeness1 = self._calculate_enhanced_character_completeness(char1)
        completeness2 = self._calculate_enhanced_character_completeness(char2)

        if completeness1 >= completeness2:
            return char1, char2
        else:
            return char2, char1
    
    def _calculate_enhanced_character_completeness(self, char: EnhancedCharacter) -> float:
        """计算增强型角色信息完整性"""
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
            char.behavior_examples,
            # 增强字段
            char.psychological_profile.fears,
            char.psychological_profile.desires,
            char.core_values,
            char.behavior_patterns,
            char.quirks,
            char.speech_patterns,
            char.short_term_goals,
            char.long_term_goals,
            char.defining_moments,
            char.growth_trajectory,
            char.character_arc,
        ]

        filled_fields = 0
        for field in fields:
            if field is not None and (
                (isinstance(field, str) and field.strip()) or
                (isinstance(field, (int, float)) and field != 0) or
                (isinstance(field, list) and len(field) > 0) or
                (isinstance(field, (dict, object)) and field is not None)
            ):
                filled_fields += 1
        
        return filled_fields / len(fields) if len(fields) > 0 else 0.0
    
    def _merge_text_fields_with_conflict_tracking(self, text1: Optional[str], text2: Optional[str],
                                        field_name: str, conflicts: List[EnhancedMergeConflict]) -> Optional[str]:
        """合并文本字段并记录冲突"""
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
            conflicts.append(EnhancedMergeConflict(
                field_name=field_name,
                value1=text1[:200] + "..." if len(text1) > 200 else text1,  # 限制长度
                value2=text2[:200] + "..." if len(text2) > 200 else text2,
                confidence=similarity,
                conflict_type="text"
            ))
            return merged
        else:  # 低相似度，可能是冲突信息
            # 记录冲突，返回较长的版本
            conflicts.append(EnhancedMergeConflict(
                field_name=field_name,
                value1=text1[:200] + "..." if len(text1) > 200 else text1,
                value2=text2[:200] + "..." if len(text2) > 200 else text2,
                confidence=similarity,
                conflict_type="text_conflict"
            ))
            return text1 if len(text1) >= len(text2) else text2
    
    def _resolve_emotional_tendency_conflict(self, tendency1, tendency2):
        """解决情感倾向冲突"""
        if tendency1 == tendency2:
            return tendency1
        # 如果冲突，保留第一个（通常是主角色的值）
        return tendency1
    
    def _merge_psychological_profiles(self, profile1: PsychologicalProfile, profile2: PsychologicalProfile) -> PsychologicalProfile:
        """合并心理档案"""
        return PsychologicalProfile(
            fears=list(set(profile1.fears + profile2.fears)),
            desires=list(set(profile1.desires + profile2.desires)),
            insecurities=list(set(profile1.insecurities + profile2.insecurities)),
            defense_mechanisms=list(set(profile1.defense_mechanisms + profile2.defense_mechanisms)),
            emotional_triggers=list(set(profile1.emotional_triggers + profile2.emotional_triggers)),
            coping_strategies=list(set(profile1.coping_strategies + profile2.coping_strategies))
        )
    
    def _merge_core_values(self, values1: List[CoreValue], values2: List[CoreValue], 
                          conflicts: List[EnhancedMergeConflict]) -> List[CoreValue]:
        """合并核心价值观"""
        if not values1 and not values2:
            return []
        if not values1:
            return values2
        if not values2:
            return values1
        
        # 创建价值观映射，处理重复
        merged_values = {}
        for cv in values1:
            merged_values[cv.value.lower()] = cv
        
        for cv in values2:
            key = cv.value.lower()
            if key in merged_values:
                # 如果已存在，取重要性更高的值，或合并其他信息
                existing_cv = merged_values[key]
                if cv.importance > existing_cv.importance:
                    # 保留重要性更高的值
                    merged_values[key] = cv
                else:
                    # 保留重要性，但合并来源和影响描述
                    merged_values[key] = CoreValue(
                        value=cv.value,
                        importance=existing_cv.importance,
                        origin=existing_cv.origin + "; " + cv.origin if existing_cv.origin and cv.origin else existing_cv.origin or cv.origin,
                        influence=existing_cv.influence + "; " + cv.influence if existing_cv.influence and cv.influence else existing_cv.influence or cv.influence
                    )
            else:
                merged_values[key] = cv
        
        return list(merged_values.values())
    
    def _merge_behavior_patterns(self, patterns1: List[BehaviorPattern], patterns2: List[BehaviorPattern], 
                                conflicts: List[EnhancedMergeConflict]) -> List[BehaviorPattern]:
        """合并行为模式"""
        if not patterns1 and not patterns2:
            return []
        if not patterns1:
            return patterns2
        if not patterns2:
            return patterns1
        
        # 创建行为模式映射，避免完全重复
        merged_patterns = {}
        for bp in patterns1:
            key = (bp.trigger.lower(), bp.response.lower())
            merged_patterns[key] = bp
        
        for bp in patterns2:
            key = (bp.trigger.lower(), bp.response.lower())
            if key in merged_patterns:
                # 如果触发情境和响应相同，但其他属性不同，尝试合并
                existing_bp = merged_patterns[key]
                if bp.frequency != existing_bp.frequency or bp.intensity != existing_bp.intensity:
                    # 记录潜在冲突
                    conflicts.append(EnhancedMergeConflict(
                        field_name="behavior_patterns",
                        value1=f"触发: {bp.trigger}, 响应: {bp.response}, 频率: {bp.frequency}, 强度: {bp.intensity}",
                        value2=f"触发: {existing_bp.trigger}, 响应: {existing_bp.response}, 频率: {existing_bp.frequency}, 强度: {existing_bp.intensity}",
                        confidence=0.5,
                        conflict_type="behavior_pattern_conflict"
                    ))
                    # 保留强度更高的模式
                    if bp.intensity >= existing_bp.intensity:
                        merged_patterns[key] = bp
            else:
                merged_patterns[key] = bp
        
        return list(merged_patterns.values())
    
    def _resolve_primary_motivation_conflict(self, mot1, mot2, conflicts: List[EnhancedMergeConflict]):
        """解决主要动机冲突"""
        if mot1 == mot2:
            return mot1
        # 记录冲突，返回第一个
        conflicts.append(EnhancedMergeConflict(
            field_name="primary_motivation",
            value1=str(mot1),
            value2=str(mot2),
            confidence=0.0,
            conflict_type="motivation_conflict"
        ))
        return mot1
    
    def _merge_motivation_lists(self, m1_list, m2_list) -> List:
        """合并动机列表"""
        if not m1_list and not m2_list:
            return []
        if not m1_list:
            return m2_list
        if not m2_list:
            return m1_list
        
        # 合并并去重
        merged = list(m1_list)
        for mot in m2_list:
            if mot not in merged:
                merged.append(mot)
        
        return merged
    
    def _merge_social_dynamics(self, dyn1, dyn2):
        """合并社交动态"""
        # 优先使用非默认值
        def non_default_or_default(val, default):
            return val if val != default else default
        
        return dyn1  # 使用第一个，因为社交动态比较主观，不宜简单合并
    
    def _merge_character_arcs(self, arc1, arc2, conflicts: List[EnhancedMergeConflict]):
        """合并角色弧线"""
        if arc1 is None and arc2 is None:
            return None
        if arc1 is None:
            return arc2
        if arc2 is None:
            return arc1
        
        # 如果两个弧线都存在，记录冲突但返回第一个
        conflicts.append(EnhancedMergeConflict(
            field_name="character_arc",
            value1=f"起始: {arc1.starting_point}, 结束: {arc1.ending_point}",
            value2=f"起始: {arc2.starting_point}, 结束: {arc2.ending_point}",
            confidence=0.0,
            conflict_type="character_arc_conflict"
        ))
        return arc1
    
    def _merge_consistency_indicators(self, ind1: Dict, ind2: Dict) -> Dict:
        """合并一致性指标"""
        if not ind1 and not ind2:
            return {}
        if not ind1:
            return ind2
        if not ind2:
            return ind1
        
        # 合并指标，对相同指标取平均值
        merged = {}
        all_keys = set(ind1.keys()) | set(ind2.keys())
        
        for key in all_keys:
            if key in ind1 and key in ind2:
                merged[key] = (ind1[key] + ind2[key]) / 2
            elif key in ind1:
                merged[key] = ind1[key]
            else:
                merged[key] = ind2[key]
        
        return merged
    
    async def deduplicate_enhanced_character_list(self, characters: List[EnhancedCharacter]) -> List[EnhancedCharacter]:
        """
        对增强型角色列表进行去重
        
        Args:
            characters: 原始增强型角色列表
            
        Returns:
            去重后的增强型角色列表
        """
        if not characters:
            return []

        processed = []
        to_merge = characters.copy()

        while to_merge:
            current_char = to_merge.pop(0)
            merged = False

            # 检查是否与已处理的角色重复
            for i, existing_char in enumerate(processed):
                similarity = self.calculate_enhanced_character_similarity(current_char, existing_char)
                
                if similarity > 0.5:  # 对增强型角色使用略低的阈值
                    # 合并角色
                    merge_result = await self.merge_enhanced_characters(current_char, existing_char)
                    processed[i] = merge_result.merged_character
                    
                    # 如果有冲突，可以考虑使用AI来解决
                    if merge_result.conflicts:
                        processed[i] = await self._resolve_enhanced_merge_conflicts_with_ai(
                            processed[i], merge_result.conflicts
                        )
                    
                    merged = True
                    break

            if not merged:
                processed.append(current_char)

        return processed
    
    async def _resolve_enhanced_merge_conflicts_with_ai(self, character: EnhancedCharacter,
                                               conflicts: List[EnhancedMergeConflict]) -> EnhancedCharacter:
        """
        使用AI解决增强型角色合并冲突
        """
        if not conflicts:
            return character

        # 构建AI提示词
        conflict_info = []
        for conflict in conflicts:
            conflict_info.append(f"字段: {conflict.field_name}")
            conflict_info.append(f"冲突类型: {conflict.conflict_type}")
            conflict_info.append(f"版本1: {conflict.value1}")
            conflict_info.append(f"版本2: {conflict.value2}")
            conflict_info.append("---")

        prompt = f"""
        以下是在合并增强型角色卡时遇到的冲突，请帮助解决这些冲突，创建一个统一的增强型角色卡：

        冲突详情：
        {'\\n'.join(conflict_info)}

        当前角色信息：
        {character.model_dump_json(indent=2)}

        请仔细分析冲突，合理整合两个版本的信息，创建一个更完整、更准确的增强型角色卡。
        对于矛盾的信息，请保留更可信或更详细的版本。
        特别注意保持角色心理特征和行为模式的一致性。
        """

        try:
            response = await self.ai_service.chat(
                prompt=prompt,
                system_prompt="你是一个专业的增强型角色卡合并助手，擅长解决角色卡合并时出现的冲突。请以JSON格式输出结果。"
            )
            
            # 这里可以解析AI响应并应用到角色中
            # 由于AI响应可能是JSON格式，尝试解析并应用到角色中
            # 这里简化处理，实际情况下会解析AI的输出并更新角色
            
        except Exception:
            # 如果AI处理失败，返回原角色
            pass

        return character


# 便捷函数
def create_enhanced_character_deduplicator(ai_service: Optional[AIService] = None,
                                 quality_evaluator: Optional[QualityEvaluator] = None) -> EnhancedCharacterDeduplicator:
    """创建增强型角色卡去重器实例"""
    return EnhancedCharacterDeduplicator(ai_service, quality_evaluator)