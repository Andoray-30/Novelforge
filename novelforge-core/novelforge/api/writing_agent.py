"""Lightweight writing-agent runtime for chat generation.

The runtime is intentionally small. It plans a bounded set of project reads,
compresses the observations into the final writer prompt, and returns a
user-visible trace. It never writes content directly.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

from novelforge.api.types import Conversation
from novelforge.content.manager import ContentManager
from novelforge.content.models import ContentItem, ContentSearchRequest, ContentType
from novelforge.storage.storage_manager import StorageManager


MAX_TOOL_CALLS = 16
MAX_TRACE_PREVIEW = 180
MAX_ASSET_SUMMARY = 480
MAX_DETAIL_CHARS = 900
MAX_SNIPPET_CHARS = 900
MAX_AGENT_CONTEXT_CHARS = 5200
MODEL_LOOP_MAX_STEPS = 6
WRITING_CANDIDATE_MIN_CHARS = 800
WRITING_CANDIDATE_MAX_CHARS = 1500


WRITING_AGENT_TOOL_SCHEMAS: List[Dict[str, Any]] = [
    {
        "name": "search_project_assets",
        "purpose": "Find characters, world facts, timelines, relationships, outlines, and chapters in the current project only.",
        "schema": {
            "query": "optional string, max 120 chars",
            "types": "array of character/world/timeline/relationship/outline/chapter/novel",
            "limit": "integer 1-8",
            "include_ai_versions": "boolean, default false",
        },
        "output_limit": f"<= {MAX_ASSET_SUMMARY} chars per item, <= 8 items",
    },
    {
        "name": "get_asset_detail",
        "purpose": "Load one project asset by id after session and novel scope validation.",
        "schema": {"asset_id": "string", "max_chars": f"integer <= {MAX_DETAIL_CHARS}"},
        "output_limit": f"<= {MAX_DETAIL_CHARS} chars",
    },
    {
        "name": "search_chapter_snippets",
        "purpose": "Return bounded chapter text snippets from imported or formal chapters in the current project.",
        "schema": {
            "query": "optional title/content keyword, max 120 chars",
            "mode": "start/end/keyword/auto",
            "limit": "integer 1-5",
            "include_ai_versions": "boolean, default false",
        },
        "output_limit": f"<= {MAX_SNIPPET_CHARS} chars per snippet, <= 5 snippets",
    },
    {
        "name": "get_recent_conversation",
        "purpose": "Return recent user/assistant messages from the current conversation.",
        "schema": {"limit": "integer 1-8"},
        "output_limit": "<= 8 clipped messages",
    },
    {
        "name": "prepare_save_asset",
        "purpose": "Prepare a save_asset suggestion shape. Does not write anything.",
        "schema": {"asset_type": "string", "title": "string", "reason": "string"},
        "output_limit": "one bounded suggestion",
    },
    {
        "name": "prepare_chapter_update",
        "purpose": "Prepare an update-existing suggestion shape. Does not write anything.",
        "schema": {"target_hint": "string", "reason": "string"},
        "output_limit": "one bounded warning/suggestion",
    },
    {
        "name": "run_quality_check",
        "purpose": "Return a compact writing checklist for the current task.",
        "schema": {"task": "string"},
        "output_limit": "<= 8 checklist bullets",
    },
]


WRITING_AGENT_OPENAI_TOOLS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_project_assets",
            "description": "Search bounded current-project assets such as characters, world facts, timelines, relationships, outlines, and chapters.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Short search query, max 120 chars."},
                    "types": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": ["character", "world", "timeline", "relationship", "outline", "chapter", "novel"],
                        },
                    },
                    "limit": {"type": "integer", "minimum": 1, "maximum": 8},
                    "include_ai_versions": {"type": "boolean", "default": False},
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_asset_detail",
            "description": "Load one current-project asset by id after session and selected novel scope validation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "asset_id": {"type": "string"},
                    "max_chars": {"type": "integer", "minimum": 120, "maximum": MAX_DETAIL_CHARS},
                },
                "required": ["asset_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_chapter_snippets",
            "description": "Return bounded chapter text snippets from imported or formal chapters in the current project.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Short title/content keyword, max 120 chars."},
                    "mode": {"type": "string", "enum": ["start", "end", "keyword", "auto"]},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 5},
                    "include_ai_versions": {"type": "boolean", "default": False},
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recent_conversation",
            "description": "Return recent messages from the current conversation to continue the user's intent.",
            "parameters": {
                "type": "object",
                "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 8}},
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "prepare_save_asset",
            "description": "Prepare a save suggestion shape for final answer. This never writes to storage.",
            "parameters": {
                "type": "object",
                "properties": {
                    "asset_type": {"type": "string", "enum": ["chapter", "character", "world", "timeline", "relationship", "outline"]},
                    "title": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["asset_type", "title"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "prepare_chapter_update",
            "description": "Prepare an update-existing suggestion for a chapter. This never writes to storage and must wait for user confirmation.",
            "parameters": {
                "type": "object",
                "properties": {"target_hint": {"type": "string"}, "reason": {"type": "string"}},
                "required": ["target_hint"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_quality_check",
            "description": "Return a compact writing checklist for this task.",
            "parameters": {
                "type": "object",
                "properties": {"task": {"type": "string"}},
                "additionalProperties": False,
            },
        },
    },
]


@dataclass
class AgentScope:
    session_id: str
    selected_novel_id: Optional[str] = None


@dataclass
class ToolObservation:
    name: str
    status: str
    summary: str
    items: List[Dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None


@dataclass
class AgentPreparation:
    system_prompt: str
    trace: Dict[str, Any]


def _as_str(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _clip(value: str, limit: int) -> str:
    normalized = re.sub(r"\s+", " ", value or "").strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[: max(0, limit - 3)].rstrip() + "..."


def _repair_mojibake_text(value: str) -> str:
    """Repair common UTF-8-as-Latin-1 mojibake before sending context to models."""
    if not value:
        return value

    mojibake_hits = len(re.findall(r"[ÃÂ]|[\u0080-\u009f]|(?:å|æ|ç|è|é|ä|ã)[\u0080-\u00ff]", value))
    cjk_hits = len(re.findall(r"[\u4e00-\u9fff]", value))
    if mojibake_hits == 0 or cjk_hits > mojibake_hits * 2:
        return value

    try:
        repaired = value.encode("latin1").decode("utf-8")
    except UnicodeError:
        return value

    repaired_cjk_hits = len(re.findall(r"[\u4e00-\u9fff]", repaired))
    repaired_noise_hits = len(re.findall(r"[ÃÂ]|[\u0080-\u009f]", repaired))
    if repaired_cjk_hits > cjk_hits and repaired_noise_hits < mojibake_hits:
        return repaired
    return value


def _payload(item: ContentItem) -> Dict[str, Any]:
    return item.extracted_data if isinstance(item.extracted_data, dict) else {}


def _content_text(item: ContentItem) -> str:
    payload = _payload(item)
    for key in ("content", "description", "summary", "text", "profile"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return _repair_mojibake_text(value.strip())
    return _repair_mojibake_text(item.content or "")


def _title(item: ContentItem) -> str:
    payload = _payload(item)
    for key in ("display_title", "chapter_title", "title", "name"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return _repair_mojibake_text(value.strip())
    return _repair_mojibake_text(item.metadata.title)


def _type_name(value: Any) -> str:
    return str(value.value if hasattr(value, "value") else value)


def _save_destination(item: ContentItem) -> str:
    return _as_str(_payload(item).get("save_destination"))


def _is_imported_or_formal_chapter(item: ContentItem) -> bool:
    payload = _payload(item)
    destination = _save_destination(item)
    return (
        item.metadata.type == ContentType.CHAPTER
        and (
            destination in {"formal_body", "formal_prologue"}
            or payload.get("source_type") in {"imported", "system_split"}
            or "imported" in set(item.metadata.tags or [])
        )
    )


def _is_ai_draft_or_candidate(item: ContentItem) -> bool:
    destination = _save_destination(item)
    if destination in {"ai_draft", "alternate_version"}:
        return True
    tags = set(item.metadata.tags or [])
    return bool(tags.intersection({"ai_draft", "alternate_version", "ai_candidate"}))


def _type_value(value: Any) -> Optional[ContentType]:
    raw = _as_str(value).lower()
    aliases = {
        "character_card": "character",
        "world_setting": "world",
    }
    raw = aliases.get(raw, raw)
    try:
        return ContentType(raw)
    except ValueError:
        return None


def _item_in_scope(item: ContentItem, scope: AgentScope) -> bool:
    item_session_id = item.metadata.session_id
    parent_id = item.metadata.parent_id

    if item_session_id and item_session_id != scope.session_id:
        return False

    if scope.selected_novel_id:
        return item.metadata.id == scope.selected_novel_id or parent_id == scope.selected_novel_id

    return item_session_id == scope.session_id


def _lookup_terms(text: str) -> List[str]:
    normalized = re.sub(r"[^\w\u4e00-\u9fff]+", " ", text or "", flags=re.UNICODE).strip()
    terms = [term for term in normalized.split() if len(term) >= 2]
    return list(dict.fromkeys(terms))[:8]


def _mentions_recent(text: str) -> bool:
    return bool(
        re.search(
            r"(刚才|上一版|上版|前面|上面|继续|接着|那版|这版|候选|草稿|rewrite|continue)",
            text,
            re.I,
        )
    )


def _mentions_writing(text: str) -> bool:
    return bool(
        re.search(
            r"(写|续写|改写|重写|润色|序章|正文|番外|章节|候选|草稿|开头|结尾|prologue|chapter|rewrite|continue)",
            text,
            re.I,
        )
    )


def _mentions_chapter_need(text: str) -> bool:
    return bool(
        re.search(
            r"(续写|接着|章节|第\s*\d+\s*章|某章|这一章|上一章|结尾|开头|序章|番外|正文|chapter|prologue|ending)",
            text,
            re.I,
        )
    )


def _mentions_asset_need(text: str) -> bool:
    return bool(
        re.search(
            r"(角色|人物|关系|羁绊|世界观|设定|地点|组织|时间线|事件|伏笔|character|world|relationship|timeline)",
            text,
            re.I,
        )
    )


def _allow_ai_versions(text: str) -> bool:
    return bool(re.search(r"(草稿|候选|上一版|刚才|那版|这版|备选|alternate|draft)", text, re.I))


def _snippet_mode(text: str) -> str:
    if re.search(r"(续写|接着|结尾|上一章|ending)", text, re.I):
        return "end"
    if re.search(r"(开头|序章|prologue|beginning)", text, re.I):
        return "start"
    return "keyword"


CREATIVE_SIGNAL_GROUPS: Dict[str, Dict[str, List[str]]] = {
    "character": {
        "欲望": ["desire", "goal", "motivation", "want", "渴望", "想要", "目标", "动机", "欲望"],
        "伤痕": ["wound", "trauma", "loss", "past", "伤痕", "创伤", "失去", "阴影", "过去"],
        "恐惧": ["fear", "afraid", "terror", "恐惧", "害怕", "担心", "畏惧"],
        "行动模式": ["action", "behavior", "pattern", "choice", "行动", "选择", "习惯", "会做"],
        "说话方式": ["voice", "dialogue", "tone", "speech", "台词", "语气", "说话", "口吻"],
        "核心关系": ["relationship", "bond", "conflict", "关系", "羁绊", "依赖", "冲突", "亲密"],
    },
    "relationship": {
        "依赖": ["dependency", "depend", "need", "rely", "依赖", "需要", "托付", "离不开"],
        "误解": ["misunderstanding", "misunderstand", "misread", "误解", "错认", "隐瞒", "误会"],
        "亏欠": ["debt", "owe", "guilt", "亏欠", "愧疚", "欠", "债", "补偿"],
        "冲突": ["conflict", "oppose", "fight", "冲突", "对立", "争执", "敌意", "矛盾"],
        "情绪张力": ["emotional_tension", "tension", "emotion", "pain", "张力", "痛感", "拉扯", "暧昧", "舍不得"],
        "权力差/控制": ["power_dynamic", "control", "authority", "权力", "控制", "支配", "压迫", "保护欲"],
        "亲密度": ["intimacy", "trust", "closeness", "亲密", "信任", "熟悉", "依恋"],
        "关系变化": ["arc", "evolution", "change", "变化", "转变", "演变", "破裂", "和解"],
        "剧情功能": ["plot_function", "function", "plot", "剧情", "功能", "推动", "转折", "伏笔"],
        "可写场景": ["scene_potential", "scene", "场景", "可写", "对话", "选择", "爆发"],
    },
    "world": {
        "规则": ["rule", "law", "protocol", "规则", "法则", "协议", "限制"],
        "意象": ["image", "imagery", "symbol", "意象", "月光", "钟声", "雨", "黑暗", "颜色"],
        "代价": ["cost", "price", "sacrifice", "代价", "牺牲", "剥离", "损耗"],
        "禁忌": ["taboo", "forbid", "禁忌", "禁止", "不可", "违背"],
        "场景可用性": ["scene", "location", "place", "场景", "地点", "空间", "现场"],
    },
    "chapter": {
        "可引用开头": ["开头", "序章", "opening", "beginning"],
        "可引用结尾": ["结尾", "章末", "ending", "final"],
        "关键意象": ["意象", "钟声", "雨", "月", "光", "黑暗", "门", "影子"],
    },
}


def _diagnostic_source_text(item: ContentItem, text: str) -> str:
    payload_text = json.dumps(_payload(item), ensure_ascii=False, default=str)
    return f"{_title(item)}\n{text}\n{payload_text}"


def _creative_diagnostics(asset_type: str, source_text: str, *, length: int = 0) -> Dict[str, Any]:
    groups = CREATIVE_SIGNAL_GROUPS.get(asset_type)
    if not groups:
        return {"usable": [], "missing": [], "score": 0, "summary": "暂无创作诊断。"}

    normalized = source_text.lower()
    usable: List[str] = []
    missing: List[str] = []
    for label, markers in groups.items():
        if any(marker.lower() in normalized for marker in markers):
            usable.append(label)
        else:
            missing.append(label)

    if asset_type == "chapter":
        if length >= 120 and "可引用开头" not in usable:
            usable.append("可引用开头")
            if "可引用开头" in missing:
                missing.remove("可引用开头")
        if length >= 360 and "可引用结尾" not in usable:
            usable.append("可引用结尾")
            if "可引用结尾" in missing:
                missing.remove("可引用结尾")

    score = len(usable)
    diagnostics = {
        "usable": usable,
        "missing": missing,
        "missing_signals": missing,
        "score": score,
        "summary": _diagnostic_summary(usable, missing),
    }
    if asset_type == "relationship":
        diagnostics["relationship_creative_readiness"] = _relationship_readiness(usable, missing)
    return diagnostics


def _relationship_readiness(usable: Sequence[str], missing: Sequence[str]) -> str:
    key_signals = {"依赖", "误解", "亏欠", "冲突", "情绪张力", "剧情功能"}
    present = key_signals.intersection(set(usable))
    if len(present) >= 4 and "情绪张力" in present:
        return "strong"
    if len(present) >= 2:
        return "usable"
    return "thin"


def _diagnostic_summary(usable: Sequence[str], missing: Sequence[str]) -> str:
    available = "、".join(usable) if usable else "暂无明显可用创作信号"
    absent = "、".join(missing[:4]) if missing else "无明显缺口"
    return f"可用：{available}；缺口：{absent}"


def _relationship_parties(item: ContentItem) -> tuple[str, str]:
    payload = _payload(item)
    source = _as_str(payload.get("source") or payload.get("from") or payload.get("character_a"))
    target = _as_str(payload.get("target") or payload.get("to") or payload.get("character_b"))
    if not source and item.relations:
        relation_source = item.relations.get("source") or []
        if relation_source:
            source = _as_str(relation_source[0])
    if not target and item.relations:
        relation_target = item.relations.get("target") or []
        if relation_target:
            target = _as_str(relation_target[0])
    return source, target


def _relationship_repair_suggestion(item: ContentItem, diagnostics: Dict[str, Any]) -> Dict[str, Any]:
    source, target = _relationship_parties(item)
    title = _title(item)
    if not source or not target:
        names = re.split(r"\s*(?:->|与|和|/|-)\s*", title)
        if len(names) >= 2:
            source = source or names[0].strip()
            target = target or names[1].strip()
    source = source or "角色A"
    target = target or "角色B"
    missing = diagnostics.get("missing_signals") or diagnostics.get("missing") or []
    usable = diagnostics.get("usable") or []
    weak_spots = "、".join(missing[:5]) if missing else "无明显缺口"
    available = "、".join(usable) if usable else "现有关系类型/证据"
    core = f"{source} 与 {target} 的关系需要从“{available}”推进到可制造选择和代价的张力结构。"
    return {
        "type": "relationship_repair_suggestion",
        "relationship_id": item.metadata.id,
        "title": f"{title} - 关系补强建议",
        "source": source,
        "target": target,
        "core": core,
        "current_state": _clip(_content_text(item) or json.dumps(_payload(item), ensure_ascii=False), 220),
        "dependency": "明确谁在情感、身份、资源或安全感上离不开谁。",
        "misunderstanding": "补一处双方认知不一致、隐瞒或错认，形成场景里的误判。",
        "debt": "补一笔亏欠、救赎或必须偿还的情感债。",
        "conflict": "把价值观或目标冲突落到一次不可回避的选择。",
        "emotional_tension": "写清靠近会痛、离开也会痛的拉扯。",
        "arc": "定义从疏离到信任、从依赖到背叛、或从误解到共同承担的变化方向。",
        "scene_potential": [
            f"{source} 为了保护 {target} 隐瞒事实，反而让 {target} 做出错误选择。",
            f"{target} 要求 {source} 付出代价，迫使两人说出一直回避的亏欠。",
        ],
        "writing_advice": "用于序章时，优先把关系张力写成一次行动选择，而不是人物旁白解释。",
        "missing_signals": missing,
        "usable_signals": usable,
        "weak_spots": weak_spots,
    }


def _relationship_quality_report(relationship_assets: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    total = len(relationship_assets)
    tension_count = 0
    low_info_count = 0
    missing_plot_function_count = 0
    missing_signals: Dict[str, int] = {}
    for asset in relationship_assets:
        diagnostics = asset.get("creative_diagnostics") if isinstance(asset, dict) else None
        if not isinstance(diagnostics, dict):
            low_info_count += 1
            continue
        usable = set(diagnostics.get("usable") or [])
        missing = list(diagnostics.get("missing_signals") or diagnostics.get("missing") or [])
        readiness = _as_str(diagnostics.get("relationship_creative_readiness"))
        if "情绪张力" in usable or readiness == "strong":
            tension_count += 1
        if readiness == "thin" or int(diagnostics.get("score") or 0) <= 2:
            low_info_count += 1
        if "剧情功能" in missing:
            missing_plot_function_count += 1
        for signal in missing:
            missing_signals[signal] = missing_signals.get(signal, 0) + 1
    return {
        "total_relationships": total,
        "tension_relationships": tension_count,
        "low_information_relationships": low_info_count,
        "missing_plot_function_relationships": missing_plot_function_count,
        "missing_signals": missing_signals,
        "status": "thin" if total and low_info_count >= max(1, total // 2) else ("empty" if total == 0 else "usable"),
    }


def _relationship_queue_score(item: ContentItem, diagnostics: Dict[str, Any]) -> tuple[int, List[str]]:
    payload = _payload(item)
    missing = list(diagnostics.get("missing_signals") or diagnostics.get("missing") or [])
    usable = set(diagnostics.get("usable") or [])
    readiness = _as_str(diagnostics.get("relationship_creative_readiness"))
    evidence = payload.get("evidence") if isinstance(payload.get("evidence"), list) else []
    chapter_refs = payload.get("chapter_references") if isinstance(payload.get("chapter_references"), list) else []
    strength = payload.get("strength")
    try:
        strength_score = int(strength or 0)
    except (TypeError, ValueError):
        strength_score = 0

    score = len(missing) * 10
    reasons: List[str] = []
    if readiness == "thin":
        score += 30
        reasons.append("低信息关系")
    elif readiness == "usable":
        score += 12
        reasons.append("可用但仍可补强")
    if missing:
        reasons.append(f"缺失 {len(missing)} 个创作信号")
    if evidence:
        score += min(len(evidence), 8) * 3
        reasons.append(f"有 {len(evidence)} 条证据可扩写")
    if chapter_refs:
        score += min(len(chapter_refs), 6) * 4
        reasons.append(f"覆盖 {len(chapter_refs)} 个章节")
    if strength_score >= 8:
        score += 18
        reasons.append("关系强度高")
    elif strength_score >= 5:
        score += 8
        reasons.append("关系强度中等")
    if {"冲突", "误解", "关系变化"}.intersection(usable):
        score += 14
        reasons.append("已有冲突/误解/变化可扩展")
    if _is_enriched_relationship(item):
        score -= 80
        reasons.append("已补强，默认后置")
    if not reasons:
        reasons.append("关系信息较薄，适合人工复核")
    return score, reasons


def evaluate_relationship_driven_candidate(
    text: str,
    required_terms: Sequence[str],
    *,
    min_chars: int = WRITING_CANDIDATE_MIN_CHARS,
    max_chars: int = WRITING_CANDIDATE_MAX_CHARS,
) -> Dict[str, Any]:
    content = re.sub(r"<save_asset[\s\S]*?</save_asset>", "", text or "").strip()
    matched_terms = [term for term in required_terms if term and term in content]
    preface_markers = [
        "以下是",
        "这是一份",
        "为您创作",
        "写作策略",
        "关系补强草稿",
        "###",
        "```",
    ]
    relation_markers = ["选择", "决定", "亏欠", "误解", "隐瞒", "冲突", "拉扯", "痛", "守护", "离开", "靠近"]
    issues: List[str] = []
    if len(content) < min_chars:
        issues.append(f"字数不足：{len(content)} < {min_chars}")
    if len(content) > max_chars:
        issues.append(f"字数过长：{len(content)} > {max_chars}")
    if len(matched_terms) < min(3, len([term for term in required_terms if term])):
        issues.append("关系端点/别名命中不足")
    if any(marker in content[:160] for marker in preface_markers):
        issues.append("包含说明性前言或标题")
    if not any(marker in content for marker in relation_markers):
        issues.append("缺少关系驱动的选择/亏欠/误解/情绪转折信号")
    return {
        "passed": not issues,
        "issues": issues,
        "char_count": len(content),
        "matched_terms": matched_terms,
        "required_terms": [term for term in required_terms if term],
    }


def build_relationship_candidate_rewrite_prompt(
    candidate_text: str,
    evaluation: Dict[str, Any],
    required_terms: Sequence[str],
) -> str:
    terms = "、".join([term for term in required_terms if term])
    issues = "；".join(evaluation.get("issues") or [])
    return (
        "请把下面候选改写成可保存的小说序章正文，只输出正文，不要标题、说明或列表。\n"
        f"硬性要求：{WRITING_CANDIDATE_MIN_CHARS}-{WRITING_CANDIDATE_MAX_CHARS} 个中文字符；"
        f"必须自然使用这些关系端点/别名：{terms}；"
        "至少写出一次人物行动选择、一次亏欠或误解、一次情绪转折。\n"
        f"当前不达标原因：{issues}\n\n"
        f"候选正文：\n{_clip(candidate_text, 2600)}"
    )


def _is_enriched_relationship(item: ContentItem) -> bool:
    if item.metadata.type != ContentType.RELATIONSHIP:
        return False
    payload = _payload(item)
    flags = payload.get("quality_flags")
    if isinstance(flags, list) and "relationship_enriched" in flags:
        return True
    return _as_str(payload.get("repair_status")) == "confirmed"


def _extract_snippet(content: str, query: str, mode: str, limit: int = MAX_SNIPPET_CHARS) -> str:
    text = content.strip()
    if not text:
        return ""
    if len(text) <= limit:
        return text
    if mode == "start":
        return text[:limit]
    if mode == "end":
        return text[-limit:]

    terms = _lookup_terms(query)
    lowered = text.lower()
    hit = -1
    for term in terms:
        hit = lowered.find(term.lower())
        if hit >= 0:
            break
    if hit < 0:
        return text[:limit]
    half = limit // 2
    start = max(0, hit - half)
    end = min(len(text), start + limit)
    return text[start:end]


class WritingAgentRuntime:
    """Rule-planned context gatherer for writing chat."""

    def __init__(self, content_manager: ContentManager, storage_manager: StorageManager):
        self.content_manager = content_manager
        self.storage_manager = storage_manager

    async def prepare(
        self,
        *,
        user_message: str,
        context: Optional[Dict[str, Any]],
        conversation: Optional[Conversation],
        base_system_prompt: str,
        ai_service: Optional[Any] = None,
    ) -> AgentPreparation:
        scope = self._scope_from_context(context)
        if not scope:
            return AgentPreparation(
                system_prompt=base_system_prompt,
                trace=self._empty_trace("缺少 session_id，已使用普通单轮上下文。", degraded=True),
            )

        supports_tool_calling = getattr(ai_service, "supports_tool_calling_for_agent", None)
        has_real_client = getattr(ai_service, "has_real_client", None)
        tool_loop_available = (
            ai_service is not None
            and hasattr(ai_service, "chat_tool_decision")
            and (
                bool(supports_tool_calling()) if callable(supports_tool_calling)
                else (not callable(has_real_client) or bool(has_real_client()))
            )
        )

        if tool_loop_available:
            try:
                return await self._prepare_model_tool_loop(
                    user_message=user_message,
                    context=context or {},
                    conversation=conversation,
                    base_system_prompt=base_system_prompt,
                    scope=scope,
                    ai_service=ai_service,
                )
            except Exception as exc:
                return await self._prepare_rule(
                    user_message=user_message,
                    context=context or {},
                    conversation=conversation,
                    base_system_prompt=base_system_prompt,
                    scope=scope,
                    fallback_reason=f"model_tool_loop_unavailable: {_clip(str(exc), 120)}",
                )

        return await self._prepare_rule(
            user_message=user_message,
            context=context or {},
            conversation=conversation,
            base_system_prompt=base_system_prompt,
            scope=scope,
            fallback_reason="tool_calling_not_supported_or_no_real_client",
        )

    async def _prepare_rule(
        self,
        *,
        user_message: str,
        context: Dict[str, Any],
        conversation: Optional[Conversation],
        base_system_prompt: str,
        scope: AgentScope,
        fallback_reason: Optional[str] = None,
    ) -> AgentPreparation:
        plan = self._plan(user_message, context)
        observations: List[ToolObservation] = []
        degraded = bool(fallback_reason)
        seen_call_keys: set[str] = set()

        calls = list(plan["calls"])
        while calls and len(observations) < MAX_TOOL_CALLS:
            call = calls.pop(0)
            call_key = json.dumps(call, ensure_ascii=False, sort_keys=True)
            if call_key in seen_call_keys:
                continue
            seen_call_keys.add(call_key)

            try:
                observation = await self._run_tool(
                    call["name"],
                    call.get("args", {}),
                    scope,
                    conversation,
                    user_message,
                )
            except Exception as exc:  # pragma: no cover - defensive degradation
                degraded = True
                observation = ToolObservation(
                    name=call["name"],
                    status="error",
                    summary=f"工具失败，已降级：{_clip(str(exc), 120)}",
                    error=str(exc),
                )
            if observation.status == "error":
                degraded = True
            observations.append(observation)

            for next_call in self._maybe_continue(plan, observations):
                if len(observations) + len(calls) >= MAX_TOOL_CALLS:
                    break
                calls.append(next_call)

        if calls:
            degraded = True

        if plan.get("writing"):
            observations = await self._ensure_writing_baseline_observations(
                observations,
                scope=scope,
                conversation=conversation,
                user_message=user_message,
            )

        context_block = self._build_context_block(observations)
        trace = self._build_trace(
            plan,
            observations,
            degraded,
            mode="fallback" if fallback_reason else "rule_planner",
            fallback_reason=fallback_reason,
            stopped_reason="planned_tools_exhausted" if not calls else "max_tool_calls",
        )
        if context_block:
            system_prompt = (
                f"{base_system_prompt}\n\n"
                "以下是本轮写作 agent 已读取并压缩后的依据。请只把它当作创作参考，"
                "不要在正文中复述工具过程，也不要展示隐藏思考链。\n"
                f"{context_block}"
            )
        else:
            system_prompt = base_system_prompt

        return AgentPreparation(system_prompt=system_prompt, trace=trace)

    async def _prepare_model_tool_loop(
        self,
        *,
        user_message: str,
        context: Dict[str, Any],
        conversation: Optional[Conversation],
        base_system_prompt: str,
        scope: AgentScope,
        ai_service: Any,
    ) -> AgentPreparation:
        observations: List[ToolObservation] = []
        degraded = False
        stopped_reason = "model_completed"
        tool_messages = self._build_model_loop_messages(user_message, context)
        seen_call_keys: set[str] = set()

        for step in range(1, MODEL_LOOP_MAX_STEPS + 1):
            decision = await ai_service.chat_tool_decision(
                messages=tool_messages,
                tools=WRITING_AGENT_OPENAI_TOOLS,
                max_tokens=900,
                timeout=75.0,
            )
            calls = decision.get("tool_calls") if isinstance(decision, dict) else []
            if not calls:
                stopped_reason = "context_sufficient"
                break

            assistant_tool_calls: List[Dict[str, Any]] = []
            for raw_call in calls:
                if len(observations) >= MODEL_LOOP_MAX_STEPS:
                    degraded = True
                    stopped_reason = "max_tool_calls"
                    break
                if not isinstance(raw_call, dict):
                    continue
                name = _as_str(raw_call.get("name"))
                args = raw_call.get("arguments") if isinstance(raw_call.get("arguments"), dict) else {}
                call_id = _as_str(raw_call.get("id")) or f"call_{step}_{len(assistant_tool_calls) + 1}"
                call_key = json.dumps({"name": name, "args": args}, ensure_ascii=False, sort_keys=True)
                if not name or call_key in seen_call_keys:
                    continue
                seen_call_keys.add(call_key)
                assistant_tool_calls.append(
                    {
                        "id": call_id,
                        "type": "function",
                        "function": {"name": name, "arguments": json.dumps(args, ensure_ascii=False)},
                    }
                )

                try:
                    observation = await self._run_tool(name, args, scope, conversation, user_message)
                except Exception as exc:  # pragma: no cover - defensive degradation
                    degraded = True
                    observation = ToolObservation(
                        name=name,
                        status="error",
                        summary=f"工具失败，已保留降级上下文：{_clip(str(exc), 120)}",
                        error=str(exc),
                    )
                if observation.status == "error":
                    degraded = True
                observation_items = observation.items[:6]
                observations.append(observation)
                tool_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call_id,
                        "content": json.dumps(
                            {
                                "name": observation.name,
                                "status": observation.status,
                                "summary": observation.summary,
                                "items": observation_items,
                            },
                            ensure_ascii=False,
                        ),
                    }
                )

                if name in {"prepare_save_asset", "prepare_chapter_update"}:
                    stopped_reason = "awaiting_user_confirmation"
                    break

            if assistant_tool_calls:
                tool_messages.insert(
                    max(1, len(tool_messages) - len(assistant_tool_calls)),
                    {
                        "role": "assistant",
                        "content": decision.get("content") or "",
                        "tool_calls": assistant_tool_calls,
                    },
                )

            if stopped_reason in {"awaiting_user_confirmation", "max_tool_calls"}:
                break
        else:
            degraded = True
            stopped_reason = "max_tool_calls"

        observations = await self._ensure_writing_baseline_observations(
            observations,
            scope=scope,
            conversation=conversation,
            user_message=user_message,
        )

        context_block = self._build_context_block(observations)
        trace = self._build_trace(
            {
                "plan_summary": "模型已按本轮写作目标自主选择项目读取工具；最终回答只使用压缩后的可审计依据。",
            },
            observations,
            degraded,
            mode="model_tool_loop",
            fallback_reason=None,
            stopped_reason=stopped_reason,
        )
        system_prompt = self._build_writer_prompt(base_system_prompt, context_block, mode="model_tool_loop")
        return AgentPreparation(system_prompt=system_prompt, trace=trace)

    def _scope_from_context(self, context: Optional[Dict[str, Any]]) -> Optional[AgentScope]:
        if not isinstance(context, dict):
            return None
        session_id = _as_str(context.get("session_id"))
        if not session_id:
            return None
        selected_novel_id = _as_str(context.get("selected_novel_id") or context.get("selectedNovelId")) or None
        return AgentScope(session_id=session_id, selected_novel_id=selected_novel_id)

    def _build_model_loop_messages(self, user_message: str, context: Dict[str, Any]) -> List[Dict[str, Any]]:
        focused_assets = context.get("focused_assets")
        focused_summary = ""
        if isinstance(focused_assets, list) and focused_assets:
            focused_summary = _clip(json.dumps(focused_assets[:8], ensure_ascii=False), 1000)

        instructions = (
            "You are NovelForge's writing context agent. Decide which tools are needed before the writer answers.\n"
            "Rules:\n"
            "- Use manually focused_assets first when present.\n"
            "- For prologue, chapter writing, rewriting, or continuation tasks, gather at least one character, one relationship, one world/setting asset, and one imported/formal chapter snippet when available.\n"
            "- Recent conversation is only for continuing intent, not as canonical project truth.\n"
            "- Prefer imported source text and formal chapters.\n"
            "- Exclude AI drafts/candidates by default unless the user explicitly asks for draft/candidate/previous/just-now versions.\n"
            "- If the user wants to overwrite or replace an existing chapter, call prepare_chapter_update and stop for user confirmation.\n"
            "- Never write to storage. prepare_save_asset and prepare_chapter_update only create suggestions.\n"
            "- Keep tool calls minimal and stop once the context is enough."
        )
        if focused_summary:
            instructions += f"\nFocused assets provided by UI: {focused_summary}"
        return [
            {"role": "system", "content": instructions},
            {"role": "user", "content": user_message},
        ]

    def _build_writer_prompt(self, base_system_prompt: str, context_block: str, mode: str) -> str:
        if not context_block:
            return base_system_prompt
        return (
            f"{base_system_prompt}\n\n"
            f"Writing agent mode: {mode}.\n"
            "Use the following compressed tool observations as writing context. Do not explain tool usage in the answer. "
            "Do not reveal hidden reasoning. If you generate a savable chapter, include a valid save_asset tag so the user can confirm saving. "
            "If updating an existing chapter, produce an update suggestion and wait for user confirmation.\n"
            "Craft requirements: 不只复述设定，要把角色欲望、伤痕、恐惧、关系张力和世界意象转化为具体场景。"
            "如果关系资产包含依赖、误解、亏欠、冲突、情绪张力、权力差、亲密度、关系变化或剧情功能，必须把它转化为具体场景冲突或人物选择。"
            "如果 trace 显示关系资产薄弱，请把结果定位为草稿，并建议补强关系资产。"
            "序章要有动作、意象、悬念和情绪余韵，同时不要把所有设定解释完。"
            "如果资产不足，可以说明结果更适合作为草稿，并建议补强哪些资产。\n"
            f"{context_block}"
        )

    def _plan(self, user_message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        focused_assets = context.get("focused_assets")
        has_focused = isinstance(focused_assets, list) and len(focused_assets) > 0
        writing = _mentions_writing(user_message)
        recent = _mentions_recent(user_message)
        needs_assets = _mentions_asset_need(user_message) or (writing and not has_focused)
        needs_chapters = _mentions_chapter_need(user_message)
        allow_ai = _allow_ai_versions(user_message)

        calls: List[Dict[str, Any]] = []
        if recent or writing:
            calls.append({"name": "get_recent_conversation", "args": {"limit": 6}})
        if needs_assets:
            if writing:
                calls.extend(
                    [
                        {
                            "name": "search_project_assets",
                            "args": {
                                "query": user_message[:120],
                                "types": ["character"],
                                "limit": 3,
                                "include_ai_versions": allow_ai,
                            },
                        },
                        {
                            "name": "search_project_assets",
                            "args": {
                                "query": user_message[:120],
                                "types": ["relationship"],
                                "limit": 3,
                                "include_ai_versions": allow_ai,
                            },
                        },
                        {
                            "name": "search_project_assets",
                            "args": {
                                "query": user_message[:120],
                                "types": ["world"],
                                "limit": 3,
                                "include_ai_versions": allow_ai,
                            },
                        },
                    ]
                )
            else:
                calls.append(
                    {
                        "name": "search_project_assets",
                        "args": {
                            "query": user_message[:120],
                            "types": ["character", "world", "outline", "relationship", "timeline"],
                            "limit": 5,
                            "include_ai_versions": allow_ai,
                        },
                    }
                )
        if needs_chapters:
            calls.append(
                {
                    "name": "search_chapter_snippets",
                    "args": {
                        "query": user_message[:120],
                        "mode": _snippet_mode(user_message),
                        "limit": 3,
                        "include_ai_versions": allow_ai,
                    },
                }
            )
        if re.search(r"(覆盖|替换|更新已有|改写.*章|重写.*章)", user_message):
            calls.append(
                {
                    "name": "prepare_chapter_update",
                    "args": {
                        "target_hint": user_message[:120],
                        "reason": "用户可能要覆盖或改写已有章节，必须生成更新建议并等待确认。",
                    },
                }
            )
        elif writing:
            calls.append({"name": "run_quality_check", "args": {"task": user_message[:160]}})
            calls.append(
                {
                    "name": "prepare_save_asset",
                    "args": {
                        "asset_type": "chapter",
                        "title": "AI 写作草稿",
                        "reason": "写作结果可能需要保存为章节草稿或候选版本。",
                    },
                }
            )
        if writing and not any(call["name"] == "run_quality_check" for call in calls) and len(calls) < MAX_TOOL_CALLS:
            calls.append({"name": "run_quality_check", "args": {"task": user_message[:160]}})

        if not calls:
            calls.append({"name": "get_recent_conversation", "args": {"limit": 3}})

        intent_parts = ["写作/改写" if writing else "普通问答"]
        if recent:
            intent_parts.append("参考最近对话")
        if needs_chapters:
            intent_parts.append("读取章节片段")
        if needs_assets:
            intent_parts.append("读取项目资产")

        return {
            "intent": "，".join(intent_parts),
            "plan_summary": (
                f"识别为{'，'.join(intent_parts)}；优先使用聚焦资产，"
                "并按需读取最近对话、项目资产和章节片段。"
            ),
            "calls": calls[:MAX_TOOL_CALLS],
            "writing": writing,
            "needs_assets": needs_assets,
            "needs_chapters": needs_chapters,
        }

    def _maybe_continue(
        self,
        plan: Dict[str, Any],
        observations: Sequence[ToolObservation],
    ) -> List[Dict[str, Any]]:
        if len(observations) >= MAX_TOOL_CALLS:
            return []

        by_name = {observation.name: observation for observation in observations}
        next_calls: List[Dict[str, Any]] = []

        asset_search = by_name.get("search_project_assets")
        if plan.get("needs_assets") and asset_search and not asset_search.items:
            next_calls.append(
                {
                    "name": "search_project_assets",
                    "args": {
                        "query": "",
                        "types": ["character", "world", "outline", "relationship", "timeline"],
                        "limit": 5,
                        "include_ai_versions": False,
                    },
                }
            )

        snippet_search = by_name.get("search_chapter_snippets")
        if plan.get("needs_chapters") and snippet_search and not snippet_search.items:
            next_calls.append(
                {
                    "name": "search_chapter_snippets",
                    "args": {
                        "query": "",
                        "mode": "end",
                        "limit": 3,
                        "include_ai_versions": False,
                    },
                }
            )

        return next_calls

    async def _ensure_writing_baseline_observations(
        self,
        observations: Sequence[ToolObservation],
        *,
        scope: AgentScope,
        conversation: Optional[Conversation],
        user_message: str,
    ) -> List[ToolObservation]:
        enriched = list(observations)
        if not _mentions_writing(user_message) or len(enriched) >= MAX_TOOL_CALLS:
            return enriched

        allow_ai = _allow_ai_versions(user_message)

        def has_asset_type(asset_type: str) -> bool:
            return any(
                observation.name == "search_project_assets"
                and any(item.get("type") == asset_type for item in observation.items)
                for observation in enriched
            )

        async def append_once(name: str, args: Dict[str, Any]) -> None:
            if len(enriched) >= MAX_TOOL_CALLS:
                return
            try:
                enriched.append(await self._run_tool(name, args, scope, conversation, user_message))
            except Exception as exc:  # pragma: no cover - defensive degradation
                enriched.append(
                    ToolObservation(
                        name=name,
                        status="error",
                        summary=f"写作兜底检索失败：{_clip(str(exc), 120)}",
                        error=str(exc),
                    )
                )

        baseline_calls: List[tuple[str, Dict[str, Any]]] = []
        if not has_asset_type("character"):
            baseline_calls.append(
                (
                    "search_project_assets",
                    {"query": "", "types": ["character"], "limit": 3, "include_ai_versions": allow_ai},
                )
            )
        if not has_asset_type("relationship"):
            baseline_calls.append(
                (
                    "search_project_assets",
                    {"query": "", "types": ["relationship"], "limit": 3, "include_ai_versions": allow_ai},
                )
            )
        if not has_asset_type("world"):
            baseline_calls.append(
                (
                    "search_project_assets",
                    {"query": "", "types": ["world"], "limit": 3, "include_ai_versions": allow_ai},
                )
            )
        if not any(observation.name == "search_chapter_snippets" and observation.items for observation in enriched):
            baseline_calls.append(
                (
                    "search_chapter_snippets",
                    {"query": "", "mode": _snippet_mode(user_message), "limit": 3, "include_ai_versions": allow_ai},
                )
            )
        if not any(observation.name == "run_quality_check" for observation in enriched):
            baseline_calls.append(("run_quality_check", {"task": user_message[:160]}))
        if not any(observation.name == "build_relationship_repair_queue" for observation in enriched):
            baseline_calls.append(("build_relationship_repair_queue", {"limit": 3}))

        for name, args in baseline_calls:
            if len(enriched) >= MAX_TOOL_CALLS:
                break
            await append_once(name, args)

        return enriched

    async def _run_tool(
        self,
        name: str,
        args: Dict[str, Any],
        scope: AgentScope,
        conversation: Optional[Conversation],
        user_message: str,
    ) -> ToolObservation:
        if name == "search_project_assets":
            return await self.search_project_assets(scope, args)
        if name == "get_asset_detail":
            return await self.get_asset_detail(scope, args)
        if name == "search_chapter_snippets":
            return await self.search_chapter_snippets(scope, args, user_message)
        if name == "get_recent_conversation":
            return self.get_recent_conversation(conversation, args, user_message)
        if name == "prepare_save_asset":
            return self.prepare_save_asset(args)
        if name == "prepare_chapter_update":
            return self.prepare_chapter_update(args)
        if name == "run_quality_check":
            return self.run_quality_check(args)
        if name == "build_relationship_repair_queue":
            return await self.build_relationship_repair_queue(scope, args)
        return ToolObservation(name=name, status="error", summary="未知工具")

    async def build_relationship_repair_suggestion(
        self,
        scope: AgentScope,
        relationship_id: str,
        *,
        user_message: str = "",
    ) -> Dict[str, Any]:
        item = await self.content_manager.get_content(relationship_id)
        if not item or not _item_in_scope(item, scope) or item.metadata.type != ContentType.RELATIONSHIP:
            return {"status": "error", "summary": "关系资产不存在或不属于当前项目"}

        text = _content_text(item) or json.dumps(_payload(item), ensure_ascii=False)
        diagnostics = _creative_diagnostics("relationship", _diagnostic_source_text(item, text), length=len(text))
        suggestion = _relationship_repair_suggestion(item, diagnostics)
        source, target = suggestion["source"], suggestion["target"]

        related_characters: List[Dict[str, Any]] = []
        for name in [source, target]:
            if name in {"角色A", "角色B"}:
                continue
            observation = await self.search_project_assets(
                scope,
                {"query": name, "types": ["character"], "limit": 1, "include_ai_versions": False},
            )
            related_characters.extend(observation.items[:1])

        snippet_query = " ".join([value for value in [source, target] if value not in {"角色A", "角色B"}])
        snippets = await self.search_chapter_snippets(
            scope,
            {"query": snippet_query, "mode": "keyword", "limit": 2, "include_ai_versions": False},
            user_message or snippet_query,
        )

        suggestion["related_characters"] = [
            {"id": character.get("id"), "title": character.get("title"), "summary": character.get("summary")}
            for character in related_characters[:2]
        ]
        suggestion["supporting_chapter_snippets"] = [
            {"id": snippet.get("id"), "title": snippet.get("title"), "preview": snippet.get("summary")}
            for snippet in snippets.items[:2]
        ]
        suggestion["enriched_relationship_draft"] = {
            "source": source,
            "target": target,
            "core": suggestion["core"],
            "current_state": suggestion["current_state"],
            "dependency": suggestion["dependency"],
            "misunderstanding": suggestion["misunderstanding"],
            "debt": suggestion["debt"],
            "conflict": suggestion["conflict"],
            "emotional_tension": suggestion["emotional_tension"],
            "arc": suggestion["arc"],
            "scene_potential": suggestion["scene_potential"],
            "writing_advice": suggestion["writing_advice"],
            "missing_signals": suggestion["missing_signals"],
        }
        return {"status": "ok", "summary": "已生成关系补强建议，未写回原关系资产。", "suggestion": suggestion}

    async def build_relationship_repair_queue(self, scope: AgentScope, args: Dict[str, Any]) -> ToolObservation:
        limit = min(max(int(args.get("limit") or 3), 1), 5)
        include_enriched = bool(args.get("include_enriched"))
        result = await self.content_manager.search_content(
            ContentSearchRequest(
                query="",
                content_types=[ContentType.RELATIONSHIP],
                session_id=scope.session_id,
                limit=50,
                include_content=True,
            )
        )
        ranked: List[Dict[str, Any]] = []
        for item in result.items:
            if not _item_in_scope(item, scope):
                continue
            enriched = _is_enriched_relationship(item)
            if enriched and not include_enriched:
                continue
            text = _content_text(item) or json.dumps(_payload(item), ensure_ascii=False)
            diagnostics = _creative_diagnostics("relationship", _diagnostic_source_text(item, text), length=len(text))
            if diagnostics.get("relationship_creative_readiness") == "strong" and not include_enriched:
                continue
            score, reasons = _relationship_queue_score(item, diagnostics)
            suggestion = _relationship_repair_suggestion(item, diagnostics)
            suggestion.update(
                {
                    "queue_score": score,
                    "queue_reasons": reasons,
                    "queue_status": "pending",
                    "relationship_enriched": enriched,
                }
            )
            ranked.append(
                {
                    "id": item.metadata.id,
                    "type": "relationship",
                    "title": _title(item),
                    "summary": _clip(text, MAX_ASSET_SUMMARY),
                    "creative_diagnostics": diagnostics,
                    "diagnostic_summary": diagnostics["summary"],
                    "relationship_enriched": enriched,
                    "queue_score": score,
                    "queue_reasons": reasons,
                    "repair_suggestion": suggestion,
                }
            )

        ranked.sort(key=lambda row: int(row.get("queue_score") or 0), reverse=True)
        queue_items = ranked[:limit]
        for index, row in enumerate(queue_items, start=1):
            row["queue_rank"] = index
            if isinstance(row.get("repair_suggestion"), dict):
                row["repair_suggestion"]["queue_rank"] = index

        return ToolObservation(
            name="build_relationship_repair_queue",
            status="ok",
            summary=f"已生成 {len(queue_items)} 条核心关系补强队列。",
            items=queue_items,
        )

    async def search_project_assets(self, scope: AgentScope, args: Dict[str, Any]) -> ToolObservation:
        query = _clip(_as_str(args.get("query")), 120)
        limit = min(max(int(args.get("limit") or 5), 1), 8)
        include_ai_versions = bool(args.get("include_ai_versions"))
        requested_types = [_type_value(value) for value in args.get("types") or []]
        requested_types = [value for value in requested_types if value is not None]

        async def run_search(search_query: str) -> List[ContentItem]:
            result = await self.content_manager.search_content(
                ContentSearchRequest(
                    query=search_query,
                    content_types=requested_types or None,
                    session_id=scope.session_id,
                    limit=50,
                    include_content=True,
                )
            )
            return list(result.items)

        def sort_candidates(candidates: List[ContentItem]) -> List[ContentItem]:
            if requested_types and ContentType.RELATIONSHIP not in requested_types:
                return candidates
            return sorted(
                candidates,
                key=lambda candidate: (
                    0 if _is_enriched_relationship(candidate) else 1,
                    candidate.metadata.updated_at or "",
                ),
            )

        candidates = await run_search(query)
        items: List[Dict[str, Any]] = []
        for item in sort_candidates(candidates):
            if not _item_in_scope(item, scope):
                continue
            if item.metadata.type == ContentType.CHAPTER and not include_ai_versions and _is_ai_draft_or_candidate(item):
                continue
            text = _content_text(item) or json.dumps(_payload(item), ensure_ascii=False)
            item_type = _type_name(item.metadata.type)
            enriched_relationship = _is_enriched_relationship(item)
            diagnostics = _creative_diagnostics(
                item_type,
                _diagnostic_source_text(item, text),
                length=len(text),
            )
            repair_suggestion = (
                _relationship_repair_suggestion(item, diagnostics)
                if item_type == "relationship"
                and not enriched_relationship
                and diagnostics.get("relationship_creative_readiness") != "strong"
                else None
            )
            items.append(
                {
                    "id": item.metadata.id,
                    "type": item_type,
                    "title": _title(item),
                    "summary": _clip(text, MAX_ASSET_SUMMARY),
                    "creative_diagnostics": diagnostics,
                    "diagnostic_summary": diagnostics["summary"],
                    **({"relationship_enriched": True} if enriched_relationship else {}),
                    **({"repair_suggestion": repair_suggestion} if repair_suggestion else {}),
                }
            )
            if len(items) >= limit:
                break

        if not items and query:
            for item in sort_candidates(await run_search("")):
                if not _item_in_scope(item, scope):
                    continue
                if item.metadata.type == ContentType.CHAPTER and not include_ai_versions and _is_ai_draft_or_candidate(item):
                    continue
                text = _content_text(item) or json.dumps(_payload(item), ensure_ascii=False)
                item_type = _type_name(item.metadata.type)
                enriched_relationship = _is_enriched_relationship(item)
                diagnostics = _creative_diagnostics(
                    item_type,
                    _diagnostic_source_text(item, text),
                    length=len(text),
                )
                repair_suggestion = (
                    _relationship_repair_suggestion(item, diagnostics)
                    if item_type == "relationship"
                    and not enriched_relationship
                    and diagnostics.get("relationship_creative_readiness") != "strong"
                    else None
                )
                items.append(
                    {
                        "id": item.metadata.id,
                        "type": item_type,
                        "title": _title(item),
                        "summary": _clip(text, MAX_ASSET_SUMMARY),
                        "creative_diagnostics": diagnostics,
                        "diagnostic_summary": diagnostics["summary"],
                        **({"relationship_enriched": True} if enriched_relationship else {}),
                        **({"repair_suggestion": repair_suggestion} if repair_suggestion else {}),
                    }
                )
                if len(items) >= limit:
                    break

        return ToolObservation(
            name="search_project_assets",
            status="ok",
            summary=f"找到 {len(items)} 个项目资产，已附创作可用度诊断。",
            items=items,
        )

    async def get_asset_detail(self, scope: AgentScope, args: Dict[str, Any]) -> ToolObservation:
        asset_id = _as_str(args.get("asset_id"))
        if not asset_id:
            return ToolObservation(name="get_asset_detail", status="error", summary="缺少 asset_id")
        item = await self.content_manager.get_content(asset_id)
        if not item or not _item_in_scope(item, scope):
            return ToolObservation(name="get_asset_detail", status="error", summary="资产不存在或不属于当前项目")
        max_chars = min(max(int(args.get("max_chars") or MAX_DETAIL_CHARS), 120), MAX_DETAIL_CHARS)
        text = _content_text(item) or json.dumps(_payload(item), ensure_ascii=False)
        item_type = _type_name(item.metadata.type)
        enriched_relationship = _is_enriched_relationship(item)
        diagnostics = _creative_diagnostics(
            item_type,
            _diagnostic_source_text(item, text),
            length=len(text),
        )
        repair_suggestion = (
            _relationship_repair_suggestion(item, diagnostics)
            if item_type == "relationship"
            and not enriched_relationship
            and diagnostics.get("relationship_creative_readiness") != "strong"
            else None
        )
        return ToolObservation(
            name="get_asset_detail",
            status="ok",
            summary=f"读取资产：{_title(item)}。",
            items=[
                {
                    "id": item.metadata.id,
                    "type": item_type,
                    "title": _title(item),
                    "summary": _clip(text, max_chars),
                    "creative_diagnostics": diagnostics,
                    "diagnostic_summary": diagnostics["summary"],
                    **({"relationship_enriched": True} if enriched_relationship else {}),
                    **({"repair_suggestion": repair_suggestion} if repair_suggestion else {}),
                }
            ],
        )

    async def search_chapter_snippets(
        self,
        scope: AgentScope,
        args: Dict[str, Any],
        user_message: str,
    ) -> ToolObservation:
        query = _clip(_as_str(args.get("query")), 120)
        mode = _as_str(args.get("mode")) or "auto"
        if mode == "auto":
            mode = _snippet_mode(user_message)
        if mode not in {"start", "end", "keyword"}:
            mode = "keyword"
        limit = min(max(int(args.get("limit") or 3), 1), 5)
        include_ai_versions = bool(args.get("include_ai_versions"))

        result = await self.content_manager.search_content(
            ContentSearchRequest(
                query=query,
                content_type=ContentType.CHAPTER,
                session_id=scope.session_id,
                limit=80,
                include_content=True,
            )
        )
        candidates = [item for item in result.items if _item_in_scope(item, scope)]
        if not candidates and query:
            fallback = await self.content_manager.search_content(
                ContentSearchRequest(
                    query="",
                    content_type=ContentType.CHAPTER,
                    session_id=scope.session_id,
                    limit=80,
                    include_content=True,
                )
            )
            candidates = [item for item in fallback.items if _item_in_scope(item, scope)]

        def chapter_rank(item: ContentItem) -> tuple[int, str]:
            payload = _payload(item)
            if _is_imported_or_formal_chapter(item):
                return (0, str(payload.get("order") or payload.get("chapter_order") or item.metadata.created_at))
            if _is_ai_draft_or_candidate(item):
                return (5, str(item.metadata.created_at))
            return (2, str(payload.get("order") or item.metadata.created_at))

        snippets: List[Dict[str, Any]] = []
        for item in sorted(candidates, key=chapter_rank):
            if not include_ai_versions and _is_ai_draft_or_candidate(item):
                continue
            content = _content_text(item)
            snippet = _clip(_extract_snippet(content, query or user_message, mode), MAX_SNIPPET_CHARS)
            if not snippet:
                continue
            diagnostics = _creative_diagnostics("chapter", f"{_title(item)}\n{snippet}", length=len(content))
            snippets.append(
                {
                    "id": item.metadata.id,
                    "title": _title(item),
                    "mode": mode,
                    "summary": snippet,
                    "type": "chapter",
                    "creative_diagnostics": diagnostics,
                    "diagnostic_summary": diagnostics["summary"],
                }
            )
            if len(snippets) >= limit:
                break

        return ToolObservation(
            name="search_chapter_snippets",
            status="ok",
            summary=f"找到 {len(snippets)} 段章节片段（{mode}）。",
            items=snippets,
        )

    def get_recent_conversation(
        self,
        conversation: Optional[Conversation],
        args: Dict[str, Any],
        user_message: str,
    ) -> ToolObservation:
        limit = min(max(int(args.get("limit") or 6), 1), 8)
        if not conversation:
            return ToolObservation(name="get_recent_conversation", status="ok", summary="没有可读取的历史对话。")

        messages = list(conversation.messages)
        if messages and messages[-1].role == "user" and messages[-1].content == user_message:
            messages = messages[:-1]
        selected = messages[-limit:]
        items = [
            {
                "role": message.role,
                "title": message.role,
                "summary": _clip(message.content, 520),
            }
            for message in selected
            if message.content.strip()
        ]
        return ToolObservation(
            name="get_recent_conversation",
            status="ok",
            summary=f"读取最近 {len(items)} 条对话。",
            items=items,
        )

    def prepare_save_asset(self, args: Dict[str, Any]) -> ToolObservation:
        asset_type = _as_str(args.get("asset_type")) or "chapter"
        title = _as_str(args.get("title")) or "AI 写作草稿"
        reason = _as_str(args.get("reason")) or "本轮可能生成可保存内容。"
        return ToolObservation(
            name="prepare_save_asset",
            status="ok",
            summary="准备保存建议：最终回答如包含可落库章节，应附 save_asset 标签并等待用户确认。",
            items=[{"type": asset_type, "title": title, "summary": _clip(reason, MAX_TRACE_PREVIEW)}],
        )

    def prepare_chapter_update(self, args: Dict[str, Any]) -> ToolObservation:
        target_hint = _as_str(args.get("target_hint")) or "未指定"
        reason = _as_str(args.get("reason")) or "用户可能要改写已有章节。"
        return ToolObservation(
            name="prepare_chapter_update",
            status="ok",
            summary="准备覆盖建议：不得直接写库，必须生成 update_existing 保存建议并由用户确认。",
            items=[{"title": target_hint, "summary": _clip(reason, MAX_TRACE_PREVIEW)}],
        )

    def run_quality_check(self, args: Dict[str, Any]) -> ToolObservation:
        task = _as_str(args.get("task")) or "写作任务"
        checklist = [
            "人物欲望与伤痕是否驱动行动",
            "是否使用已提取关系张力和世界观规则",
            "场景是否有可感知的意象、情绪转折和余韵",
            "如生成章节，是否附带 save_asset 保存建议",
        ]
        return ToolObservation(
            name="run_quality_check",
            status="ok",
            summary=f"为任务准备 {len(checklist)} 条写作质量检查。",
            items=[{"title": "质量检查", "summary": "；".join(checklist), "task": _clip(task, 120)}],
        )

    def _build_context_block(self, observations: Sequence[ToolObservation]) -> str:
        parts: List[str] = []
        for observation in observations:
            if observation.status != "ok" or not observation.items:
                parts.append(f"- {observation.name}: {observation.summary}")
                continue

            parts.append(f"- {observation.name}: {observation.summary}")
            for item in observation.items[:6]:
                title = _as_str(item.get("title")) or _as_str(item.get("role")) or "条目"
                item_type = _as_str(item.get("type"))
                mode = _as_str(item.get("mode"))
                summary = _as_str(item.get("summary"))
                diagnostic_summary = _as_str(item.get("diagnostic_summary"))
                prefix = f"  * {title}"
                if item_type:
                    prefix += f" [{item_type}]"
                if mode:
                    prefix += f" ({mode})"
                detail = _clip(summary, 620)
                if diagnostic_summary:
                    detail = f"{detail} | 创作诊断：{diagnostic_summary}"
                repair = item.get("repair_suggestion")
                if isinstance(repair, dict):
                    detail = (
                        f"{detail} | 关系补强建议：{_clip(_as_str(repair.get('core')), 180)}；"
                        f"缺口：{_clip(_as_str(repair.get('weak_spots')), 80)}；"
                        f"写作建议：{_clip(_as_str(repair.get('writing_advice')), 120)}"
                    )
                parts.append(f"{prefix}: {detail}")

        block = "\n".join(parts)
        return _clip(block, MAX_AGENT_CONTEXT_CHARS)

    def _build_trace(
        self,
        plan: Dict[str, Any],
        observations: Sequence[ToolObservation],
        degraded: bool,
        *,
        mode: str = "rule_planner",
        fallback_reason: Optional[str] = None,
        stopped_reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        used_assets: List[Dict[str, Any]] = []
        chapter_snippets: List[Dict[str, Any]] = []
        tool_calls: List[Dict[str, Any]] = []
        diagnostics: List[Dict[str, Any]] = []
        relationship_repair_suggestions: List[Dict[str, Any]] = []
        relationship_repair_queue: List[Dict[str, Any]] = []
        for step_index, observation in enumerate(observations, start=1):
            is_last_step = step_index == len(observations)
            tool_calls.append(
                {
                    "name": observation.name,
                    "status": observation.status,
                    "summary": observation.summary,
                    "item_count": len(observation.items),
                    "step": step_index,
                    "continue_reason": (
                        f"停止：{stopped_reason}" if is_last_step and stopped_reason else "继续读取上下文"
                    ),
                }
            )
            for item in observation.items:
                if observation.name == "build_relationship_repair_queue":
                    repair = item.get("repair_suggestion")
                    if isinstance(repair, dict):
                        relationship_repair_queue.append(repair)
                    if item.get("creative_diagnostics"):
                        diagnostics.append(
                            {
                                "id": item.get("id"),
                                "type": item.get("type"),
                                "title": item.get("title"),
                                "summary": item.get("diagnostic_summary"),
                                "creative_diagnostics": item.get("creative_diagnostics"),
                            }
                        )
                    continue
                if observation.name == "search_chapter_snippets":
                    chapter_snippets.append(
                        {
                            "id": item.get("id"),
                            "title": item.get("title"),
                            "mode": item.get("mode"),
                            "preview": _clip(_as_str(item.get("summary")), MAX_TRACE_PREVIEW),
                            "creative_diagnostics": item.get("creative_diagnostics"),
                        }
                    )
                elif item.get("id"):
                    used_assets.append(
                        {
                            "id": item.get("id"),
                            "type": item.get("type"),
                            "title": item.get("title"),
                            "creative_diagnostics": item.get("creative_diagnostics"),
                            "relationship_enriched": item.get("relationship_enriched"),
                            "repair_suggestion": item.get("repair_suggestion"),
                        }
                    )
                if item.get("creative_diagnostics"):
                    diagnostics.append(
                        {
                            "id": item.get("id"),
                            "type": item.get("type") or ("chapter" if observation.name == "search_chapter_snippets" else None),
                            "title": item.get("title"),
                            "summary": item.get("diagnostic_summary"),
                            "creative_diagnostics": item.get("creative_diagnostics"),
                        }
                    )
                if item.get("type") == "relationship" and item.get("repair_suggestion"):
                    relationship_id = item["repair_suggestion"].get("relationship_id")
                    if not relationship_id or not any(
                        existing.get("relationship_id") == relationship_id for existing in relationship_repair_suggestions
                    ):
                        relationship_repair_suggestions.append(item["repair_suggestion"])

        coverage_counts = {
            "characters": sum(1 for item in used_assets if item.get("type") == "character"),
            "relationships": sum(1 for item in used_assets if item.get("type") == "relationship"),
            "world": sum(1 for item in used_assets if item.get("type") == "world"),
            "chapter_snippets": len(chapter_snippets),
        }
        relationship_assets = [item for item in used_assets if item.get("type") == "relationship"]
        relationship_quality_report = _relationship_quality_report(relationship_assets)
        retrieval_issues = []
        if coverage_counts["characters"] == 0:
            retrieval_issues.append("未找到足够角色资产")
        if coverage_counts["relationships"] == 0:
            retrieval_issues.append("未找到足够关系资产")
        elif relationship_quality_report["low_information_relationships"] > 0:
            retrieval_issues.append("关系资产薄弱：缺少依赖/亏欠/情绪张力/剧情功能等可写信号")
        if coverage_counts["world"] == 0:
            retrieval_issues.append("未找到足够世界观资产")
        if coverage_counts["chapter_snippets"] == 0:
            retrieval_issues.append("未找到足够章节片段")

        return {
            "enabled": True,
            "mode": mode,
            "plan_summary": plan.get("plan_summary") or "已按任务读取必要上下文。",
            "tool_calls": tool_calls,
            "used_assets": used_assets[:8],
            "chapter_snippets": chapter_snippets[:5],
            "retrieval_coverage": {
                "counts": coverage_counts,
                "issues": retrieval_issues,
            },
            "creative_diagnostics": diagnostics[:12],
            "relationship_quality_report": relationship_quality_report,
            "relationship_repair_queue": relationship_repair_queue[:3],
            "relationship_repair_suggestions": relationship_repair_suggestions[:5],
            "degraded": degraded,
            "fallback_reason": fallback_reason,
            "stopped_reason": stopped_reason,
            "max_tool_calls": MAX_TOOL_CALLS,
        }

    def _empty_trace(self, summary: str, degraded: bool = False) -> Dict[str, Any]:
        return {
            "enabled": False,
            "mode": "disabled",
            "plan_summary": summary,
            "tool_calls": [],
            "used_assets": [],
            "chapter_snippets": [],
            "retrieval_coverage": {
                "counts": {"characters": 0, "relationships": 0, "world": 0, "chapter_snippets": 0},
                "issues": [],
            },
            "creative_diagnostics": [],
            "relationship_quality_report": _relationship_quality_report([]),
            "relationship_repair_queue": [],
            "relationship_repair_suggestions": [],
            "degraded": degraded,
            "fallback_reason": None,
            "stopped_reason": None,
            "max_tool_calls": MAX_TOOL_CALLS,
        }
