"""
多维度质量评估系统
使用 AI 评估角色卡和世界书的深度质量
"""

from typing import Optional
from rich.console import Console

from novelforge.services.ai_service import AIService
from novelforge.core.models import Character, WorldSetting, Location
from novelforge.services.tavern_converter import (
    TavernCardV2 as TavernCardV3,
    CharacterQualityScore,
    WorldQualityScore,
)

console = Console()


class QualityEvaluator:
    """多维度质量评估器"""
    
    def __init__(self, ai_service: Optional[AIService] = None):
        self.ai = ai_service or AIService()
    
    async def evaluate_character(
        self, 
        character: Character,
        card: Optional[TavernCardV3] = None,
    ) -> CharacterQualityScore:
        """
        评估角色卡质量
        
        Args:
            character: 角色数据
            card: Tavern Card 格式数据（可选）
            
        Returns:
            多维度质量评分
        """
        prompt = self._build_character_evaluation_prompt(character, card)
        
        try:
            response = await self.ai.chat(
                prompt,
                system_prompt="你是一个专业的角色卡质量评估助手，擅长评估角色设定的完整性和质量。请以JSON格式输出结果。",
                temperature=0.3,
            )
            data = self.ai._parse_json(response, dict)
            return CharacterQualityScore(
                overall=data.get("overall", 0),
                dimensions=data.get("dimensions", {}),
                suggestions=data.get("suggestions", []),
            )
        except Exception as e:
            console.print(f"[red]角色评估失败: {e}[/red]")
            return CharacterQualityScore(overall=0, suggestions=[f"评估失败: {e}"])
    
    def _build_character_evaluation_prompt(
        self,
        character: Character,
        card: Optional[TavernCardV3] = None,
    ) -> str:
        """构建角色评估提示词"""
        char_data = character.model_dump()
        
        card_info = ""
        if card:
            card_info = f"""
【Tavern Card 数据】
{card.model_dump_json(indent=2)}
"""
        
        return f"""请评估以下角色卡的质量：

【角色数据】
{char_data}
{card_info}
【评估维度】
1. 完整性（completeness）：信息是否全面（姓名、外貌、性格、背景、能力、关系等）
2. 一致性（consistency）：各部分是否协调，是否有矛盾
3. 独特性（uniqueness）：是否有特色，是否避免刻板印象
4. 深度（depth）：是否有层次，是否有成长空间
5. 相关性（relevance）：是否符合故事背景和设定

【输出要求】
1. 给出每个维度的评分（0-100）
2. 计算总体评分（各维度平均）
3. 提供3-5条改进建议

【输出格式】
请以JSON格式输出：
{{
  "overall": 总体评分,
  "dimensions": {{
    "completeness": 完整性评分,
    "consistency": 一致性评分,
    "uniqueness": 独特性评分,
    "depth": 深度评分,
    "relevance": 相关性评分
  }},
  "suggestions": ["建议1", "建议2", "建议3"]
}}"""
    
    async def evaluate_world(
        self,
        world: WorldSetting,
    ) -> WorldQualityScore:
        """
        评估世界书质量
        
        Args:
            world: 世界设定数据
            
        Returns:
            多维度质量评分
        """
        prompt = self._build_world_evaluation_prompt(world)
        
        try:
            response = await self.ai.chat(
                prompt,
                system_prompt="你是一个专业的世界设定质量评估助手，擅长评估世界设定的完整性和质量。请以JSON格式输出结果。",
                temperature=0.3,
            )
            data = self.ai._parse_json(response, dict)
            return WorldQualityScore(
                overall=data.get("overall", 0),
                dimensions=data.get("dimensions", {}),
                suggestions=data.get("suggestions", []),
            )
        except Exception as e:
            console.print(f"[red]世界书评估失败: {e}[/red]")
            return WorldQualityScore(overall=0, suggestions=[f"评估失败: {e}"])
    
    def _build_world_evaluation_prompt(self, world: WorldSetting) -> str:
        """构建世界评估提示词"""
        world_data = world.model_dump()
        
        return f"""请评估以下世界设定的质量：

【世界设定数据】
{world_data}

【评估维度】
1. 完整性（completeness）：信息是否全面（地理、文化、政治、历史等）
2. 一致性（consistency）：各部分是否协调，是否有矛盾
3. 丰富度（richness）：是否有足够的细节和多样性
4. 连贯性（coherence）：各元素之间是否有合理的联系
5. 创造性（creativity）：是否有独特的创意和想象力

【输出要求】
1. 给出每个维度的评分（0-100）
2. 计算总体评分（各维度平均）
3. 提供3-5条改进建议

【输出格式】
请以JSON格式输出：
{{
  "overall": 总体评分,
  "dimensions": {{
    "completeness": 完整性评分,
    "consistency": 一致性评分,
    "richness": 丰富度评分,
    "coherence": 连贯性评分,
    "creativity": 创造性评分
  }},
  "suggestions": ["建议1", "建议2", "建议3"]
}}"""
    
    async def check_character_world_consistency(
        self,
        character: Character,
        world: WorldSetting,
    ) -> dict:
        """
        检查角色与世界设定的一致性
        
        Args:
            character: 角色数据
            world: 世界设定
            
        Returns:
            一致性检查结果
        """
        prompt = f"""请检查以下角色与世界设定的一致性：

【角色】
{character.model_dump_json(indent=2)}

【世界设定】
地点: {[loc.model_dump() for loc in world.locations[:5]]}
规则: {world.rules[:5]}
主题: {world.themes}

【检查要点】
1. 角色背景是否与世界历史一致
2. 角色能力是否符合世界规则
3. 角色所在地点是否存在于世界设定中
4. 角色文化背景是否与世界文化一致

【输出格式】
请以JSON格式输出：
{{
  "consistent": true/false,
  "score": 一致性评分(0-100),
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1", "建议2"]
}}"""

        try:
            response = await self.ai.chat(
                prompt,
                system_prompt="你是一个专业的一致性检查助手。请以JSON格式输出结果。",
                temperature=0.3,
            )
            return self.ai._parse_json(response, dict)
        except Exception as e:
            console.print(f"[red]一致性检查失败: {e}[/red]")
            return {"consistent": True, "score": 0, "issues": [], "suggestions": []}


