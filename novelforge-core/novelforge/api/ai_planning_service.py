"""
AI规划服务集成模块
将FastAPI端点与现有的AI服务集成
"""

import json
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime

from ..services.ai_service import AIService
from .types import StoryOutlineParams, StoryOutline, CharacterDesign, WorldSetting


class AIPlanningService:
    """AI规划服务类 - 集成现有的AI服务"""
    
    def __init__(self, ai_service: AIService):
        self.ai_service = ai_service
    
    async def generate_story_outline(self, params: StoryOutlineParams) -> StoryOutline:
        """生成故事架构"""
        try:
            # 构建提示词
            prompt = self._build_story_outline_prompt(params)
            
            # 调用AI服务 - 使用 extract 方法进行结构化提取
            response = await self.ai_service.extract(
                prompt=prompt,
                response_type=StoryOutline,
                system_prompt="你是一个专业的小说创作助手，擅长构建引人入胜的故事架构。"
            )
            
            return response
            
        except Exception as e:
            raise Exception(f"故事架构生成失败: {str(e)}")
    
    async def design_characters(self, context: str, roles: List[str]) -> List[CharacterDesign]:
        """设计角色"""
        try:
            # 构建提示词
            prompt = self._build_character_design_prompt(context, roles)
            
            # 调用AI服务 - 使用 chat 方法获取响应
            response = await self.ai_service.chat(
                prompt=prompt,
                system_prompt="你是一个专业的角色设计师，擅长创造鲜明独特的角色。"
            )
            
            # 解析响应
            characters_data = self._parse_character_designs(response)
            
            # 转换为CharacterDesign对象
            characters = []
            for char_data in characters_data:
                character = CharacterDesign(**char_data)
                characters.append(character)
            
            return characters
            
        except Exception as e:
            raise Exception(f"角色设计失败: {str(e)}")
    
    async def build_world_setting(self, outline_data: Dict[str, Any]) -> WorldSetting:
        """构建世界设定"""
        try:
            # 构建提示词
            prompt = self._build_world_building_prompt(outline_data)
            
            # 调用AI服务 - 使用 extract 方法进行结构化提取
            response = await self.ai_service.extract(
                prompt=prompt,
                response_type=WorldSetting,
                system_prompt="你是一个专业的世界观构建师，擅长创造丰富详细的世界设定。"
            )
            
            return response
            
        except Exception as e:
            raise Exception(f"世界构建失败: {str(e)}")
    
    def _build_story_outline_prompt(self, params: StoryOutlineParams) -> str:
        """构建故事架构提示词"""
        constraints_text = "\n".join([f"- {constraint}" for constraint in (params.constraints or [])])
        
        return f"""
你是一个专业的小说创作助手。请根据以下要求生成一个完整的故事架构：

小说类型：{params.novel_type.value}
主题：{params.theme}
预期长度：{params.length.value}
目标受众：{params.target_audience.value}

{f'创作约束条件：\n{constraints_text}' if params.constraints else ''}

请提供详细的JSON格式响应，包含以下结构：
{{
  "title": "故事标题",
  "genre": "{params.novel_type.value}",
  "theme": "{params.theme}",
  "plotPoints": [
    {{
      "title": "情节点标题",
      "description": "详细描述",
      "position": "beginning|development|climax|ending",
      "importance": "low|medium|high|critical"
    }}
  ],
  "characterRoles": [
    {{
      "role": "protagonist|antagonist|supporting|mentor|love_interest",
      "name": "角色名称",
      "description": "角色描述",
      "keyTraits": ["特质1", "特质2"],
      "background": "背景故事",
      "relationships": ["关系描述"]
    }}
  ],
  "worldElements": ["世界观要素1", "世界观要素2"],
  "tone": "故事基调",
  "targetAudience": "{params.target_audience.value}"
}}

要求：
1. 故事结构逻辑清晰，起承转合完整
2. 角色设定鲜明有特色，避免刻板印象
3. 世界观设定完整，与主题相符
4. 适合{params.length.value}长度的小说创作
5. 情节要有张力和吸引力
"""
    
    def _build_character_design_prompt(self, context: str, roles: List[str]) -> str:
        """构建角色设计提示词"""
        roles_text = "\n".join([f"- {role}" for role in roles])
        
        return f"""
基于以下故事背景设计角色：

故事背景：{context}
角色职责：
{roles_text}

请为每个职责设计一个完整的角色档案，提供JSON格式响应：
{{
  "characters": [
    {{
      "name": "角色名称",
      "role": "角色职责",
      "description": "详细描述",
      "personality": "性格特征",
      "background": "背景故事",
      "keyTraits": ["特质1", "特质2"],
      "relationships": {{
        "其他角色名称": "关系描述"
      }},
      "arc": {{
        "current_belief": "当前信念",
        "target_truth": "目标真理",
        "transformation_steps": [
          {{
            "stage": "阶段名称",
            "description": "描述",
            "key_events": ["关键事件"]
          }}
        ],
        "setbacks": []
      }}
    }}
  ]
}}

要求：
1. 角色设计要符合故事背景
2. 每个角色都要有鲜明合理的性格特征
3. 角色之间要有合理的关系网络
4. 每个角色都要有完整的成长弧线
5. 避免刻板印象，追求原创性
"""
    
    def _build_world_building_prompt(self, outline_data: Dict[str, Any]) -> str:
        """构建世界设定提示词"""
        title = outline_data.get("title", "未命名故事")
        genre = outline_data.get("genre", "unknown")
        theme = outline_data.get("theme", "")
        plot_points = outline_data.get("plotPoints", [])
        character_roles = outline_data.get("characterRoles", [])
        world_elements = outline_data.get("worldElements", [])
        
        plot_titles = [p.get("title", "") for p in plot_points]
        character_names = [c.get("name", "") for c in character_roles]
        
        return f"""
基于以下故事结构构建详细的世界观：

故事标题：{title}
类型：{genre}
主题：{theme}
情节点：{', '.join(plot_titles)}
角色：{', '.join(character_names)}
世界观要素：{', '.join(world_elements)}

请构建一个完整的世界观，包含以下元素，提供JSON格式响应：
{{
  "name": "{title}的世界",
  "description": "世界观概述",
  "geography": "地理环境描述",
  "social_structure": "社会结构",
  "culture": "文化习俗",
  "technology_magic": "科技/魔法系统",
  "history": "历史背景",
  "core_conflicts": ["核心冲突1", "核心冲突2"],
  "locations": [
    {{
      "name": "地点名称",
      "type": "地点类型",
      "description": "详细描述",
      "geography": "地理特征",
      "culture": "文化特征",
      "history": "历史背景",
      "notable_features": ["特征1", "特征2"]
    }}
  ],
  "cultures": [
    {{
      "name": "文化名称",
      "description": "描述",
      "beliefs": ["信仰1", "信仰2"],
      "values": ["价值观1", "价值观2"],
      "customs": ["习俗1", "习俗2"]
    }}
  ],
  "rules": [
    {{
      "name": "规则名称",
      "description": "规则描述",
      "category": "规则类别",
      "importance": "low|medium|high|critical"
    }}
  ]
}}

要求：
1. 世界观要与故事主题相符
2. 设定要丰富详细，有逻辑一致性
3. 为故事发展提供坚实的基础
4. 包含地理、文化、历史、规则等多个维度
5. 要有核心冲突，推动故事发展
"""
    
    def _parse_character_designs(self, response_text: str) -> List[Dict[str, Any]]:
        """解析角色设计响应"""
        try:
            # 尝试解析JSON响应
            if response_text.strip().startswith('{'):
                data = json.loads(response_text)
                if "characters" in data:
                    return data["characters"]
            
            # 如果不是标准JSON格式，尝试提取角色信息
            characters = []
            # 这里可以添加更复杂的解析逻辑
            return characters
            
        except json.JSONDecodeError:
            # JSON解析失败，返回空列表或尝试其他解析方式
            return []
        except Exception as e:
            raise Exception(f"解析角色设计响应失败: {str(e)}")


# 全局AI规划服务实例
_ai_planning_service: Optional[AIPlanningService] = None


def get_ai_planning_service(ai_service: AIService) -> AIPlanningService:
    """获取AI规划服务实例"""
    return AIPlanningService(ai_service)
