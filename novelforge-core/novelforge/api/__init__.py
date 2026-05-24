"""
FastAPI Web API for NovelForge
鎻愪緵AI瑙勫垝銆佽鑹叉彁鍙栥€佷笘鐣屾瀯寤虹瓑Web API鎺ュ彛
"""

from fastapi import FastAPI, HTTPException, Query, status, File, UploadFile, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional, Literal, Set, Tuple
from datetime import datetime
import uuid
import json
import base64
import hashlib
import hmac
import html
import secrets
import time
from enum import Enum
from pathlib import Path
from contextlib import asynccontextmanager

from .types import (
    NovelType,
    LengthType,
    TargetAudience,
    PlotPosition,
    ImportanceLevel,
    StoryOutlineParams,
    CharacterDesignRequest,
    WorldBuildingRequest,
    PlotPoint,
    CharacterRole,
    StoryOutline,
    CharacterDesign,
    WorldSetting,
    ErrorResponse,
    ChatRequest,
    ChatResponse,
    StartConversationRequest,
    ExtractionRequest,
    Message,
    Conversation,
    GenerationRequest,
    GenerationResult,
    NovelGenerationRequest,
    NovelGenerationResult,
    AITask,
    TaskQueueRequest,
    TaskQueueResponse,
    TaskStatus,
    TaskPriority as APITaskPriority
)
from ..core.models import (
    Character, WorldSetting as WorldSettingModel, Timeline, RelationshipNetwork,
    CharacterRole as CharacterRoleEnum, RelationshipType, ExtractionResult, TimelineEvent, NetworkEdge
)
from ..extractors import UnifiedExtractor, ExtractionConfig
from ..services.extraction_service import get_extraction_service, ExtractionService
# FIXME: 瑙ｅ喅 TaskPriority 涓?api.types 鐨勫悓鍚嶅鍑哄啿绐?
from ..services.ai_scheduler import get_ai_scheduler, AITaskScheduler, TaskPriority as SchedulerTaskPriority
from ..services.ai_service import AIService

from ..core.config import Config
from .ai_planning_service import get_ai_planning_service, AIPlanningService
from ..storage.storage_manager import StorageManager
from ..content.manager import ContentManager
from ..content.models import (
    ContentCreateRequest,
    ContentExportRequest,
    ContentItem,
    ContentMetadata,
    ContentSearchRequest,
    ContentSearchResult,
    ContentUpdateRequest,
)
from .text_processing import router as text_processing_router


def _use_content_database(storage_type: Optional[str]) -> bool:
    normalized = (storage_type or "").strip().lower()
    if normalized in {"database", "content_db"}:
        return True
    if normalized in {"file", "memory"}:
        return False
    # Default to canonical content DB when config is absent/invalid.
    return True

# 鍏ㄥ眬閰嶇疆鍜孉I鏈嶅姟
config = Config.load()
ai_service = AIService(config)
ai_planning_service = get_ai_planning_service(ai_service)

SESSION_COOKIE_NAME = "novelforge_session"
SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
CHAT_STORAGE_TYPE = "file"


class AuthLoginRequest(BaseModel):
    password: str = Field(..., min_length=1)


def _auth_is_enabled() -> bool:
    return bool(getattr(config, "auth_required", False))


def _session_secret() -> str:
    return getattr(config, "session_secret", None) or "novelforge-local-dev-session-secret"