def display_character_quality(score: CharacterQualityScore):
    """显示角色质量评分"""
    from rich.table import Table
    
    console.print(f"\n[bold cyan]角色质量评估[/bold cyan]")
    console.print(f"总体评分: [bold]{score.overall}[/bold]/100")
    
    table = Table(title="维度评分")
    table.add_column("维度", style="cyan")
    table.add_column("评分", style="green")
    
    dimension_names = {
        "completeness": "完整性",
        "consistency": "一致性",
        "uniqueness": "独特性",
        "depth": "深度",
        "relevance": "相关性",
    }
    
    for key, value in score.dimensions.items():
        name = dimension_names.get(key, key)
        pct = value / 100
        style = "green" if pct >= 0.7 else "yellow" if pct >= 0.5 else "red"
        table.add_row(name, f"[{style}]{value}[/{style}]")
    
    console.print(table)
    
    if score.suggestions:
        console.print("\n[bold]改进建议:[/bold]")
        for i, suggestion in enumerate(score.suggestions, 1):
            console.print(f"  {i}. {suggestion}")


def display_world_quality(score: WorldQualityScore):
    """显示世界书质量评分"""
    from rich.table import Table
    
    console.print(f"\n[bold cyan]世界书质量评估[/bold cyan]")
    console.print(f"总体评分: [bold]{score.overall}[/bold]/100")
    
    table = Table(title="维度评分")
    table.add_column("维度", style="cyan")
    table.add_column("评分", style="green")
    
    dimension_names = {
        "completeness": "完整性",
        "consistency": "一致性",
        "richness": "丰富度",
        "coherence": "连贯性",
        "creativity": "创造性",
    }
    
    for key, value in score.dimensions.items():
        name = dimension_names.get(key, key)
        pct = value / 100
        style = "green" if pct >= 0.7 else "yellow" if pct >= 0.5 else "red"
        table.add_row(name, f"[{style}]{value}[/{style}]")
    
    console.print(table)
    
    if score.suggestions:
        console.print("\n[bold]改进建议:[/bold]")
        for i, suggestion in enumerate(score.suggestions, 1):
            console.print(f"  {i}. {suggestion}")


# 便捷函数
def create_quality_evaluator(ai_service: Optional[AIService] = None) -> QualityEvaluator:
    """创建质量评估器实例"""
    return QualityEvaluator(ai_service)
