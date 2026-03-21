"""
关系网络提取器模块
从multi_window_v5.py中提取的关系网络相关功能
"""

import asyncio
from typing import List, Dict, Any, Optional
from pathlib import Path
from novelforge.services.ai_service import AIService
from novelforge.extractors.character_extractor import SmartChunker, Chunk
from novelforge.core.models import NetworkEdge, RelationshipType, RelationshipStatus, CharacterRelationship
from novelforge.extractors.base_extractor import (
    RelationshipExtractorInterface, 
    ExtractionConfig
)


class RelationshipExtractor(RelationshipExtractorInterface):
    """关系网络提取器实现"""
    
    def __init__(self, config: ExtractionConfig, ai_service: Optional[AIService] = None):
        self.config = config
        self.ai_service = ai_service
    async def extract_relationships(self, text: str) -> List[NetworkEdge]:
        """
        从文本中提取角色关系
        
        Args:
            text: 输入文本
            
        Returns:
            List[NetworkEdge]: 提取的关系网络边列表
        """
        if not self.ai_service:
            raise ValueError("AI service is required for relationship extraction")

        # 创建智能分片器
        chunker = SmartChunker(
            chunk_size=self.config.chunk_size,
            chunk_overlap=self.config.chunk_overlap
        )

        # 分片文本
        chunks = chunker.chunk(text)
        if not chunks:
            return []

        # 提取所有片段中的关系网络
        all_relationships = []
        for chunk in chunks:
            relationships = await self._extract_relationships_from_chunk(chunk)
            all_relationships.extend(relationships)

        # 合并和去重
        if len(all_relationships) <= 1:
            return all_relationships

        merged_relationships = await self._hierarchical_merge_relationships(all_relationships)
        return merged_relationships
    
    def _extract_relationships_from_char_data(self, rel_data: Dict[str, Any]) -> List[CharacterRelationship]:
        """从角色数据中提取关系信息"""
        relationships = []
        
        if isinstance(rel_data, dict):
            for key, value in rel_data.items():
                if isinstance(value, dict):
                    relationship = CharacterRelationship(
                        target=key,
                        relationship_type=self._map_relationship_type(value.get('type', '')),
                        strength=value.get('strength', 5),
                        status=self._map_relationship_status(value.get('status', '')),
                        description=value.get('description', '')
                    )
                    relationships.append(relationship)
        
        return relationships
    
    def _map_relationship_type(self, type_str: str) -> RelationshipType:
        """映射关系类型"""
        if not type_str:
            return RelationshipType.OTHER
        
        type_lower = type_str.lower()
        if type_lower in ['family', '家庭', '亲属', '血缘']:
            return RelationshipType.FAMILY
        elif type_lower in ['friend', '朋友', '友谊', '友好']:
            return RelationshipType.FRIEND
        elif type_lower in ['enemy', '敌人', '敌对', '仇恨']:
            return RelationshipType.ENEMY
        elif type_lower in ['lover', '恋人', '爱情', '浪漫']:
            return RelationshipType.LOVER
        elif type_lower in ['mentor', '导师', '师傅', '老师']:
            return RelationshipType.MENTOR
        elif type_lower in ['rival', '对手', '竞争', '竞争者']:
            return RelationshipType.RIVAL
        elif type_lower in ['colleague', '同事', '同僚', '工作伙伴']:
            return RelationshipType.COLLEAGUE
        else:
            return RelationshipType.OTHER
    
    def _map_relationship_status(self, status_str: str) -> RelationshipStatus:
        """映射关系状态"""
        if not status_str:
            return RelationshipStatus.ACTIVE
        
        status_lower = status_str.lower()
        if status_lower in ['active', '活跃', '进行中', '当前']:
            return RelationshipStatus.ACTIVE
        elif status_lower in ['ended', '结束', '终止', '过去']:
            return RelationshipStatus.ENDED
        elif status_lower in ['dormant', '休眠', '暂停', '潜在']:
            return RelationshipStatus.DORMANT
        elif status_lower in ['evolving', '演变', '发展', '变化中']:
            return RelationshipStatus.EVOLVING
        else:
            return RelationshipStatus.UNKNOWN
    
    async def _hierarchical_merge_relationships(self, all_relationships: List[NetworkEdge]) -> List[NetworkEdge]:
        """分层合并关系网络"""
        # 这里将实现分层合并逻辑
        # 目前返回原列表，后续会从原文件迁移具体实现
        return all_relationships


    async def _extract_relationships_from_chunk(self, chunk: 'Chunk') -> List[NetworkEdge]:
        """从单个片段中提取角色关系网络"""
        prompt = f"""你是一个专业的小说分析师。请仔细分析以下文本片段，提取角色之间的关系。", "", "文本片段：", "{chunk.content}", "", "## 任务说明", "- 识别文本中角色之间的关系", "- 区分不同类型的关系（家庭、友情、爱情、敌对等）", "- 评估关系的强度（1-10分）和状态", "- 如果提供了已知角色列表，请重点关注这些角色间的关系", "", "## 输出格式", "请以JSON格式输出，结构如下：", "{{", "    \"relationships\": [", "        {{", "            \"source\": \"源角色名\",", "            \"target\": \"目标角色名\",", "            \"relationship_type\": \"关系类型（family, friend, romantic, enemy等）\",", "            \"description\": \"关系描述\",", "            \"strength\": \"关系强度（1-10的整数）\",", "            \"evidence\": \"原文中的证据文本\",", "            \"confidence\": \"置信度（0-1）\",", "            \"is_mutual\": \"是否相互的（true/false）\",", "            \"status\": \"关系状态（active, inactive, conflict等）\"", "        }}", "    ]", "}}", "", "请注意：只输出JSON，不要添加其他解释文字。"""

        for attempt in range(self.config.max_retries):
            try:
                response = await self.ai_service.chat(prompt, max_tokens=4000, timeout=self.config.timeout)
                data = self.ai_service._parse_json(response, dict)

                relationships = []
                rel_list = data.get("relationships", []) if isinstance(data, dict) else data

                for rel_data in rel_list:
                    if not isinstance(rel_data, dict):
                        continue

                    # 解析关系类型
                    type_data = rel_data.get("relationship_type", "other")
                    relationship_type = self._map_relationship_type(type_data)

                    # 解析关系状态
                    status_data = rel_data.get("status", "active")
                    relationship_status = self._map_relationship_status(status_data)

                    # 解析置信度
                    confidence_data = rel_data.get("confidence", 0.5)
                    try:
                        confidence = float(confidence_data)
                    except (ValueError, TypeError):
                        confidence = 0.5

                    # 解析是否相互
                    is_mutual_data = rel_data.get("is_mutual", True)
                    is_mutual = bool(is_mutual_data)

                    # 创建关系边对象
                    relationship = NetworkEdge(
                        source=str(rel_data.get("source", "Unknown")),
                        target=str(rel_data.get("target", "Unknown")),
                        relationship_type=relationship_type,
                        description=str(rel_data.get("description", "")),
                        strength=int(rel_data.get("strength", 5)),
                        status=relationship_status,
                        evidence=[str(rel_data.get("evidence", ""))] if rel_data.get("evidence") else [],
                        start_event=str(rel_data.get("start_event", "")) if rel_data.get("start_event") else None,
                        end_event=str(rel_data.get("end_event", "")) if rel_data.get("end_event") else None,
                        evolution=rel_data.get("evolution", []),
                        chapter_references=rel_data.get("chapter_references", [])
                    )
                    relationships.append(relationship)

                return relationships

            except Exception as e:
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay)
                else:
                    print(f"关系网络提取失败: {e}")
                    return []