def _sign_session_payload(payload: str) -> str:
    return hmac.new(_session_secret().encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def _create_session_token() -> str:
    payload = json.dumps(
        {"sub": "admin", "iat": int(time.time()), "nonce": secrets.token_urlsafe(16)},
        separators=(",", ":"),
    )
    encoded = base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii").rstrip("=")
    return f"{encoded}.{_sign_session_payload(encoded)}"


def _decode_session_token(token: str) -> Optional[Dict[str, Any]]:
    if not token or "." not in token:
        return None
    encoded, signature = token.split(".", 1)
    if not hmac.compare_digest(signature, _sign_session_payload(encoded)):
        return None
    padded = encoded + "=" * (-len(encoded) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    except Exception:
        return None
    if not isinstance(payload, dict) or payload.get("sub") != "admin":
        return None
    issued_at = int(payload.get("iat") or 0)
    if issued_at <= 0 or int(time.time()) - issued_at > SESSION_MAX_AGE_SECONDS:
        return None
    return payload


def _request_is_authenticated(request: Request) -> bool:
    if not _auth_is_enabled():
        return True
    return _decode_session_token(request.cookies.get(SESSION_COOKIE_NAME, "")) is not None


def _is_public_path(path: str) -> bool:
    return (
        path == "/"
        or path == "/health"
        or path.startswith("/api/auth/")
    )


def _validate_public_deployment_config() -> None:
    if not getattr(config, "public_deployment", False):
        return

    missing = []
    if not getattr(config, "admin_password", None):
        missing.append("NOVELFORGE_ADMIN_PASSWORD")
    if not getattr(config, "session_secret", None):
        missing.append("NOVELFORGE_SESSION_SECRET")
    if not getattr(config, "api_key", None):
        missing.append("OPENAI_API_KEY")
    if getattr(config, "storage_type", "") != "content_db":
        missing.append("STORAGE_TYPE=content_db")
    if not getattr(config, "use_content_database", False):
        missing.append("USE_CONTENT_DATABASE=true")
    if missing:
        raise RuntimeError("公开部署配置不完整: " + ", ".join(missing))

    data_dir = Path(config.data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    probe = data_dir / ".novelforge_write_probe"
    probe.write_text("ok", encoding="utf-8")
    probe.unlink(missing_ok=True)

# 鍒涘缓鎻愬彇鍣ㄥ崗璋冨櫒
extractor_orchestrator = UnifiedExtractor(
    ai_service=ai_service,
    config=ExtractionConfig()
)

# 鍒涘缓瀛樺偍绠＄悊鍣?
# TODO: 寤鸿鍦ㄦ澶勬鏌ユ暟鎹瓨鍌ㄨ矾寰勬槸鍚﹀瓨鍦紝骞剁‘淇濆綋鍓嶈繘绋嬪叿澶囧啓鏉冮檺
storage_manager = StorageManager(
    default_storage=config.storage_type if config.storage_type in {"file", "memory", "database", "content_db"} else "file",
    file_storage_dir=config.file_storage_dir,
    database_path=config.database_path,
    content_db_path=config.content_database_path,
)

# 鍒涘缓鍐呭绠＄悊鍣?
content_manager = ContentManager(
    storage_manager,
    use_database=config.use_content_database or _use_content_database(config.storage_type),
)

# 鍒涘缓鎻愬彇鏈嶅姟
extraction_service = get_extraction_service(ai_service, config)

# 鍒涘缓AI璋冨害鍣?
ai_scheduler = get_ai_scheduler(ai_service, storage_manager, config, content_manager)


def _parse_openai_config_form_value(raw_value: Optional[str]) -> Optional[dict]:
    if not raw_value:
        return None

    try:
        parsed = json.loads(raw_value)
    except json.JSONDecodeError:
        return None

    return parsed if isinstance(parsed, dict) else None


def _decode_uploaded_text(content: bytes) -> str:
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件内容为空，无法提取",
        )

    # Support common Windows/Chinese novel encodings to avoid false 500 errors.
    for encoding in ("utf-8-sig", "utf-8", "gb18030", "utf-16"):
        try:
            text = content.decode(encoding)
            if text.strip():
                return text
        except UnicodeDecodeError:
            continue

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="无法识别文件编码，请使用 UTF-8、UTF-8 BOM、GB18030 或 UTF-16 编码后重试",
    )


def _get_edge_endpoint(edge: object, key: str) -> Optional[str]:
    if hasattr(edge, key):
        value = getattr(edge, key, None)
        return value if isinstance(value, str) and value.strip() else None
    if isinstance(edge, dict):
        value = edge.get(key)
        return value if isinstance(value, str) and value.strip() else None
    return None


def _normalize_topology_key(value: object) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = " ".join(value.strip().lower().split())
    return normalized or None


def _topology_payload(item: ContentItem) -> Dict[str, Any]:
    return item.extracted_data if isinstance(item.extracted_data, dict) else {}


def _content_type_value(value: object) -> str:
    if hasattr(value, "value"):
        return str(getattr(value, "value"))
    return str(value or "")


def _clean_title(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return html.unescape(value).strip()


def _normalize_relationship_type(value: object) -> str:
    raw = str(value or "other").strip()
    if "." in raw:
        raw = raw.rsplit(".", 1)[-1]
    key = raw.lower().replace("relationshiptype", "").strip("._- ")
    mapping = {
        "friend": "friendship",
        "friendship": "friendship",
        "family": "family",
        "lover": "romantic",
        "romantic": "romantic",
        "enemy": "conflict",
        "conflict": "conflict",
        "rival": "conflict",
        "mentor": "mentorship",
        "mentorship": "mentorship",
        "colleague": "professional",
        "professional": "professional",
        "ally": "alliance",
        "alliance": "alliance",
    }
    return mapping.get(key, key if key in {"family", "friendship", "romantic", "professional", "conflict", "alliance", "mentorship"} else "other")


def _as_string(value: object) -> Optional[str]:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _as_string_list(value: object) -> List[str]:
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if not isinstance(value, list):
        return []

    results: List[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            results.append(item.strip())
    return results


def _unique_strings(values: List[object]) -> List[str]:
    seen: Set[str] = set()
    results: List[str] = []
    for value in values:
        if isinstance(value, str):
            cleaned = value.strip()
            key = cleaned.lower()
            if cleaned and key not in seen:
                seen.add(key)
                results.append(cleaned)
    return results


def _first_nonempty(values: List[object]) -> Optional[str]:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, list):
            joined = "；".join(item.strip() for item in value if isinstance(item, str) and item.strip())
            if joined:
                return joined
    return None


def _extract_topology_lookup_keys(item: ContentItem) -> List[str]:
    payload = _topology_payload(item)
    aliases = _as_string_list(payload.get("aliases"))

    candidates = [
        item.metadata.id,
        item.metadata.title,
        payload.get("name"),
        payload.get("title"),
        payload.get("chapter_title"),
        payload.get("display_name"),
    ]

    keys: List[str] = []
    for candidate in [*candidates, *aliases]:
        if isinstance(candidate, str) and candidate.strip():
            keys.append(candidate.strip())
    return keys


def _build_topology_lookup(items: List[ContentItem]) -> Dict[str, str]:
    lookup: Dict[str, str] = {}

    for item in items:
        node_id = str(item.metadata.id)
        for key in _extract_topology_lookup_keys(item):
            normalized = _normalize_topology_key(key)
            if normalized and normalized not in lookup:
                lookup[normalized] = node_id

    return lookup


def _resolve_topology_target(reference: object, node_ids: Set[str], lookup: Dict[str, str]) -> Optional[str]:
    if not isinstance(reference, str) or not reference.strip():
        return None

    ref = reference.strip()
    if ref in node_ids:
        return ref

    return lookup.get(_normalize_topology_key(ref) or "")


def _collect_relation_references(item: ContentItem) -> List[Tuple[str, str]]:
    payload = _topology_payload(item)
    references: List[Tuple[str, str]] = []

    if isinstance(item.relations, dict):
        for relation_type, relation_targets in item.relations.items():
            if not isinstance(relation_type, str):
                continue
            for target in _as_string_list(relation_targets):
                references.append((relation_type, target))

    if item.metadata.type == "character":
        raw_relationships = payload.get("relationships")
        if isinstance(raw_relationships, list):
            for relationship in raw_relationships:
                if isinstance(relationship, dict):
                    target = relationship.get("target_name") or relationship.get("target") or relationship.get("name")
                    relation_type = relationship.get("relationship") or relationship.get("relationship_type") or "character"
                    if isinstance(target, str) and target.strip() and isinstance(relation_type, str) and relation_type.strip():
                        references.append((relation_type.strip(), target.strip()))
                elif isinstance(relationship, str) and relationship.strip():
                    references.append(("character", relationship.strip()))
        elif isinstance(raw_relationships, dict):
            for target in raw_relationships.keys():
                if isinstance(target, str) and target.strip():
                    references.append(("character", target.strip()))

    if item.metadata.type == "chapter":
        for target in _as_string_list(payload.get("characters")):
            references.append(("chapter_character", target))
        for target in _as_string_list(payload.get("locations")):
            references.append(("chapter_location", target))
        world_name = payload.get("world_name") or payload.get("world")
        if isinstance(world_name, str) and world_name.strip():
            references.append(("chapter_world", world_name.strip()))

    if item.metadata.type in {"outline", "novel"}:
        raw_character_roles = payload.get("characterRoles")
        if isinstance(raw_character_roles, list):
            for role in raw_character_roles:
                if isinstance(role, dict):
                    target = role.get("name")
                    if isinstance(target, str) and target.strip():
                        references.append(("outline_character", target.strip()))

        world_name = payload.get("world_name") or payload.get("world") or payload.get("setting_name")
        if isinstance(world_name, str) and world_name.strip():
            references.append(("outline_world", world_name.strip()))

    return references


def _world_fact_title(value: object) -> Optional[str]:
    if isinstance(value, str):
        return value.strip()[:80] or None
    if isinstance(value, dict):
        for key in ("name", "title", "location", "organization", "rule", "concept", "summary"):
            candidate = _as_string(value.get(key))
            if candidate:
                return candidate[:80]
        description = _as_string(value.get("description") or value.get("content"))
        if description:
            return description[:80]
    return None


def _build_world_semantic_nodes(world_id: str, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    facts: List[Tuple[str, object]] = []
    for fact_type in ("locations", "rules", "cultures", "organizations", "history", "themes", "concepts"):
        value = payload.get(fact_type)
        if isinstance(value, list):
            facts.extend((fact_type, item) for item in value[:20])
        elif isinstance(value, str) and value.strip():
            facts.append((fact_type, value))

    nodes: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    for index, (fact_type, fact) in enumerate(facts, start=1):
        title = _world_fact_title(fact)
        if not title:
            continue
        key = _normalize_topology_key(f"{fact_type}:{title}")
        if not key or key in seen:
            continue
        seen.add(key)
        nodes.append({
            "id": f"{world_id}::world_fact::{fact_type}::{index}",
            "type": f"world_{fact_type.rstrip('s')}",
            "title": title,
            "metadata": {
                "parent_id": world_id,
                "world_fact_type": fact_type,
                "importance": "medium",
            },
        })
    return nodes


def _resolve_runtime_ai_service(openai_config: Optional[dict] = None) -> AIService:
    if not openai_config:
        return ai_service

    ai_mode = openai_config.get("ai_mode")
    if not isinstance(ai_mode, str) or ai_mode not in {"fast", "pro"}:
        ai_mode = None

    if not getattr(config, "allow_runtime_openai_overrides", True):
        return ai_service.with_overrides(ai_mode=ai_mode) if ai_mode else ai_service

    api_key = openai_config.get("api_key")
    base_url = openai_config.get("base_url")
    model = openai_config.get("model")
    strict_model = openai_config.get("strict_model")
    if not isinstance(strict_model, bool):
        strict_model = None

    if not api_key and not base_url and not model and not ai_mode:
        return ai_service

    return ai_service.with_overrides(
        api_key=api_key,
        base_url=base_url,
        model=model,
        ai_mode=ai_mode,
        strict_model=strict_model,
    )


def _build_chat_system_prompt(context: Optional[Dict[str, Any]] = None) -> str:
    prompt_parts = [
        "你是一位专业小说创作助手，请根据用户请求和当前项目上下文生成内容。",
        "核心目标是把项目资产转化为真正可落地的创作成果：尤其是能写出动人、优美、有情绪张力的小说序章，并在创作过程中持续提供灵感、共情和情绪价值。",
        "创作时优先使用已提取资产中的角色欲望、伤痕、关系张力、关键事件、世界观规则、意象和伏笔；如果这些信息不足，先通过资产请求补足上下文。",
    ]

    if not context:
        return "\n".join(prompt_parts)

    system_prompt = context.get("system_prompt")
    if isinstance(system_prompt, str) and system_prompt.strip():
        prompt_parts.append(system_prompt.strip())

    project_summary = context.get("project_summary")
    if isinstance(project_summary, str) and project_summary.strip():
        prompt_parts.append("以下是当前项目的结构化上下文，请优先与它保持一致，并在此基础上补全。")
        prompt_parts.append(project_summary.strip())

    project_title = context.get("project_title")
    if isinstance(project_title, str) and project_title.strip():
        prompt_parts.append(f"当前项目标题：{project_title.strip()}")

    prompt_parts.append(
        "如果你继续创作前需要查看当前项目中的特定资产，请在回答末尾追加"
        " <asset_request>{\"types\":[\"character\",\"world\"],\"query\":\"关键词\",\"reason\":\"需要这些资产的原因\",\"limit\":3}</asset_request>。"
        " `types` 必须是合法 JSON 数组，只填写你当前真正需要的一种或多种资产类型。"
        " 这个结构块只用于向系统请求候选资产，不要在正文里解释标签本身。"
    )

    prompt_parts.append(
        "如果你建议新增或修改项目资产（角色、世界观、时间线、关系、大纲、章节/序章），请在回答末尾追加一个或多个"
        " <save_asset>{\"type\":\"chapter\",\"title\":\"序章\",\"data\":{\"content\":\"...\"}}</save_asset> 标签。"
        " `type` 必须是 character / world / timeline / relationship / outline / chapter 之一。"
        " `title` 为资产标题，`data` 为该资产的结构化数据。"
        " 用户确认后系统会将资产保存到项目内容库。"
        " 如果要修改已有资产，请在 data 中包含原始 id 字段。"
        " 不要在正文里解释标签本身，它们会被系统解析为可操作的保存建议。"
    )

    focused_assets = context.get("focused_assets")
    if isinstance(focused_assets, list):
        focused_lines: List[str] = []
        for index, asset in enumerate(focused_assets[:8], start=1):
            if not isinstance(asset, dict):
                continue

            asset_type = asset.get("type")
            title = asset.get("title")
            summary = asset.get("summary")

            title_text = title.strip() if isinstance(title, str) and title.strip() else f"资产 {index}"
            type_text = asset_type.strip() if isinstance(asset_type, str) and asset_type.strip() else "unknown"
            summary_text = summary.strip() if isinstance(summary, str) and summary.strip() else "暂无摘要"

            focused_lines.append(f"{index}. [{type_text}] {title_text}\n{summary_text}")

        if focused_lines:
            prompt_parts.append("本轮对话请优先参考以下当前聚焦资产，保持设定连续、关系一致、逻辑闭环：")
            prompt_parts.extend(focused_lines)

    focused_assets_summary = context.get("focused_assets_summary")
    if isinstance(focused_assets_summary, str) and focused_assets_summary.strip() and not isinstance(focused_assets, list):
        prompt_parts.append("本轮对话请优先参考以下当前聚焦资产，保持设定连续、关系一致、逻辑闭环：")
        prompt_parts.append(focused_assets_summary.strip())

    return "\n".join(prompt_parts)


def _resolve_runtime_ai_planning_service(openai_config: Optional[dict] = None) -> AIPlanningService:
    return AIPlanningService(_resolve_runtime_ai_service(openai_config))


def _resolve_runtime_extraction_service(openai_config: Optional[dict] = None) -> ExtractionService:
    return get_extraction_service(_resolve_runtime_ai_service(openai_config), config)


def _build_content_item_from_request(
    request: ContentCreateRequest | ContentUpdateRequest,
    *,
    content_id: Optional[str] = None,
    existing_item: Optional[ContentItem] = None,
) -> ContentItem:
    metadata_fields_set = getattr(request.metadata, "model_fields_set", set())
    request_fields_set = getattr(request, "model_fields_set", set())
    existing_metadata = existing_item.metadata if existing_item else None

    metadata = ContentMetadata(
        id=content_id or (existing_metadata.id if existing_metadata else str(uuid.uuid4())),
        title=request.metadata.title,
        type=request.metadata.type,
        status=request.metadata.status if "status" in metadata_fields_set else (existing_metadata.status if existing_metadata else request.metadata.status),
        author=request.metadata.author if "author" in metadata_fields_set else (existing_metadata.author if existing_metadata else None),
        tags=request.metadata.tags if "tags" in metadata_fields_set else (existing_metadata.tags if existing_metadata else []),
        created_at=existing_metadata.created_at if existing_metadata else datetime.now(),
        updated_at=datetime.now(),
        version=(existing_metadata.version + 1) if existing_metadata else 1,
        parent_id=request.metadata.parent_id if "parent_id" in metadata_fields_set else (existing_metadata.parent_id if existing_metadata else None),
        children_ids=request.metadata.children_ids if "children_ids" in metadata_fields_set else (existing_metadata.children_ids if existing_metadata else []),
        session_id=request.metadata.session_id if "session_id" in metadata_fields_set else (existing_metadata.session_id if existing_metadata else None),
    )
    return ContentItem(
        metadata=metadata,
        content=request.content if "content" in request_fields_set or not existing_item else existing_item.content,
        extracted_data=request.extracted_data if "extracted_data" in request_fields_set else (existing_item.extracted_data if existing_item else None),
        stats=request.stats if "stats" in request_fields_set else (existing_item.stats if existing_item else None),
        relations=request.relations if "relations" in request_fields_set else (existing_item.relations if existing_item else None),
    )


def _is_decorative_chapter(item: ContentItem, payload: Dict[str, Any]) -> bool:
    title = _clean_title(payload.get("chapter_title") or payload.get("title") or item.metadata.title).lower()
    text = (item.content or _as_string(payload.get("content")) or "").strip()
    decorative_tokens = ("插图", "illustration", "image", "封面")
    return len(text) <= 80 and any(token in title for token in decorative_tokens)


async def _next_chapter_index(parent_id: Optional[str], session_id: Optional[str]) -> int:
    result = await content_manager.search_content(ContentSearchRequest(
        content_type="chapter",
        parent_id=parent_id,
        session_id=session_id,
        limit=500,
        include_content=False,
    ))
    max_index = 0
    for item in result.items:
        payload = _topology_payload(item)
        raw_index = payload.get("chapter_index") or payload.get("index")
        try:
            max_index = max(max_index, int(raw_index))
        except (TypeError, ValueError):
            continue
    return max_index + 1


async def _normalize_content_item_for_write(item: ContentItem) -> ContentItem:
    payload: Dict[str, Any] = dict(item.extracted_data or {})
    item.metadata.title = _clean_title(item.metadata.title) or item.metadata.title
    content_type = _content_type_value(item.metadata.type)

    if content_type == "chapter":
        chapter_title = _clean_title(payload.get("chapter_title") or payload.get("title") or item.metadata.title)
        if chapter_title:
            item.metadata.title = chapter_title
            payload["chapter_title"] = chapter_title
        if not payload.get("chapter_index"):
            payload["chapter_index"] = await _next_chapter_index(item.metadata.parent_id, item.metadata.session_id)
        payload["is_decorative"] = bool(payload.get("is_decorative") or _is_decorative_chapter(item, payload))
        if "generated_by_ai" not in payload and ("ai-generated" in item.metadata.tags or "ai-suggested" in item.metadata.tags):
            payload["generated_by_ai"] = True

    if content_type == "relationship":
        rel_type = _normalize_relationship_type(payload.get("relationship_type") or payload.get("relationship"))
        payload["relationship_type"] = rel_type
        payload["relationship"] = rel_type
        evolution = _unique_strings([
            *(_as_string_list(payload.get("evolution"))),
            payload.get("tension"),
            payload.get("relationship_tension"),
        ])
        if evolution:
            payload["evolution"] = evolution[:6]
            payload.setdefault("relationship_tension", evolution[0])
        if not payload.get("confidence"):
            evidence_count = len(_as_string_list(payload.get("evidence")))
            payload["confidence"] = "high" if evidence_count >= 3 else "medium" if evidence_count >= 1 else "low"
        source = _as_string(payload.get("source"))
        target = _as_string(payload.get("target") or payload.get("target_name"))
        if source and target:
            item.metadata.title = f"{source} -> {target} ({rel_type})"

    if content_type == "character":
        quality = payload.get("extraction_quality") if isinstance(payload.get("extraction_quality"), dict) else {}
        creative = payload.get("creative_signals") if isinstance(payload.get("creative_signals"), dict) else {}
        aliases = _unique_strings([
            *(_as_string_list(payload.get("aliases"))),
            *(_as_string_list(quality.get("aliases") if isinstance(quality, dict) else None)),
            *(_as_string_list(payload.get("tags"))),
        ])
        if aliases:
            payload["aliases"] = aliases
        if "evidence" not in payload:
            evidence = _as_string_list(payload.get("source_contexts")) or _as_string_list(quality.get("evidence") if isinstance(quality, dict) else None)
            if evidence:
                payload["evidence"] = evidence[:8]
        if not payload.get("importance"):
            role = str(payload.get("role") or "").lower().rsplit(".", 1)[-1]
            payload["importance"] = "critical" if role == "protagonist" else "high" if role == "antagonist" else "medium" if role == "supporting" else "low"
        desires = _unique_strings([
            *(_as_string_list(payload.get("desires"))),
            *(_as_string_list(payload.get("goals"))),
            *(_as_string_list(creative.get("desires") if isinstance(creative, dict) else None)),
            *(_as_string_list(payload.get("behavior_examples"))),
        ])
        wounds = _unique_strings([
            *(_as_string_list(payload.get("fears"))),
            *(_as_string_list(payload.get("wounds"))),
            *(_as_string_list(creative.get("wounds") if isinstance(creative, dict) else None)),
        ])
        emotional_states = _unique_strings([
            *(_as_string_list(payload.get("emotional_states"))),
            *(_as_string_list(creative.get("emotional_states") if isinstance(creative, dict) else None)),
        ])
        voices = _unique_strings([
            *(_as_string_list(payload.get("voices"))),
            *(_as_string_list(creative.get("voices") if isinstance(creative, dict) else None)),
            *(_as_string_list(payload.get("example_dialogues"))),
        ])
        if desires:
            payload["desires"] = desires[:6]
            payload.setdefault("goals", desires[:4])
        if wounds:
            payload["wounds"] = wounds[:6]
            payload.setdefault("fears", wounds[:4])
        conflict = _first_nonempty([
            payload.get("conflict"),
            payload.get("conflicts"),
            wounds,
            desires,
        ])
        if conflict:
            payload["conflicts"] = _unique_strings([payload.get("conflicts"), conflict])[:4]
        tension = _first_nonempty([
            payload.get("personality_tension"),
            emotional_states,
            voices,
        ])
        if tension:
            payload["personality_tension"] = tension
        arc = _first_nonempty([
            payload.get("character_arc"),
            f"从「{wounds[0]}」走向「{desires[0]}」" if wounds and desires else None,
        ])
        if arc:
            payload["character_arc"] = arc
        hooks = _unique_strings([
            *(_as_string_list(payload.get("relationship_hooks"))),
            *(_as_string_list(payload.get("relationships"))),
        ])
        if hooks:
            payload["relationship_hooks"] = hooks[:6]
        name = _as_string(payload.get("name")) or item.metadata.title
        if any(separator in name for separator in ("与", "和", "+", "、")):
            payload["suspected_merged_character"] = True
        entity_hint = " ".join([str(payload.get("role_hint") or ""), str(payload.get("description") or ""), item.metadata.title]).lower()
        if any(token in entity_hint for token in ("组织", "机构", "团体", "company", "organization")):
            payload.setdefault("entity_type", "organization")
        else:
            payload.setdefault("entity_type", "person")

    if content_type == "world":
        semantic_nodes = _build_world_semantic_nodes(str(item.metadata.id), payload)
        if semantic_nodes:
            payload["semantic_nodes"] = [
                {
                    "id": node["id"],
                    "type": node["type"],
                    "title": node["title"],
                    "world_fact_type": node.get("metadata", {}).get("world_fact_type"),
                }
                for node in semantic_nodes
            ]

    item.extracted_data = payload or item.extracted_data
    return item

# 鍒濆鍖朏astAPI搴旂敤
@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_public_deployment_config()
    yield


app = FastAPI(
    title="NovelForge AI Planning API",
    description="AI-driven story planning and creative workflow API.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS閰嶇疆
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3010",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:3010",
        config.frontend_origin,
    ],  # 鍓嶇寮€鍙戞湇鍔″櫒
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_admin_session(request: Request, call_next):
    if request.method == "OPTIONS" or _is_public_path(request.url.path):
        return await call_next(request)
    if not _request_is_authenticated(request):
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"error": "未登录", "detail": "请先登录 NovelForge 管理员账号"},
        )
    return await call_next(request)

# 鎸傝浇瀛愯矾鐢?
app.include_router(text_processing_router, prefix="/api")

# API璺敱

@app.get("/")
async def root():
    """API鏍硅矾寰?"""
    return {
        "message": "NovelForge AI Planning API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health")
async def health_check():
    """鍋ュ悍妫€鏌?"""
    return {"status": "healthy", "timestamp": datetime.now()}


@app.post("/api/auth/login")
async def login(request: AuthLoginRequest):
    """Single-admin login for public deployments."""
    configured_password = getattr(config, "admin_password", None)
    if _auth_is_enabled() and not configured_password:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="管理员密码未配置",
        )
    if configured_password and not secrets.compare_digest(request.password, configured_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="管理员密码错误",
        )

    response = JSONResponse({"authenticated": True, "mode": "admin"})
    response.set_cookie(
        SESSION_COOKIE_NAME,
        _create_session_token(),
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        secure=bool(getattr(config, "public_deployment", False)),
        samesite="lax",
        path="/",
    )
    return response


