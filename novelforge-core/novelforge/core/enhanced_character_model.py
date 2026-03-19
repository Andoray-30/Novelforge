"""
增强型角色卡模型 - 捕捉角色灵魂的深度结构

该模型扩展了基础角色卡，增加了更深层次的性格、行为模式、人际关系和核心特征，
使AI能够更准确地把握角色的灵魂。
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum
from novelforge.core.models import Character, CharacterRelationship, Gender, CharacterRole, RelationshipType


class EmotionalTendency(str, Enum):
    """情感倾向"""
    STABLE = "stable"           # 稳定
    VOLATILE = "volatile"       # 易变
    OPTIMISTIC = "optimistic"   # 乐观
    PESSIMISTIC = "pessimistic" # 悲观
    NEUTRAL = "neutral"         # 中性


class MotivationType(str, Enum):
    """动机类型"""
    SURVIVAL = "survival"           # 生存
    POWER = "power"                 # 权力
    LOVE = "love"                   # 爱情
    REVENGE = "revenge"             # 复仇
    KNOWLEDGE = "knowledge"         # 知识
    ACCEPTANCE = "acceptance"       # 认可
    FREEDOM = "freedom"             # 自由
    JUSTICE = "justice"             # 正义
    PROTECTION = "protection"       # 保护
    ACHIEVEMENT = "achievement"     # 成就


class BehaviorPattern(BaseModel):
    """行为模式"""
    trigger: str = Field(..., description="触发行为的情境或条件")
    response: str = Field(..., description="角色的具体行为反应")
    frequency: str = Field(default="occasional", description="行为发生的频率（经常/偶尔/很少）")
    intensity: int = Field(default=5, ge=1, le=10, description="行为强度 1-10")
    context: str = Field(default="", description="行为发生的具体背景")
    modification_history: List[str] = Field(default_factory=list, description="行为模式变化历史")


class CoreValue(BaseModel):
    """核心价值观"""
    value: str = Field(..., description="核心价值观念")
    importance: int = Field(default=10, ge=1, le=10, description="重要性 1-10")
    origin: str = Field(default="", description="价值观的来源或形成背景")
    influence: str = Field(default="", description="该价值观对角色决策的影响")


class CharacterArc(BaseModel):
    """角色弧线/发展轨迹"""
    starting_point: str = Field(..., description="角色的初始状态")
    ending_point: str = Field(..., description="角色的最终状态")
    key_events: List[str] = Field(default_factory=list, description="影响角色发展的关键事件")
    transformation_aspects: List[str] = Field(default_factory=list, description="角色转变的方面")
    growth_theme: str = Field(default="", description="成长主题")


class PsychologicalProfile(BaseModel):
    """心理档案"""
    fears: List[str] = Field(default_factory=list, description="角色的恐惧")
    desires: List[str] = Field(default_factory=list, description="角色的渴望")
    insecurities: List[str] = Field(default_factory=list, description="角色的不安全感")
    defense_mechanisms: List[str] = Field(default_factory=list, description="防御机制")
    emotional_triggers: List[str] = Field(default_factory=list, description="情感触发点")
    coping_strategies: List[str] = Field(default_factory=list, description="应对策略")


class SocialDynamics(BaseModel):
    """社交动态"""
    social_status: str = Field(default="medium", description="社会地位")
    communication_style: str = Field(default="normal", description="沟通风格")
    authority_approach: str = Field(default="neutral", description="对权威的态度")
    conflict_resolution: str = Field(default="moderate", description="冲突解决方式")
    leadership_tendency: str = Field(default="none", description="领导倾向")
    group_role: str = Field(default="member", description="在群体中的角色")


class EnhancedCharacter(Character):
    """
    增强型角色卡 - 捕捉角色灵魂的深度结构
    
    扩展基础角色卡，增加对角色深度特征的建模，更好地捕捉角色的灵魂
    """
    
    # 深层性格特征
    emotional_tendency: EmotionalTendency = Field(
        default=EmotionalTendency.NEUTRAL, 
        description="情感倾向"
    )
    psychological_profile: PsychologicalProfile = Field(
        default_factory=PsychologicalProfile, 
        description="心理档案"
    )
    core_values: List[CoreValue] = Field(
        default_factory=list, 
        description="核心价值观列表"
    )
    
    # 行为模式
    behavior_patterns: List[BehaviorPattern] = Field(
        default_factory=list, 
        description="行为模式列表"
    )
    quirks: List[str] = Field(
        default_factory=list, 
        description="角色特点或习惯"
    )
    speech_patterns: List[str] = Field(
        default_factory=list, 
        description="说话模式"
    )
    
    # 核心动机与目标
    primary_motivation: MotivationType = Field(
        default=MotivationType.ACHIEVEMENT, 
        description="主要动机"
    )
    secondary_motivations: List[MotivationType] = Field(
        default_factory=list, 
        description="次要动机列表"
    )
    short_term_goals: List[str] = Field(
        default_factory=list, 
        description="短期目标"
    )
    long_term_goals: List[str] = Field(
        default_factory=list, 
        description="长期目标"
    )
    
    # 关系动态
    social_dynamics: SocialDynamics = Field(
        default_factory=SocialDynamics, 
        description="社交动态"
    )
    relationship_patterns: List[Dict[str, Any]] = Field(
        default_factory=list, 
        description="关系模式（不同关系类型的处理方式）"
    )
    
    # 角色发展
    character_arc: Optional[CharacterArc] = Field(
        None, 
        description="角色发展弧线"
    )
    growth_trajectory: List[str] = Field(
        default_factory=list, 
        description="成长轨迹"
    )
    defining_moments: List[str] = Field(
        default_factory=list, 
        description="定义性时刻"
    )
    
    # 角色一致性检查
    consistency_indicators: Dict[str, float] = Field(
        default_factory=dict, 
        description="一致性指标（用于检查角色行为一致性）"
    )
    
    # 角色灵魂评分
    soul_depth_score: float = Field(
        default=0.0, 
        ge=0.0, 
        le=10.0, 
        description="角色灵魂深度评分 0-10"
    )
    
    # 从基础角色转换的便捷方法
    @classmethod
    def from_character(cls, character: Character) -> 'EnhancedCharacter':
        """从基础角色转换为增强型角色"""
        enhanced_data = character.model_dump()
        enhanced_data.update({
            'behavior_patterns': [],
            'core_values': [],
            'psychological_profile': PsychologicalProfile(),
            'social_dynamics': SocialDynamics(),
            'short_term_goals': [],
            'long_term_goals': [],
            'defining_moments': [],
            'growth_trajectory': [],
            'relationship_patterns': [],
            'secondary_motivations': [],
            'quirks': [],
            'speech_patterns': [],
        })
        return cls(**enhanced_data)


class CharacterSoulAnalyzer:
    """
    角色灵魂分析器
    
    分析角色的核心特征，帮助构建更完整、更准确的增强型角色卡
    """
    
    @staticmethod
    def analyze_soul_depth(character: EnhancedCharacter) -> float:
        """
        分析角色灵魂深度
        
        Args:
            character: 增强型角色
            
        Returns:
            魂深度分数 (0-10)
        """
        score = 0.0
        max_score = 10.0
        
        # 评估各个维度的完整性
        if character.personality and len(character.personality) > 10:
            score += 1.0
        
        if len(character.core_values) > 0:
            score += 1.5
        
        if len(character.behavior_patterns) > 0:
            score += 1.5
            
        if character.psychological_profile.fears:
            score += 0.8
            
        if character.psychological_profile.desires:
            score += 0.8
            
        if character.primary_motivation:
            score += 1.0
            
        if len(character.short_term_goals) > 0 or len(character.long_term_goals) > 0:
            score += 1.0
            
        if len(character.defining_moments) > 0:
            score += 1.2
            
        if character.character_arc:
            score += 1.0
            
        # 限制最大分数为10
        return min(score, max_score)
    
    @staticmethod
    def identify_core_traits(character: EnhancedCharacter) -> List[str]:
        """
        识别角色的核心特质
        
        Args:
            character: 增强型角色
            
        Returns:
            核心特质列表
        """
        traits = []
        
        # 从心理档案中提取特质
        if character.psychological_profile.fears:
            traits.extend([f"对{fear}的恐惧" for fear in character.psychological_profile.fears[:3]])
        
        if character.psychological_profile.desires:
            traits.extend([f"渴望{desire}" for desire in character.psychological_profile.desires[:3]])
        
        # 从行为模式中提取特质
        for pattern in character.behavior_patterns[:3]:
            traits.append(f"在{pattern.trigger}时{pattern.response}")
        
        # 从核心价值观中提取特质
        for value in character.core_values[:3]:
            traits.append(f"重视{value.value}")
        
        # 从主要动机中提取特质
        traits.append(f"主要动机: {character.primary_motivation.value}")
        
        return list(set(traits))  # 去重
    
    @staticmethod
    def generate_roleplay_guidance(character: EnhancedCharacter) -> str:
        """
        生成角色扮演指导
        
        Args:
            character: 增强型角色
            
        Returns:
            角色扮演指导文本
        """
        guidance_parts = []
        
        # 基本信息
        guidance_parts.append(f"角色名称: {character.name}")
        guidance_parts.append(f"角色定位: {character.role.value}")
        
        # 核心动机
        guidance_parts.append(f"\n主要动机: {character.primary_motivation.value}")
        if character.secondary_motivations:
            guidance_parts.append(f"次要动机: {[mot.value for mot in character.secondary_motivations[:3]]}")
        
        # 心理特征
        if character.psychological_profile.fears:
            guidance_parts.append(f"主要恐惧: {', '.join(character.psychological_profile.fears[:3])}")
        
        if character.psychological_profile.desires:
            guidance_parts.append(f"主要渴望: {', '.join(character.psychological_profile.desires[:3])}")
        
        # 行为模式
        if character.behavior_patterns:
            guidance_parts.append("\n关键行为模式:")
            for i, pattern in enumerate(character.behavior_patterns[:3]):
                guidance_parts.append(f"  {i+1}. 在{pattern.trigger}时{pattern.response}")
        
        # 沟通风格
        guidance_parts.append(f"\n沟通风格: {character.social_dynamics.communication_style}")
        guidance_parts.append(f"情感倾向: {character.emotional_tendency.value}")
        
        # 目标
        if character.short_term_goals:
            guidance_parts.append(f"短期目标: {', '.join(character.short_term_goals[:3])}")
        
        if character.long_term_goals:
            guidance_parts.append(f"长期目标: {', '.join(character.long_term_goals[:3])}")
        
        return "\n".join(guidance_parts)


# 便捷函数
def create_enhanced_character_from_character(character: Character) -> EnhancedCharacter:
    """
    从基础角色创建增强型角色
    
    Args:
        character: 基础角色对象
        
    Returns:
        增强型角色对象
    """
    return EnhancedCharacter.from_character(character)


def analyze_character_soul(character: EnhancedCharacter) -> Dict[str, Any]:
    """
    分析角色灵魂特征
    
    Args:
        character: 增强型角色
        
    Returns:
        分析结果字典
    """
    analyzer = CharacterSoulAnalyzer()
    
    return {
        "soul_depth_score": analyzer.analyze_soul_depth(character),
        "core_traits": analyzer.identify_core_traits(character),
        "roleplay_guidance": analyzer.generate_roleplay_guidance(character),
        "complexity_score": len(character.core_values) + len(character.behavior_patterns) + len(character.defining_moments)
    }