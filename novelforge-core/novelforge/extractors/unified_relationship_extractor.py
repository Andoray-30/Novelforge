"""
统一关系网络提取器 - 批量提取，充分利用大模型长上下文
"""
import asyncio
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from novelforge.services.ai_service import AIService
from novelforge.extractors.base_extractor import (
    RelationshipExtractorInterface, ExtractionConfig, SmartChunker, Chunk
)
from novelforge.core.models import NetworkEdge, RelationshipType, RelationshipStatus


@dataclass
class RelationshipGroup:
    """关系分组信息"""
    indices: List[int]
    canonical_key: str  # source->target


class UnifiedRelationshipExtractor(RelationshipExtractorInterface):
    """统一关系网络提取器"""

    MAX_CHUNKS_PER_BATCH = 5
    MAX_RELS_PER_BATCH = 30

    def __init__(self, config: ExtractionConfig, ai_service: Optional[AIService] = None):
        self.config = config
        self.ai_service = ai_service
        self.chunker = SmartChunker(
            chunk_size=config.chunk_size,
            chunk_overlap=config.chunk_overlap
        )

    async def extract_relationships(self, text: str) -> List[NetworkEdge]:
        """从文本中提取角色关系"""
        if not self.ai_service:
            raise ValueError("AI service is required for relationship extraction")

        chunks = self.chunker.chunk(text)
        if not chunks:
            return []

        all_relationships = []
        for i in range(0, len(chunks), self.MAX_CHUNKS_PER_BATCH):
            batch_chunks = chunks[i:i + self.MAX_CHUNKS_PER_BATCH]
            relationships = await self._batch_extract_from_chunks(batch_chunks)
            all_relationships.extend(relationships)

        return await self._smart_merge_relationships(all_relationships)

    async def _batch_extract_from_chunks(self, chunks: List[Chunk]) -> List[NetworkEdge]:
        """批量从多个片段中提取关系"""
        combined_content = "\n\n=== 文本片段分隔 ===\n\n".join([
            f"[片段 {j+1}]\n{chunk.content}"
            for j, chunk in enumerate(chunks)
        ])

        return await self._extract_relationships(combined_content)

    async def _extract_relationships(self, combined_text: str) -> List[NetworkEdge]:
        """提取关系网络"""
        prompt = f"""你是一个专业的小说关系分析师。请仔细分析以下文本，提取所有角色之间的关系。

文本内容：
{combined_text}

## 任务
识别文本中角色之间的关系，深入挖掘以下维度：
- 核心关系类型（家庭、友情、爱情、敌对、师徒、竞争、利用等）
- 关系状态（如"表面和谐实则算计", "生死之交", "宿命之敌"）
- 利益冲突（详细描述双方是否存在利益、理念或地位的冲突）
- 情感演变（描述该关系在当前文本片段中的变化，是升温、恶化还是维持现状）
- 隐秘关系（识别是否存在不为人知的秘密关系，如"私生子", "卧底"）

## 输出格式
请以JSON格式输出：
{{
    "relationships": [
        {{
            "source": "源角色名",
            "target": "目标角色名",
            "relationship_type": "关系类型（family/friend/lover/enemy/mentor/rival/colleague/other）",
            "description": "关系详细描述，重点描述情感张力和互动细节",
            "conflict": "是否存在利益、理念或核心目标的冲突，如有请详细说明",
            "evolution": "关系在此片段中的具体演变过程",
            "is_secret": false, // 是否为隐秘关系
            "strength": 8, // 1-10
            "evidence": ["原文证据1", "原文证据2"],
            "status": "关系状态（active/ended/dormant/evolving）"
        }}
    ]
}}

只输出JSON，不要添加其他文字。"""

        for attempt in range(self.config.max_retries):
            try:
                response = await self.ai_service.chat(
                    prompt,
                    max_tokens=6000,
                    timeout=self.config.timeout
                )
                return self._parse_relationships_response(response)
            except Exception as e:
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay)
                else:
                    print(f"关系提取失败: {e}")
                    return []
        return []

    def _parse_relationships_response(self, response: str) -> List[NetworkEdge]:
        """解析关系响应"""
        try:
            data = self.ai_service._parse_json(response, dict)
            rel_list = data.get("relationships", []) if isinstance(data, dict) else data

            relationships = []
            for rel_data in rel_list:
                if not isinstance(rel_data, dict):
                    continue

                relationship = self._create_relationship_from_dict(rel_data)
                relationships.append(relationship)

            return relationships
        except Exception as e:
            print(f"解析关系响应失败: {e}")
            return []

    def _create_relationship_from_dict(self, rel_data: dict) -> NetworkEdge:
        """从字典创建NetworkEdge对象"""
        relationship_type = self._map_relationship_type(rel_data.get("relationship_type", "other"))
        status = self._map_relationship_status(rel_data.get("status", "active"))

        evidence = rel_data.get("evidence", [])
        if isinstance(evidence, str):
            evidence = [evidence] if evidence else []
        elif not isinstance(evidence, list):
            evidence = []

        return NetworkEdge(
            source=str(rel_data.get("source", "Unknown")),
            target=str(rel_data.get("target", "Unknown")),
            relationship_type=relationship_type,
            description=str(rel_data.get("description", "")),
            strength=int(rel_data.get("strength", 5)),
            status=status,
            evidence=evidence,
            start_event=str(rel_data.get("start_event", "")) if rel_data.get("start_event") else None,
            end_event=str(rel_data.get("end_event", "")) if rel_data.get("end_event") else None,
            evolution=rel_data.get("evolution", []),
            chapter_references=rel_data.get("chapter_references", [])
        )

    def _map_relationship_type(self, type_str: str) -> RelationshipType:
        """映射关系类型"""
        if not type_str:
            return RelationshipType.OTHER

        type_lower = type_str.lower()
        type_map = {
            'family': RelationshipType.FAMILY, '家庭': RelationshipType.FAMILY, '亲属': RelationshipType.FAMILY,
            'friend': RelationshipType.FRIEND, '朋友': RelationshipType.FRIEND, '友情': RelationshipType.FRIEND,
            'enemy': RelationshipType.ENEMY, '敌人': RelationshipType.ENEMY, '敌对': RelationshipType.ENEMY,
            'lover': RelationshipType.LOVER, '恋人': RelationshipType.LOVER, '爱情': RelationshipType.LOVER,
            'mentor': RelationshipType.MENTOR, '导师': RelationshipType.MENTOR, '师傅': RelationshipType.MENTOR,
            'rival': RelationshipType.RIVAL, '对手': RelationshipType.RIVAL, '竞争': RelationshipType.RIVAL,
            'colleague': RelationshipType.COLLEAGUE, '同事': RelationshipType.COLLEAGUE, '同僚': RelationshipType.COLLEAGUE,
        }
        return type_map.get(type_lower, RelationshipType.OTHER)

    def _map_relationship_status(self, status_str: str) -> RelationshipStatus:
        """映射关系状态"""
        if not status_str:
            return RelationshipStatus.ACTIVE

        status_lower = status_str.lower()
        status_map = {
            'active': RelationshipStatus.ACTIVE, '活跃': RelationshipStatus.ACTIVE, '进行中': RelationshipStatus.ACTIVE,
            'ended': RelationshipStatus.ENDED, '结束': RelationshipStatus.ENDED, '终止': RelationshipStatus.ENDED,
            'dormant': RelationshipStatus.DORMANT, '休眠': RelationshipStatus.DORMANT, '暂停': RelationshipStatus.DORMANT,
            'evolving': RelationshipStatus.EVOLVING, '演变': RelationshipStatus.EVOLVING, '变化中': RelationshipStatus.EVOLVING,
        }
        return status_map.get(status_lower, RelationshipStatus.UNKNOWN)

    async def _smart_merge_relationships(self, all_relationships: List[NetworkEdge]) -> List[NetworkEdge]:
        """智能合并关系"""
        # 按 source->target 分组
        rel_map: Dict[str, List[NetworkEdge]] = {}

        for rel in all_relationships:
            key = f"{rel.source}->{rel.target}"
            if key not in rel_map:
                rel_map[key] = []
            rel_map[key].append(rel)

        # 合并每组关系
        merged = []
        for key, rels in rel_map.items():
            if len(rels) == 1:
                merged.append(rels[0])
            else:
                merged_rel = self._merge_relationship_group(rels)
                merged.append(merged_rel)

        return merged

    def _merge_relationship_group(self, relationships: List[NetworkEdge]) -> NetworkEdge:
        """合并一组关系"""
        base = relationships[0]

        for other in relationships[1:]:
            # 合并描述（取最长的）
            if len(other.description) > len(base.description):
                base.description = other.description

            # 合并证据（去重）
            base.evidence = list(set(base.evidence + other.evidence))

            # 取最高强度
            if other.strength > base.strength:
                base.strength = other.strength

            # 合并进化记录
            if other.evolution:
                base.evolution = list(set(base.evolution + other.evolution))

            # 合并章节引用
            if other.chapter_references:
                base.chapter_references = list(set(base.chapter_references + other.chapter_references))

        return base