@app.post("/api/auth/logout")
async def logout():
    response = JSONResponse({"authenticated": False})
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return response


@app.get("/api/auth/me")
async def get_current_auth(request: Request):
    authenticated = _request_is_authenticated(request)
    return {
        "authenticated": authenticated,
        "auth_required": _auth_is_enabled(),
        "mode": "admin" if authenticated else None,
        "public_deployment": bool(getattr(config, "public_deployment", False)),
        "runtime_openai_overrides_allowed": bool(getattr(config, "allow_runtime_openai_overrides", True)),
    }

# AI瑙勫垝鐩稿叧绔偣

@app.post("/api/ai/generate-story-outline", response_model=StoryOutline)
async def generate_story_outline(params: StoryOutlineParams):
    """鐢熸垚鏁呬簨鏋舵瀯"""
    try:
        # 璋冪敤AI瑙勫垝鏈嶅姟鐢熸垚鏁呬簨鏋舵瀯
        runtime_ai_planning_service = _resolve_runtime_ai_planning_service(params.openai_config)
        outline = await runtime_ai_planning_service.generate_story_outline(params)
        return outline
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"鏁呬簨鏋舵瀯鐢熸垚澶辫触: {str(e)}"
        )

@app.post("/api/ai/design-characters", response_model=List[CharacterDesign])
async def design_characters(request: CharacterDesignRequest):
    """璁捐瑙掕壊"""
    try:
        # 璋冪敤AI瑙勫垝鏈嶅姟璁捐瑙掕壊
        runtime_ai_planning_service = _resolve_runtime_ai_planning_service(request.openai_config)
        characters = await runtime_ai_planning_service.design_characters(
            request.context, request.roles
        )
        return characters
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"瑙掕壊璁捐澶辫触: {str(e)}"
        )

