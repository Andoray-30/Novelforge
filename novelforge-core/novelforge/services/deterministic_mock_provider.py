"""Deterministic local responses used by browser acceptance tests.

This module intentionally contains no HTTP or provider client integration. It
keeps the scripted acceptance data out of :mod:`ai_service` while preserving a
single, explicit switch for local-only execution.
"""

from __future__ import annotations

import json
import re
from typing import Any


class DeterministicMockProvider:
    """Return stable, synthetic responses without contacting an upstream model."""

    _CHAPTER_SCHEMA_MARKERS = (
        '"chapter_characters"',
        '"chapter_interactions"',
        '"chapter_events"',
        '"chapter_world_facts"',
    )

    def chat(self, prompt: str, *, system_prompt: str | None = None) -> str:
        del system_prompt
        if all(marker in prompt for marker in self._CHAPTER_SCHEMA_MARKERS):
            return json.dumps(
                self._chapter_index_payload(self._chapter_order(prompt)),
                ensure_ascii=False,
            )
        return "Mock response: deterministic local provider is enabled."

    @staticmethod
    def _chapter_order(prompt: str) -> int:
        match = re.search(r"顺序\s*[：:]\s*(\d+)", prompt)
        if match is None:
            return 1
        return max(1, int(match.group(1)))

    @classmethod
    def _chapter_index_payload(cls, chapter_order: int) -> dict[str, Any]:
        scene_index = min(chapter_order, 3) - 1
        scene = (
            {
                "title": "浮核骤降警报",
                "description": "云穹城浮核站突发能量骤降，岚舟召集维修组排查核心失稳。",
                "emotional_turn": "例行值守转为紧迫救援",
                "foreshadowing": ["稳压环留下不符合常规磨损的裂纹"],
                "imagery": ["警报红光掠过悬空栈桥"],
                "evidence": ["浮核骤降警报响彻云穹城"],
            },
            {
                "title": "进入稳压环",
                "description": "岚舟与砾星进入稳压环检修，弦月在控制台校验异常脉冲。",
                "emotional_turn": "分歧转为协作",
                "foreshadowing": ["异常脉冲呈现人为改写的节律"],
                "imagery": ["蓝白电弧照亮检修舱"],
                "evidence": ["三人同步校验稳压环脉冲"],
            },
            {
                "title": "重启浮核",
                "description": "三名维修员完成旁路切换，使浮核恢复稳定并保住云穹城高度。",
                "emotional_turn": "濒临坠落的恐惧化为信任",
                "foreshadowing": ["被改写的维护记录指向更深层隐患"],
                "imagery": ["浮核金光重新托起云海中的城邦"],
                "evidence": ["浮核在三人的倒数中重新点亮"],
            },
        )[scene_index]
        evidence = scene["evidence"]

        return {
            "chapter_characters": [
                {
                    "name": "岚舟",
                    "aliases": ["岚队"],
                    "role_hint": "protagonist",
                    "description": "云穹城浮核站维修组长，负责核心失稳调查。",
                    "desire": "在城市失去升力前恢复浮核稳定",
                    "wound": "担心错误决策会让整座城市坠落",
                    "emotional_state": "克制而紧迫",
                    "voice": "用简短指令组织行动",
                    "evidence": evidence,
                    "confidence": "high",
                },
                {
                    "name": "砾星",
                    "aliases": ["阿砾"],
                    "role_hint": "supporting",
                    "description": "擅长机械旁路的维修员，承担稳压环现场检修。",
                    "desire": "证明旧式机械方案仍能挽救浮核",
                    "wound": "害怕自己的冒险方案拖累同伴",
                    "emotional_state": "焦灼但果断",
                    "voice": "常用机械比喻解释判断",
                    "evidence": evidence,
                    "confidence": "high",
                },
                {
                    "name": "弦月",
                    "aliases": ["月检"],
                    "role_hint": "supporting",
                    "description": "负责能量安全校验的监察员，追踪异常脉冲。",
                    "desire": "找出失稳背后的真正原因",
                    "wound": "曾因忽略微小读数而失去搭档",
                    "emotional_state": "警惕而专注",
                    "voice": "以精确读数反驳猜测",
                    "evidence": evidence,
                    "confidence": "high",
                },
            ],
            "chapter_interactions": [
                {
                    "source": "岚舟",
                    "target": "砾星",
                    "relationship_type": "colleague",
                    "description": "组长与现场维修员在压力下共同决策。",
                    "tension": "岚舟重视规程，砾星倾向冒险旁路",
                    "evidence": evidence,
                    "confidence": "high",
                },
                {
                    "source": "砾星",
                    "target": "弦月",
                    "relationship_type": "friend",
                    "description": "旧友以机械经验与能量读数互补。",
                    "tension": "彼此信任却对异常来源判断不同",
                    "evidence": evidence,
                    "confidence": "high",
                },
            ],
            "chapter_events": [
                {
                    "title": scene["title"],
                    "description": scene["description"],
                    "narrative_order": 1,
                    "characters": ["岚舟", "砾星", "弦月"],
                    "locations": ["云穹城浮核站"],
                    "emotional_turn": scene["emotional_turn"],
                    "foreshadowing": scene["foreshadowing"],
                    "imagery": scene["imagery"],
                    "evidence": evidence,
                    "confidence": "high",
                }
            ],
            "chapter_world_facts": [
                {
                    "name": "云穹城浮核站",
                    "category": "location",
                    "description": "以浮核持续提供升力、悬停于云海上方的城市能源中枢。",
                    "emotional_use": "让核心故障直接威胁整座城市，形成持续压迫感",
                    "evidence": ["浮核站维持云穹城的悬空高度"],
                    "confidence": "high",
                }
            ],
        }
