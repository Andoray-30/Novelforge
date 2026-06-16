from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DeepSynthesisScopeType(str, Enum):
    character = "character"
    relationship = "relationship"
    event = "event"
    world_fact = "world_fact"
    full = "full"


class DeepSynthesisBudgetTier(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class DeepSynthesisAssetType(str, Enum):
    character = "character"
    relationship = "relationship"
    event = "event"
    world_fact = "world_fact"


class RiskLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class ConflictType(str, Enum):
    inconsistent_description = "inconsistent_description"
    contradictory_traits = "contradictory_traits"
    timeline_mismatch = "timeline_mismatch"


class DeepSynthesisRequestAsset(BaseModel):
    model_config = ConfigDict(extra="allow")

    asset_type: DeepSynthesisAssetType
    asset_id: str = Field(..., min_length=1)
    asset_version: str = Field(..., min_length=1)
    data: Dict[str, Any] = Field(default_factory=dict)


class DeepSynthesisScope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scope_type: DeepSynthesisScopeType
    scope_ids: List[str] = Field(default_factory=list)


class EvidenceRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evidence_id: str = Field(..., min_length=1)
    source_type: str = Field(..., min_length=1)
    asset_type: Optional[DeepSynthesisAssetType] = None
    asset_id: Optional[str] = None
    asset_version: Optional[str] = None
    field_path: Optional[str] = None
    summary: Optional[str] = Field(default=None, max_length=200)


class ProposedChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    change_id: str = Field(..., min_length=1)
    asset_type: DeepSynthesisAssetType
    asset_id: str = Field(..., min_length=1)
    asset_version: str = Field(..., min_length=1)
    field_path: str = Field(..., min_length=1)
    current_value: Any = None
    proposed_value: Any = None
    confidence: float = Field(..., ge=0.0, le=1.0)
    reason: str = Field(..., min_length=1)
    evidence_refs: List[EvidenceRef] = Field(default_factory=list)
    risk_level: RiskLevel


class Conflict(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conflict_id: str = Field(..., min_length=1)
    asset_type: DeepSynthesisAssetType
    asset_ids: List[str] = Field(default_factory=list)
    conflict_type: ConflictType
    description: str = Field(..., min_length=1)
    resolution: str = Field(..., min_length=1)
    confidence: float = Field(..., ge=0.0, le=1.0)


class NewLink(BaseModel):
    model_config = ConfigDict(extra="forbid")

    link_id: str = Field(..., min_length=1)
    source_asset_type: DeepSynthesisAssetType
    source_asset_id: str = Field(..., min_length=1)
    target_asset_type: DeepSynthesisAssetType
    target_asset_id: str = Field(..., min_length=1)
    relation_type: str = Field(..., min_length=1)
    confidence: float = Field(..., ge=0.0, le=1.0)
    evidence_refs: List[EvidenceRef] = Field(default_factory=list)


class RiskFlag(BaseModel):
    model_config = ConfigDict(extra="forbid")

    risk_id: str = Field(..., min_length=1)
    severity: RiskLevel
    message: str = Field(..., min_length=1)
    affected_asset_ids: List[str] = Field(default_factory=list)
    evidence_refs: List[EvidenceRef] = Field(default_factory=list)


class ApplyPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requires_user_confirmation: bool = True
    apply_mode: str = "preview_patch"
    patch_strategy: str = "field_level"
    asset_write_policy: str = "confirm_before_apply"


class DeepSynthesisPreview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(default="", max_length=1000)
    proposed_changes: List[ProposedChange] = Field(default_factory=list)
    conflicts_resolved: List[Conflict] = Field(default_factory=list)
    new_links: List[NewLink] = Field(default_factory=list)
    risk_flags: List[RiskFlag] = Field(default_factory=list)
    confidence_delta: float = Field(default=0.0)
    evidence_refs: List[EvidenceRef] = Field(default_factory=list)
    apply_plan: ApplyPlan = Field(default_factory=ApplyPlan)
    requires_user_confirmation: bool = True


class DeepSynthesisBudgetSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    budget_tier: DeepSynthesisBudgetTier
    max_model_calls: int
    max_estimated_tokens: int
    max_rounds: int
    model_calls_used: int = 0
    estimated_tokens_used: int = 0
    remaining_model_calls: int = 0
    remaining_estimated_tokens: int = 0
    exhausted: bool = False
    reason: Optional[str] = None


class DeepSynthesisWarning(BaseModel):
    model_config = ConfigDict(extra="forbid")

    warning_id: str = Field(..., min_length=1)
    code: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    details: Optional[Dict[str, Any]] = None


class DeepSynthesisResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str = Field(..., min_length=1)
    preview: DeepSynthesisPreview
    budget_summary: DeepSynthesisBudgetSummary
    model_route: Optional[Dict[str, Any]] = None
    warnings: List[DeepSynthesisWarning] = Field(default_factory=list)
    attempt_id: Optional[str] = None
    task_type: str = "deep_synthesis"


class DeepSynthesisRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    session_id: str = Field(..., min_length=1)
    scope_type: DeepSynthesisScopeType
    scope_ids: List[str] = Field(default_factory=list)
    assets: List[DeepSynthesisRequestAsset] = Field(default_factory=list)
    quality_summary: Optional[Dict[str, Any]] = None
    conflicts: List[Conflict] = Field(default_factory=list)
    budget_tier: DeepSynthesisBudgetTier = DeepSynthesisBudgetTier.medium

    @property
    def scope(self) -> DeepSynthesisScope:
        return DeepSynthesisScope(scope_type=self.scope_type, scope_ids=self.scope_ids)

    @field_validator("assets")
    @classmethod
    def _assets_must_be_list(cls, value: List[DeepSynthesisRequestAsset]) -> List[DeepSynthesisRequestAsset]:
        return value or []