@app.post("/api/ai/build-world-setting", response_model=WorldSetting)
async def build_world_setting(request: WorldBuildingRequest):
    """鏋勫缓涓栫晫璁惧畾"""
    try:
        # 璋冪敤AI瑙勫垝鏈嶅姟鏋勫缓涓栫晫璁惧畾
        runtime_ai_planning_service = _resolve_runtime_ai_planning_service(request.openai_config)
        world_setting = await runtime_ai_planning_service.build_world_setting(
            request.story_outline
        )
        return world_setting
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"涓栫晫鏋勫缓澶辫触: {str(e)}"
        )

# 宸ヤ綔娴佺鐞嗙鐐?

@app.post("/api/workflow/start-process")
async def start_workflow_process(ai_plan: dict, source_text: Optional[str] = None):
    """鍚姩瀹屾暣宸ヤ綔娴佸鐞?"""
    try:
        # TODO: 姝ゅ灏氭湭鎺ュ叆瀹為檯宸ヤ綔娴佺郴缁燂紝鐩墠浠呯敓鎴愪簡涓€涓ā鎷熺殑浠诲姟ID
        task_id = str(uuid.uuid4())
        return {
            "taskId": task_id,
            "status": "started",
            "message": "宸ヤ綔娴佸凡鍚姩"
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"宸ヤ綔娴佸惎鍔ㄥけ璐? {str(e)}"
        )


@app.get("/api/workflow/status/{task_id}")
async def get_workflow_status(task_id: str):
    """鑾峰彇宸ヤ綔娴佺姸鎬?"""
    try:
        # TODO: 姝ゅ搴斿疄鐜板鎺ヤ换鍔＄鐞嗗櫒鐨勭湡瀹炵姸鎬佹煡璇㈤€昏緫
        return {
            "taskId": task_id,
            "status": "completed",  # 鎴?"running", "error"
            "progress": 100,
            "result": {},
            "message": "宸ヤ綔娴佸凡瀹屾垚"
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"鑾峰彇宸ヤ綔娴佺姸鎬佸け璐? {str(e)}"
        )


# 鏂囨湰鎻愬彇鐩稿叧绔偣

# FIXME: 宸茬Щ闄ら噸澶嶅畾涔夌殑澶氫綑鐨?@app.post 璺敱瑁呴グ鍣?
@app.post("/api/extract/text", response_model=ExtractionResult)
async def extract_from_text(request: ExtractionRequest):
   """浠庢枃鏈腑鎻愬彇瑙掕壊銆佷笘鐣岃瀹氥€佹椂闂寸嚎鍜屽叧绯荤綉缁?"""
   try:
       text = request.text.strip() if request.text else ""
       if not text:
           raise HTTPException(
               status_code=status.HTTP_400_BAD_REQUEST,
               detail="鏂囨湰鍐呭涓嶈兘涓虹┖"
           )
       
       # 浣跨敤鎻愬彇鏈嶅姟杩涜鎻愬彇锛岃繑鍥炵粺涓€鐨?dict 缁撴瀯
       runtime_extraction_service = _resolve_runtime_extraction_service(
           request.openai_config.model_dump(exclude_none=True) if request.openai_config else None
       )
       extraction_result = await runtime_extraction_service.extract_all(text)
       extraction_errors = extraction_result.get("errors", [])
       relationships = extraction_result.get("relationships", [])
       nodes = list(
           {
               endpoint
               for edge in relationships
               for endpoint in (_get_edge_endpoint(edge, "source"), _get_edge_endpoint(edge, "target"))
               if endpoint
           }
       )
       
       # 鏋勫缓杩斿洖缁撴灉
       result = ExtractionResult(
           characters=extraction_result.get("characters", []),
           world=extraction_result.get("world_setting", None),
           timeline=Timeline(
               events=extraction_result.get("timeline_events", []),
               total_events=len(extraction_result.get("timeline_events", []))
           ),
           relationships=RelationshipNetwork(
               edges=relationships,
               nodes=nodes,
               total_relationships=len(relationships)
           ),
           success=len(extraction_errors) == 0,
           errors=extraction_errors if isinstance(extraction_errors, list) else []
       )
       
       return result
   except HTTPException:
       raise
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"鏂囨湰鎻愬彇澶辫触: {str(e)}"
       )

@app.post("/api/extract/file", response_model=ExtractionResult)
async def extract_from_file(
    file: UploadFile = File(...),
    openai_config: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
):
   """浠庢枃浠朵腑鎻愬彇瑙掕壊銆佷笘鐣岃瀹氥€佹椂闂寸嚎鍜屽叧绯荤綉缁?"""
   try:
       # 妫€鏌ユ枃浠剁被鍨?
       filename = file.filename or ""
       if not filename.lower().endswith(('.txt', '.md', '.text')):
           raise HTTPException(
               status_code=status.HTTP_400_BAD_REQUEST,
               detail="鍙敮鎸佹枃鏈枃浠?.txt, .md, .text)"
           )
       
       # 璇诲彇鏂囦欢鍐呭
       content = await file.read()
       text = _decode_uploaded_text(content)
       
       # 浣跨敤鎻愬彇鏈嶅姟杩涜鎻愬彇锛岃繑鍥炵粺涓€鐨?dict 缁撴瀯
       runtime_extraction_service = _resolve_runtime_extraction_service(_parse_openai_config_form_value(openai_config))
       extraction_result = await runtime_extraction_service.extract_all(text)
       extraction_errors = extraction_result.get("errors", [])
       relationships = extraction_result.get("relationships", [])
       nodes = list(
           {
               endpoint
               for edge in relationships
               for endpoint in (_get_edge_endpoint(edge, "source"), _get_edge_endpoint(edge, "target"))
               if endpoint
           }
       )
       
       # 鏋勫缓杩斿洖缁撴灉
       result = ExtractionResult(
           characters=extraction_result.get("characters", []),
           world=extraction_result.get("world_setting", None),
           timeline=Timeline(
               events=extraction_result.get("timeline_events", []),
               total_events=len(extraction_result.get("timeline_events", []))
           ),
           relationships=RelationshipNetwork(
               edges=relationships,
               nodes=nodes,
               total_relationships=len(relationships)
           ),
           success=len(extraction_errors) == 0,
           errors=extraction_errors if isinstance(extraction_errors, list) else []
       )
       
       return result
   except HTTPException:
       raise
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"鏂囦欢鎻愬彇澶辫触: {str(e)}"
       )


# 鍗曠嫭鎻愬彇鐩稿叧绔偣
@app.post("/api/extract/characters", response_model=List[Character])
async def extract_characters(request: ExtractionRequest):
  """鍗曠嫭鎻愬彇瑙掕壊"""
  try:
      text = request.text
      if not text:
          raise HTTPException(
              status_code=status.HTTP_400_BAD_REQUEST,
              detail="鏂囨湰鍐呭涓嶈兘涓虹┖"
          )
      
      runtime_extraction_service = _resolve_runtime_extraction_service(
          request.openai_config.model_dump(exclude_none=True) if request.openai_config else None
      )
      characters = await runtime_extraction_service.extract_characters(text)
      return characters
  except HTTPException:
      raise
  except Exception as e:
      raise HTTPException(
          status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
          detail=f"瑙掕壊鎻愬彇澶辫触: {str(e)}"
      )


@app.post("/api/extract/world-setting", response_model=WorldSetting)
async def extract_world_setting(request: ExtractionRequest):
  """鍗曠嫭鎻愬彇涓栫晫璁惧畾"""
  try:
      text = request.text
      if not text:
          raise HTTPException(
              status_code=status.HTTP_400_BAD_REQUEST,
              detail="鏂囨湰鍐呭涓嶈兘涓虹┖"
          )
      
      runtime_extraction_service = _resolve_runtime_extraction_service(
          request.openai_config.model_dump(exclude_none=True) if request.openai_config else None
      )
      world_setting = await runtime_extraction_service.extract_world_setting(text)
      return world_setting
  except HTTPException:
      raise
  except Exception as e:
      raise HTTPException(
          status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
          detail=f"涓栫晫璁惧畾鎻愬彇澶辫触: {str(e)}"
      )


@app.post("/api/extract/timeline", response_model=List[TimelineEvent])
async def extract_timeline(request: ExtractionRequest):
  """鍗曠嫭鎻愬彇鏃堕棿绾?"""
  try:
      text = request.text
      if not text:
          raise HTTPException(
              status_code=status.HTTP_400_BAD_REQUEST,
              detail="鏂囨湰鍐呭涓嶈兘涓虹┖"
          )
      
      runtime_extraction_service = _resolve_runtime_extraction_service(
          request.openai_config.model_dump(exclude_none=True) if request.openai_config else None
      )
      timeline_events = await runtime_extraction_service.extract_timeline(text)
      return timeline_events
  except HTTPException:
      raise
  except Exception as e:
      raise HTTPException(
          status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
          detail=f"鏃堕棿绾挎彁鍙栧け璐? {str(e)}"
      )


@app.post("/api/extract/relationships", response_model=List[NetworkEdge])
async def extract_relationships(request: ExtractionRequest):
  """鍗曠嫭鎻愬彇鍏崇郴缃戠粶"""
  try:
      text = request.text
      if not text:
          raise HTTPException(
              status_code=status.HTTP_400_BAD_REQUEST,
              detail="鏂囨湰鍐呭涓嶈兘涓虹┖"
          )
      
      runtime_extraction_service = _resolve_runtime_extraction_service(
          request.openai_config.model_dump(exclude_none=True) if request.openai_config else None
      )
      relationships = await runtime_extraction_service.extract_relationships(text)
      return relationships
  except HTTPException:
      raise
  except Exception as e:
      raise HTTPException(
          status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
          detail=f"鍏崇郴缃戠粶鎻愬彇澶辫触: {str(e)}"
      )


# AI瀵硅瘽鍒涗綔鐩稿叧绔偣
@app.post("/api/chat/start-conversation", response_model=Conversation)
async def start_conversation(request: Optional[StartConversationRequest] = None):
   """寮€濮嬫柊瀵硅瘽"""
   try:
       title = (request.title.strip() if request and isinstance(request.title, str) else "") or "新创作项目"
       metadata = request.metadata if request and isinstance(request.metadata, dict) else {}
       conversation = Conversation(
           title=title,
           messages=[],
           metadata={"type": "novel_creation", **metadata}
       )
       # 保存到存储
       saved = await storage_manager.save(
           f"conversation_{conversation.id}",
           conversation.model_dump(),
           storage_type=CHAT_STORAGE_TYPE,
       )
       if not saved:
           raise RuntimeError("瀵硅瘽淇濆瓨澶辫触")
       return conversation
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"寮€濮嬪璇濆け璐? {str(e)}"
       )


@app.post("/api/chat/send-message", response_model=ChatResponse)
async def send_message(request: ChatRequest):
   """鍙戦€佹秷鎭埌AI"""
   try:
       conversation_id = request.conversation_id
       if not conversation_id:
           # 创建新对话
           conversation = Conversation(
               title="AI创作对话",
               messages=[],
               metadata={"type": "novel_creation"},
           )
           conversation_id = conversation.id
           saved = await storage_manager.save(
               f"conversation_{conversation_id}",
               conversation.model_dump(),
               storage_type=CHAT_STORAGE_TYPE,
           )
           if not saved:
               raise RuntimeError("对话初始化失败")
       else:
           # 鍔犺浇鐜版湁瀵硅瘽
           loaded = await storage_manager.load(f"conversation_{conversation_id}", storage_type=CHAT_STORAGE_TYPE)
           if loaded:
               conversation = Conversation(**loaded)
           else:
               raise HTTPException(
                   status_code=status.HTTP_404_NOT_FOUND,
                   detail="对话不存在"
               )
       
       # 娣诲姞鐢ㄦ埛娑堟伅
       user_message = Message(role="user", content=request.message)
       conversation.messages.append(user_message)
       
       # 璋冪敤AI鏈嶅姟鑾峰彇鍝嶅簲
       system_prompt = _build_chat_system_prompt(request.context)

       runtime_ai_service = _resolve_runtime_ai_service(
           request.openai_config.model_dump(exclude_none=True) if request.openai_config else None
       )
       
       ai_response = await runtime_ai_service.chat(
           prompt=request.message,
           system_prompt=system_prompt
       )
       
       # 娣诲姞AI鍝嶅簲
       ai_message = Message(role="assistant", content=ai_response)
       conversation.messages.append(ai_message)
       
       # 鏇存柊瀵硅瘽鏃堕棿鎴?
       conversation.updated_at = datetime.now()
       
       # 淇濆瓨鏇存柊鐨勫璇?
       saved = await storage_manager.save(
           f"conversation_{conversation_id}",
           conversation.model_dump(),
           storage_type=CHAT_STORAGE_TYPE,
       )
       if not saved:
           raise RuntimeError("瀵硅瘽鏇存柊澶辫触")
       
       # 鐢熸垚寤鸿鍥炲
       suggestions = []
       if len(ai_response) > 100:
           # 绠€鍗曠殑寤鸿鐢熸垚閫昏緫锛屽疄闄呭簲鐢ㄤ腑鍙敤AI鐢熸垚
           suggestions = [
               "请继续这个情节",
               "能详细描述一下人物感受吗？",
               "这个设定很有趣，能展开说说吗？"
           ]
       
       response = ChatResponse(
           conversation_id=conversation_id,
           message=ai_message,
           context=request.context,
           suggestions=suggestions
       )
       return response
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"鍙戦€佹秷鎭け璐? {str(e)}"
       )


@app.get("/api/chat/conversation/{conversation_id}", response_model=Conversation)
async def get_conversation(conversation_id: str):
   """Get one conversation by id."""
   try:
       loaded = await storage_manager.load(f"conversation_{conversation_id}", storage_type=CHAT_STORAGE_TYPE)
       if not loaded:
           raise HTTPException(
               status_code=status.HTTP_404_NOT_FOUND,
               detail="Conversation not found",
           )
       return Conversation(**loaded)
   except HTTPException:
       raise
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"閼惧嘲褰囩€电鐦芥径杈Е: {str(e)}"
       )


@app.post("/api/chat/send-message-stream")
async def send_chat_message_stream(request: ChatRequest):
    conversation_id = request.conversation_id or str(uuid.uuid4())
    runtime_ai_service = _resolve_runtime_ai_service(request.openai_config)
    conversation = await storage_manager.load(f"conversation_{conversation_id}", storage_type=CHAT_STORAGE_TYPE)

    if not conversation:
        conversation = Conversation(id=conversation_id, title="新对话")

    user_message = Message(role="user", content=request.message)
    conversation.messages.append(user_message)
    conversation.updated_at = datetime.now()
    await storage_manager.save(
        f"conversation_{conversation_id}",
        conversation.model_dump(),
        storage_type=CHAT_STORAGE_TYPE,
    )

    async def event_generator():
        assistant_content = ""
        assistant_thinking = ""
        try:
            async for event in runtime_ai_service.chat_stream(
                prompt=request.message,
                system_prompt=_build_chat_system_prompt(request.context),
            ):
                if event["type"] == "thinking_delta":
                    assistant_thinking += event["delta"]
                elif event["type"] == "content_delta":
                    assistant_content += event["delta"]
                elif event["type"] == "message_complete":
                    assistant_content = event.get("content", assistant_content)
                    assistant_thinking = event.get("thinking", assistant_thinking)

                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

            assistant_message = Message(role="assistant", content=assistant_content)
            conversation.messages.append(assistant_message)
            conversation.updated_at = datetime.now()
            await storage_manager.save(
                f"conversation_{conversation_id}",
                conversation.model_dump(),
                storage_type=CHAT_STORAGE_TYPE,
            )

            yield f"data: {json.dumps({'type': 'persisted', 'conversation_id': conversation_id, 'message_id': assistant_message.id}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/chat/conversations", response_model=List[Conversation])
async def get_conversations():
   """鍒楀嚭鎵€鏈夊璇?"""
   try:
       all_keys = await storage_manager.list_keys(storage_type=CHAT_STORAGE_TYPE)
       conversation_keys = [key for key in all_keys if key.startswith("conversation_")]
       conversations = []
       for key in conversation_keys:
           loaded = await storage_manager.load(key, storage_type=CHAT_STORAGE_TYPE)
           if loaded:
               conversations.append(Conversation(**loaded))
       conversations.sort(key=lambda item: item.updated_at, reverse=True)
       return conversations
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"鑾峰彇瀵硅瘽鍒楄〃澶辫触: {str(e)}"
       )


@app.delete("/api/chat/conversations/empty", response_model=dict)
async def cleanup_empty_conversations():
   """Delete conversations that have no messages and no content assets."""
   try:
       all_keys = await storage_manager.list_keys(storage_type=CHAT_STORAGE_TYPE)
       conversation_keys = [key for key in all_keys if key.startswith("conversation_")]
       deleted_ids: List[str] = []

       for key in conversation_keys:
           loaded = await storage_manager.load(key, storage_type=CHAT_STORAGE_TYPE)
           if not loaded:
               continue

           conversation = Conversation(**loaded)
           if conversation.messages:
               continue

           content_result = await content_manager.search_content(
               ContentSearchRequest(session_id=conversation.id, limit=1)
           )
           if content_result.total > 0:
               continue

           await storage_manager.delete(key, storage_type=CHAT_STORAGE_TYPE)
           deleted_ids.append(conversation.id)

       return {
           "success": True,
           "deleted": len(deleted_ids),
           "deleted_ids": deleted_ids,
       }
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"清理空项目失败: {str(e)}"
       )


@app.delete("/api/chat/conversations/{conversation_id}", response_model=dict)
async def delete_conversation(conversation_id: str):
   """鍒犻櫎瀵硅瘽鍙婂叾鍏宠仈鍐呭"""
   try:
       loaded = await storage_manager.load(f"conversation_{conversation_id}", storage_type=CHAT_STORAGE_TYPE)
       if not loaded:
           raise HTTPException(
               status_code=status.HTTP_404_NOT_FOUND,
               detail="对话不存在"
           )
       await storage_manager.delete(f"conversation_{conversation_id}", storage_type=CHAT_STORAGE_TYPE)
       await content_manager.delete_by_session(conversation_id)
       return {
           "success": True,
           "message": "瀵硅瘽鍒犻櫎鎴愬姛"
       }
   except HTTPException:
       raise
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"鍒犻櫎瀵硅瘽澶辫触: {str(e)}"
       )


@app.post("/api/openai/models", response_model=dict)
async def list_openai_models(payload: Optional[dict] = None):
   """鍒楀嚭褰撳墠 OpenAI 鍏煎閰嶇疆鍙敤鐨勬ā鍨?"""
   try:
       payload = payload or {}
       openai_config = payload.get("openai_config") or {}
       runtime_service = _resolve_runtime_ai_service(openai_config)
       models = await runtime_service.list_models()
       return {
           "models": models,
           "current_model": runtime_service.config.model,
           "base_url": runtime_service.config.base_url,
           "using_default_config": not bool(openai_config),
       }
   except ValueError as e:
       raise HTTPException(
           status_code=status.HTTP_400_BAD_REQUEST,
           detail=str(e)
       )
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"鑾峰彇妯″瀷鍒楄〃澶辫触: {str(e)}"
       )


@app.post("/api/generate/novel", response_model=NovelGenerationResult)
async def generate_novel_content(request: NovelGenerationRequest):
   """鐢熸垚鏂板皬璇村唴瀹?"""
   try:
       # 鏋勫缓鐢熸垚鎻愮ず
       story_context = request.story_context
       context_info = f"鏁呬簨涓婁笅鏂? {story_context}"
       
       prompt_parts = []
       prompt_parts.append(context_info)
       prompt_parts.append(f"鐢熸垚绫诲瀷: {request.generation_type}")
       prompt_parts.append(f"目标长度: {request.target_length} 字")
       
       if request.focus_on:
           prompt_parts.append(f"閲嶇偣鍏虫敞: {', '.join(request.focus_on)}")
       
       if request.exclude_elements:
           prompt_parts.append(f"鎺掗櫎鍏冪礌: {', '.join(request.exclude_elements)}")
       
       prompt_parts.append("请生成高质量小说内容，确保情节连贯、人物生动并符合上下文。")
       
       prompt = "\n".join(prompt_parts)
       runtime_ai_service = _resolve_runtime_ai_service(
           request.openai_config.model_dump(exclude_none=True) if request.openai_config else None
       )

       # 璋冪敤AI鏈嶅姟鐢熸垚鍐呭
       generated_text = await runtime_ai_service.chat(
           prompt=prompt,
           system_prompt="你是一位专业小说作者，擅长创作高质量且连贯的情节。",
           max_tokens=request.target_length // 4,
        )
       
       # 鍒涘缓鐢熸垚缁撴灉
       result = NovelGenerationResult(
           generated_text=generated_text,
           extracted_characters=[],  # 鍙互杩涗竴姝ユ彁鍙栫敓鎴愬唴瀹逛腑鐨勮鑹?
           extracted_events=[],      # 鍙互杩涗竴姝ユ彁鍙栫敓鎴愬唴瀹逛腑鐨勪簨浠?
           quality_metrics={"coherence": 0.8, "originality": 0.7, "relevance": 0.9},
           timeline=[],
           relationships=[],
           created_at=datetime.now()
       )
       
       return result
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"灏忚鍐呭鐢熸垚澶辫触: {str(e)}"
       )


@app.post("/api/generate/text", response_model=GenerationResult)
async def generate_text(request: GenerationRequest):
   """閫氱敤鏂囨湰鐢熸垚"""
   try:
       runtime_ai_service = _resolve_runtime_ai_service(
           request.openai_config.model_dump(exclude_none=True) if request.openai_config else None
       )

       # 浣跨敤AI鏈嶅姟鐢熸垚鏂囨湰
       generated_text = await runtime_ai_service.chat(
           prompt=request.prompt,
           system_prompt="你是一位高质量文本生成助手，请按用户要求输出内容。",
           temperature=request.temperature,
           max_tokens=request.length // 4 if request.length else 1000
       )
       
       result = GenerationResult(
           content=generated_text,
           quality_score=0.8,  # 鍙互鐢ㄨ川閲忚瘎浼版湇鍔℃潵璁＄畻
           extracted_elements={} if request.extract_info else None,
           metrics={
               "length": len(generated_text),
               "tokens": len(generated_text) // 4,
               "extract_info_requested": request.extract_info,
           }
       )
       return result
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"鏂囨湰鐢熸垚澶辫触: {str(e)}"
       )


# 鍚姩AI璋冨害鍣ㄧ殑鍑芥暟
async def start_scheduler():
    await ai_scheduler.start()


# AI璋冨害绯荤粺鐩稿叧绔偣
@app.post("/api/task/queue", response_model=TaskQueueResponse)
async def queue_task(request: TaskQueueRequest):
   """灏嗕换鍔℃坊鍔犲埌闃熷垪"""
   try:
       task = AITask(
           type=request.task_type,
           parameters=request.parameters,
           priority=request.priority
       )
       
       # 淇濆瓨浠诲姟
       await storage_manager.save(f"task_{task.id}", task.model_dump())
       
       response = TaskQueueResponse(
           task_id=task.id,
           status=task.status,
           message="浠诲姟宸叉坊鍔犲埌闃熷垪"
       )
       return response
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"浠诲姟闃熷垪澶辫触: {str(e)}"
       )


@app.get("/api/task/{task_id}", response_model=AITask)
async def get_basic_task_status(task_id: str):
    """鑾峰彇浠诲姟鐘舵€?"""
    loaded = await storage_manager.load(f"task_{task_id}")
    if not loaded:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    return AITask(**loaded)


@app.post("/api/task/{task_id}/execute")
async def execute_task(task_id: str):
   """鎵ц浠诲姟锛堟ā鎷燂級"""
   try:
       loaded = await storage_manager.load(f"task_{task_id}")
       if not loaded:
           raise HTTPException(
               status_code=status.HTTP_404_NOT_FOUND,
               detail="任务不存在"
           )
       
       task = AITask(**loaded)
       if task.status != TaskStatus.PENDING:
           raise HTTPException(
               status_code=status.HTTP_400_BAD_REQUEST,
               detail="任务状态不是待执行"
           )
       
       # 鏇存柊浠诲姟鐘舵€佷负杩愯涓?
       task.status = TaskStatus.RUNNING
       task.started_at = datetime.now()
       await storage_manager.save(f"task_{task_id}", task.model_dump())
       
       # 鏍规嵁浠诲姟绫诲瀷鎵ц鐩稿簲鎿嶄綔锛堟ā鎷燂級
       result = None
       if task.type == "novel_generation":
           # 鎵ц灏忚鐢熸垚浠诲姟
           gen_request = NovelGenerationRequest(**task.parameters)
           result = await generate_novel_content(gen_request)
       elif task.type == "text_generation":
           # 鎵ц鏂囨湰鐢熸垚浠诲姟
           gen_request = GenerationRequest(**task.parameters)
           result = await generate_text(gen_request)
       elif task.type == "extraction":
           # 鎵ц鎻愬彇浠诲姟
           result = await extract_from_text(task.parameters)
       else:
           # 鍏朵粬浠诲姟绫诲瀷
           result = {"status": "completed", "message": f"执行了 {task.type} 类型的任务"}
       
       # 鏇存柊浠诲姟鐘舵€佷负瀹屾垚
       task.status = TaskStatus.COMPLETED
       task.completed_at = datetime.now()
       task.result = result.model_dump() if hasattr(result, 'model_dump') else result
       await storage_manager.save(f"task_{task_id}", task.model_dump())
       
       return {"message": "浠诲姟鎵ц瀹屾垚", "task_id": task_id}
   except Exception as e:
       # 鏇存柊浠诲姟鐘舵€佷负澶辫触
       try:
           loaded = await storage_manager.load(f"task_{task_id}")
           if loaded:
               task = AITask(**loaded)
               task.status = TaskStatus.FAILED
               task.error = str(e)
               task.completed_at = datetime.now()
               await storage_manager.save(f"task_{task_id}", task.model_dump())
       except:
           pass  # 蹇界暐淇濆瓨閿欒
       
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"浠诲姟鎵ц澶辫触: {str(e)}"
       )


# 鍐呭绠＄悊鐩稿叧绔偣
@app.post("/api/content/create", response_model=dict)
async def create_content(request: ContentCreateRequest):
   """鍒涘缓鍐呭"""
   try:
       content_item = _build_content_item_from_request(request)
       content_item = await _normalize_content_item_for_write(content_item)
       content_id = await content_manager.create_content(content_item)
       return {
           "success": True,
           "content_id": content_id,
           "message": "鍐呭鍒涘缓鎴愬姛"
       }
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"鍐呭鍒涘缓澶辫触: {str(e)}"
       )


@app.post("/api/content/search", response_model=ContentSearchResult)
async def search_content(request: ContentSearchRequest):
   """鎼滅储鍐呭"""
   try:
       result = await content_manager.search_content(request)
       return result
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"鍐呭鎼滅储澶辫触: {str(e)}"
       )



@app.get("/api/content/novels/{session_id}")
async def list_novels(session_id: str):
    """获取指定项目下的所有小说根节点及其资产统计"""
    try:
        from ..content.models import ContentType
        novel_req = ContentSearchRequest(
            session_id=session_id,
            content_type=ContentType("novel"),
            limit=100,
        )
        novel_result = await content_manager.search_content(novel_req)

        novels = []
        for novel in novel_result.items:
            stats = {}
            for asset_type in ["chapter", "character", "world", "timeline", "relationship"]:
                type_req = ContentSearchRequest(
                    session_id=session_id,
                    parent_id=novel.metadata.id,
                    content_type=ContentType(asset_type),
                    limit=1,
                )
                type_result = await content_manager.search_content(type_req)
                stats[asset_type] = type_result.total

            novels.append({
                "id": novel.metadata.id,
                "title": novel.metadata.title,
                "created_at": novel.metadata.created_at.isoformat(),
                "updated_at": novel.metadata.updated_at.isoformat(),
                "stats": stats,
            })

        return {"novels": novels, "total": len(novels)}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取小说列表失败: {str(e)}"
        )

@app.post("/api/content/export")
async def export_content(request: ContentExportRequest):
   """瀵煎嚭鍐呭"""
   try:
       export_data = await content_manager.export_content(request)
       
       # 鏍规嵁鏍煎紡璁剧疆閫傚綋鐨勫搷搴斿ご
       if request.format == "json":
           return Response(
               content=export_data,
               media_type="application/json",
               headers={
                   "Content-Disposition": f"attachment; filename=export.{request.format}"
               }
           )
       elif request.format == "txt":
           return Response(
               content=export_data,
               media_type="text/plain",
               headers={
                   "Content-Disposition": f"attachment; filename=export.{request.format}"
               }
           )
       else:
           # 榛樿杩斿洖JSON
           return Response(
               content=export_data,
               media_type="application/json",
               headers={
                   "Content-Disposition": f"attachment; filename=export.{request.format}"
               }
           )
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"鍐呭瀵煎嚭澶辫触: {str(e)}"
       )


@app.get("/api/content/stats", response_model=dict)
async def get_content_stats():
   """鑾峰彇鍐呭缁熻"""
   try:
       stats = await content_manager.get_content_stats()
       return stats
   except Exception as e:
       
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"鑾峰彇鍐呭缁熻澶辫触: {str(e)}"
       )



@app.get("/api/content/topology/{session_id}")
async def get_content_topology(session_id: str, parent_id: Optional[str] = None):
    """
    鑾峰彇鍐呭鐨勬嫇鎵戠粨鏋勭粨鏋勶紝鐢ㄤ簬涓栫晫鏍戝彲瑙嗗寲
    """
    try:
        search_req = ContentSearchRequest(session_id=session_id, parent_id=parent_id, limit=200, include_content=False)
        result = await content_manager.search_content(search_req)
        items = list(result.items)
        if parent_id and all(str(item.metadata.id) != parent_id for item in items):
            parent_item = await content_manager.get_content(parent_id)
            if parent_item and parent_item.metadata.session_id == session_id:
                items.insert(0, parent_item.model_copy(update={"content": ""}))

        nodes = []
        edges = []
        seen_edges = set()
        node_ids = {str(item.metadata.id) for item in items}
        topology_lookup = _build_topology_lookup(items)

        for item in items:
            node_id = str(item.metadata.id)
            node_type = _content_type_value(item.metadata.type)
            payload = _topology_payload(item)
            nodes.append({
                "id": node_id,
                "type": node_type,
                "title": _clean_title(item.metadata.title) or item.metadata.title,
                "metadata": {
                    "parent_id": item.metadata.parent_id,
                    "importance": payload.get("importance") or "medium",
                    "is_decorative": payload.get("is_decorative") is True,
                },
            })

            if item.metadata.parent_id:
                edge_key = (item.metadata.parent_id, node_id, "parent")
                if edge_key not in seen_edges:
                    seen_edges.add(edge_key)
                    edges.append({
                        "source": item.metadata.parent_id,
                        "target": node_id,
                        "type": "parent"
                    })

            for child_id in item.metadata.children_ids or []:
                edge_key = (node_id, child_id, "child")
                if edge_key not in seen_edges:
                    seen_edges.add(edge_key)
                    edges.append({
                        "source": node_id,
                        "target": child_id,
                        "type": "child"
                    })

            for relation_type, target_ref in _collect_relation_references(item):
                resolved_target = _resolve_topology_target(target_ref, node_ids, topology_lookup)
                if not resolved_target or resolved_target == node_id:
                    continue

                edge_key = (node_id, resolved_target, relation_type)
                if edge_key not in seen_edges:
                    seen_edges.add(edge_key)
                    edges.append({
                        "source": node_id,
                        "target": resolved_target,
                        "type": relation_type,
                    })

            if node_type == "relationship":
                rel_source = payload.get("source")
                rel_target = payload.get("target") or payload.get("target_name")
                resolved_source = _resolve_topology_target(rel_source, node_ids, topology_lookup)
                resolved_target = _resolve_topology_target(rel_target, node_ids, topology_lookup)
                if resolved_source and resolved_target and resolved_source != resolved_target:
                    edge_key = (resolved_source, resolved_target, "relationship")
                    if edge_key not in seen_edges:
                        seen_edges.add(edge_key)
                        edges.append({
                            "source": resolved_source,
                            "target": resolved_target,
                            "type": "relationship",
                        })

            if node_type == "world":
                for semantic_node in _build_world_semantic_nodes(node_id, payload):
                    semantic_id = semantic_node["id"]
                    if semantic_id in node_ids:
                        continue
                    node_ids.add(semantic_id)
                    nodes.append(semantic_node)
                    edge_key = (node_id, semantic_id, "world_fact")
                    if edge_key not in seen_edges:
                        seen_edges.add(edge_key)
                        edges.append({
                            "source": node_id,
                            "target": semantic_id,
                            "type": "world_fact",
                        })

        return {
            "nodes": nodes,
            "edges": edges,
            "total_nodes": len(nodes),
            "total_edges": len(edges)
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"鑾峰彇鎷撴墤缁撴瀯澶辫触: {str(e)}"
        )

@app.get("/api/content/type/{content_type}", response_model=List[ContentItem])
async def list_content_by_type(
   content_type: str,
   content_status: Optional[str] = Query(default=None, alias="status"),
   session_id: Optional[str] = None
):
   """鎸夌被鍨嬪垪鍑哄唴瀹?"""
   try:
       contents = await content_manager.list_content_by_type(content_type, content_status, session_id)
       return contents
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"鑾峰彇鍐呭鍒楄〃澶辫触: {str(e)}"
       )


# AI璋冨害绯荤粺鐩稿叧绔偣

@app.get("/api/content/{content_id}", response_model=ContentItem)
async def get_content(content_id: str):
   """鑾峰彇鍐呭"""
   try:
       content = await content_manager.get_content(content_id)
       if not content:
           raise HTTPException(
               status_code=status.HTTP_404_NOT_FOUND,
               detail="内容不存在"
           )
       return content
   except HTTPException:
       raise
   except HTTPException:
       raise
   except HTTPException:
       raise
   except Exception as e:
       
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"鑾峰彇鍐呭澶辫触: {str(e)}"
       )



@app.put("/api/content/{content_id}", response_model=dict)
async def update_content(content_id: str, request: ContentUpdateRequest):
   """鏇存柊鍐呭"""
   try:
       # 璁剧疆姝ｇ‘鐨処D
       existing = await content_manager.get_content(content_id)
       if not existing:
           raise HTTPException(
               status_code=status.HTTP_404_NOT_FOUND,
               detail="内容不存在"
           )
       content_item = _build_content_item_from_request(request, content_id=content_id, existing_item=existing)
       content_item = await _normalize_content_item_for_write(content_item)
       success = await content_manager.update_content(content_id, content_item)
       if not success:
           raise HTTPException(
               status_code=status.HTTP_404_NOT_FOUND,
               detail="内容不存在"
           )
       return {
           "success": True,
           "message": "鍐呭鏇存柊鎴愬姛"
       }
   except HTTPException:
       raise
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"鍐呭鏇存柊澶辫触: {str(e)}"
       )



@app.delete("/api/content/{content_id}", response_model=dict)
async def delete_content(content_id: str):
   """鍒犻櫎鍐呭"""
   try:
       success = await content_manager.delete_content(content_id)
       if not success:
           raise HTTPException(
               status_code=status.HTTP_404_NOT_FOUND,
               detail="内容不存在"
           )
       return {
           "success": True,
           "message": "鍐呭鍒犻櫎鎴愬姛"
       }
   except HTTPException:
       raise
   except Exception as e:
       raise HTTPException(
           status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
           detail=f"鍐呭鍒犻櫎澶辫触: {str(e)}"
       )



@app.post("/api/scheduler/submit", response_model=dict)
async def submit_task(
    task_type: str,
    parameters: dict,
    priority: SchedulerTaskPriority = SchedulerTaskPriority.MEDIUM,
    user_id: Optional[str] = None
):
    """鎻愪氦鏂颁换鍔″埌璋冨害鍣?"""
    try:
        task_id = await ai_scheduler.submit_task(
            task_type=task_type,
            parameters=parameters,
            priority=priority,
            user_id=user_id
        )
        return {
            "success": True,
            "task_id": task_id,
            "message": "Task submitted to scheduler",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"浠诲姟鎻愪氦澶辫触: {str(e)}"
        )


def _serialize_scheduler_task(task) -> dict:
    return {
        "id": task.id,
        "type": task.type,
        "status": task.status.value,
        "priority": task.priority.value,
        "parameters": task.parameters,
        "created_at": task.created_at.isoformat(),
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "result": task.result,
        "error": task.error,
        "progress": task.progress,
        "message": task.message,
        "user_id": task.user_id,
    }


@app.get("/api/scheduler/task/{task_id}", response_model=dict)
async def get_scheduler_task_status(task_id: str):
    """鑾峰彇浠诲姟鐘舵€?"""
    task = await ai_scheduler.get_task_status(task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    return _serialize_scheduler_task(task)


@app.post("/api/scheduler/cancel/{task_id}", response_model=dict)
async def cancel_task(task_id: str):
    """鍙栨秷浠诲姟"""
    try:
        success = await ai_scheduler.cancel_task(task_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="浠诲姟涓嶅瓨鍦ㄦ垨鏃犳硶鍙栨秷"
            )
        return {
            "success": True,
            "message": "任务已取消",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"浠诲姟鍙栨秷澶辫触: {str(e)}"
        )


@app.get("/api/scheduler/active/{session_id}", response_model=List[dict])
async def get_active_tasks_by_session(session_id: str):
    """鑾峰彇鎸囧畾浼氳瘽鏈€杩戠殑浠诲姟"""
    try:
        tasks = await ai_scheduler.get_active_tasks_by_session(session_id)
        return [_serialize_scheduler_task(task) for task in tasks]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"鑾峰彇浼氳瘽浠诲姟澶辫触: {str(e)}"
        )


@app.get("/api/scheduler/recent/{session_id}", response_model=List[dict])
async def get_recent_tasks_by_session(
    session_id: str,
    limit: int = 10,
    task_type: Optional[str] = None,
):
    """获取指定项目最近任务，包含已完成任务，用于恢复质量诊断。"""
    try:
        tasks = await ai_scheduler.get_recent_tasks_by_session(
            session_id,
            limit=limit,
            task_type=task_type,
        )
        return [_serialize_scheduler_task(task) for task in tasks]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取最近任务失败: {str(e)}"
        )


    """鑾峰彇璋冨害鍣ㄧ粺璁′俊鎭?"""
    try:
        stats = ai_scheduler.get_queue_stats()
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"鑾峰彇璋冨害鍣ㄧ粺璁″け璐? {str(e)}"
        )


@app.get("/api/scheduler/user-tasks/{user_id}", response_model=List[dict])
async def get_user_tasks(
    user_id: str,
    limit: int = 20,
    offset: int = 0
):
    """鑾峰彇鐢ㄦ埛鐨勬墍鏈変换鍔?"""
    try:
        tasks = await ai_scheduler.get_user_tasks(user_id, limit, offset)
        
        result = []
        for task in tasks:
            result.append({
                "id": task.id,
                "type": task.type,
                "status": task.status.value,
                "priority": task.priority.value,
                "created_at": task.created_at.isoformat(),
                "started_at": task.started_at.isoformat() if task.started_at else None,
                "completed_at": task.completed_at.isoformat() if task.completed_at else None,
                "error": task.error
            })
        
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"鑾峰彇鐢ㄦ埛浠诲姟澶辫触: {str(e)}"
        )


# 閿欒澶勭悊
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """HTTP寮傚父澶勭悊"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "detail": f"HTTP {exc.status_code} 閿欒",
            "timestamp": datetime.now().isoformat()
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """閫氱敤寮傚父澶勭悊"""
    return JSONResponse(
        status_code=500,
        content={
            "error": "服务器内部错误",
            "detail": str(exc),
            "timestamp": datetime.now().isoformat()
        }
    )










if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, reload=True)
