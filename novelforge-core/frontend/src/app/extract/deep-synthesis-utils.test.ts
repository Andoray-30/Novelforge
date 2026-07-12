import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	DeepSynthesisApplyResult,
	DeepSynthesisPreview,
	DeepSynthesisResult,
	ExtractionApplyHistoryItem,
	ProposedChange,
} from "@/types";
import {
	type ApplyHistoryFilters,
	buildDeepSynthesisApplyRequest,
	buildDeepSynthesisSelectionState,
	canConfirmRealApplyAfterDryRun,
	deriveAcceptedRejectedIds,
	extractApplyHistoryCounts,
	filterApplyHistory,
	formatApplyHistoryStatus,
	formatApplySkipReason,
	formatApplyStatus,
	formatConvergenceReason,
	formatDeepSynthesisBudgetTier,
	formatDeepSynthesisScopeType,
	formatPassType,
	formatPercent,
	formatQualityDelta,
	formatRiskLevel,
	formatRoundStatus,
	groupProposedChangesByAssetType,
	hasApplyConflicts,
	matchesApplyHistoryFilters,
	sanitizeDeepSynthesisDisplayValue,
} from "./deep-synthesis-utils";
import {
	buildDeepSynthesisRequestAssets,
	deepSynthesisService,
	extractionAttemptService,
} from "@/lib/api/novelforge-api";

describe("Deep Synthesis Utils", () => {
	describe("formatDeepSynthesisBudgetTier", () => {
		it("formats budget tiers to Chinese labels", () => {
			expect(formatDeepSynthesisBudgetTier("low")).toBe(
				"低预算演进（最多 1 轮）",
			);
			expect(formatDeepSynthesisBudgetTier("medium")).toBe(
				"标准预算演进（最多 2 轮）",
			);
			expect(formatDeepSynthesisBudgetTier("high")).toBe(
				"高预算演进（最多 3 轮）",
			);
			expect(formatDeepSynthesisBudgetTier("unknown")).toBe("unknown");
		});
	});

	describe("formatDeepSynthesisScopeType", () => {
		it("formats scope types to Chinese labels", () => {
			expect(formatDeepSynthesisScopeType("character")).toBe("角色");
			expect(formatDeepSynthesisScopeType("relationship")).toBe("关系");
			expect(formatDeepSynthesisScopeType("event")).toBe("事件");
			expect(formatDeepSynthesisScopeType("world_fact")).toBe("世界观");
			expect(formatDeepSynthesisScopeType("full")).toBe("全量");
			expect(formatDeepSynthesisScopeType("custom")).toBe("custom");
		});
	});

	describe("formatRiskLevel", () => {
		it("formats risk levels to Chinese labels", () => {
			expect(formatRiskLevel("low")).toBe("低风险");
			expect(formatRiskLevel("medium")).toBe("中风险");
			expect(formatRiskLevel("high")).toBe("高风险");
			expect(formatRiskLevel("critical")).toBe("critical");
		});
	});

	describe("formatConvergenceReason", () => {
		it("handles various reason keywords", () => {
			expect(formatConvergenceReason("reaches max_rounds limit")).toBe(
				"达到最大迭代轮次限制",
			);
			expect(formatConvergenceReason("quality_target achieved")).toBe(
				"资产质量趋于稳定（已收敛）",
			);
			expect(formatConvergenceReason("no_actionable items")).toBe(
				"无可消解或提升的资产项",
			);
			expect(formatConvergenceReason("an error occurred")).toBe(
				"执行中遇到错误，提前终止",
			);
			expect(formatConvergenceReason("user_stop pressed")).toBe("用户手动终止");
			expect(formatConvergenceReason("stable state")).toBe(
				"资产质量趋于稳定（已收敛）",
			);
			expect(formatConvergenceReason("something else")).toBe("something else");
			expect(formatConvergenceReason(null)).toBe("无收敛状态说明");
		});
	});

	describe("formatPassType", () => {
		it("formats pass types to Chinese labels", () => {
			expect(formatPassType("generation")).toBe("生成");
			expect(formatPassType("validation")).toBe("验证");
			expect(formatPassType("conflict_resolution")).toBe("冲突消解");
			expect(formatPassType("other")).toBe("other");
			expect(formatPassType(null)).toBe("常规步骤");
		});
	});

	describe("formatRoundStatus", () => {
		it("formats round statuses using backend literal values", () => {
			expect(formatRoundStatus("success")).toBe("成功");
			expect(formatRoundStatus("skipped")).toBe("跳过");
			expect(formatRoundStatus("stopped")).toBe("已停止");
			expect(formatRoundStatus("failed")).toBe("失败");
			expect(formatRoundStatus(null)).toBe("未知");
		});
	});

	describe("formatPercent", () => {
		it("handles numeric and null values", () => {
			expect(formatPercent(0.05)).toBe("+5.0%");
			expect(formatPercent(-0.123)).toBe("-12.3%");
			expect(formatPercent(0)).toBe("+0.0%");
			expect(formatPercent(null)).toBe("—");
		});
	});

	describe("formatQualityDelta", () => {
		it("handles quality scores", () => {
			expect(formatQualityDelta(3.5)).toBe("+3.50");
			expect(formatQualityDelta(-1.25)).toBe("-1.25");
			expect(formatQualityDelta(0)).toBe("0");
			expect(formatQualityDelta(null)).toBe("—");
		});
	});

	describe("groupProposedChangesByAssetType", () => {
		it("groups empty list correctly", () => {
			const grouped = groupProposedChangesByAssetType([]);
			expect(grouped.character).toEqual([]);
			expect(grouped.relationship).toEqual([]);
			expect(grouped.event).toEqual([]);
			expect(grouped.world_fact).toEqual([]);
		});

		it("groups changes correctly by asset_type without relying on asset_name", () => {
			const changes: ProposedChange[] = [
				{
					change_id: "1",
					asset_type: "character",
					asset_id: "c1",
					asset_version: "v1",
					field_path: "personality",
					current_value: "冷酷",
					proposed_value: "外冷内热",
					confidence: 0.9,
					risk_level: "low",
					reason: "发现热心细节",
					evidence_refs: [],
				},
				{
					change_id: "2",
					asset_type: "world_fact",
					asset_id: "w1",
					asset_version: "v1",
					field_path: "description",
					current_value: null,
					proposed_value: "盛产黑曜石",
					confidence: 0.85,
					risk_level: "medium",
					reason: "第三章明确提及",
					evidence_refs: [],
				},
			];
			const grouped = groupProposedChangesByAssetType(changes);
			expect(grouped.character).toHaveLength(1);
			expect(grouped.character[0].change_id).toBe("1");
			expect(grouped.world_fact).toHaveLength(1);
			expect(grouped.world_fact[0].change_id).toBe("2");
			expect(grouped.relationship).toHaveLength(0);
			expect(grouped.event).toHaveLength(0);
		});
	});

	describe("buildDeepSynthesisSelectionState", () => {
		it("creates initial selection state with undecided", () => {
			const mockResult = {
				preview: {
					proposed_changes: [{ change_id: "c1" }, { change_id: "c2" }],
				},
			} as DeepSynthesisResult;

			const state = buildDeepSynthesisSelectionState(mockResult);
			expect(state).toEqual({
				c1: "undecided",
				c2: "undecided",
			});
		});

		it("returns empty object for invalid inputs", () => {
			expect(buildDeepSynthesisSelectionState(null)).toEqual({});
			expect(
				buildDeepSynthesisSelectionState({} as DeepSynthesisResult),
			).toEqual({});
		});
	});

	describe("deriveAcceptedRejectedIds", () => {
		it("splits states correctly", () => {
			const state: Record<string, "accepted" | "rejected" | "undecided"> = {
				"1": "accepted",
				"2": "rejected",
				"3": "undecided",
				"4": "accepted",
			};
			const result = deriveAcceptedRejectedIds(state);
			expect(result.accepted_change_ids).toEqual(["1", "4"]);
			expect(result.rejected_change_ids).toEqual(["2"]);
		});
	});

	describe("sanitizeDeepSynthesisDisplayValue", () => {
		it("truncates long strings to 200 characters with ellipsis", () => {
			const longString = "a".repeat(250);
			const sanitized = sanitizeDeepSynthesisDisplayValue(longString);
			expect(sanitized).toHaveLength(203);
			expect(sanitized.endsWith("...")).toBe(true);
		});

		it("redacts forbidden fields including chapter_id, chapter_title, quote, snippet", () => {
			const text =
				"Here is the chapter_content and raw_response_text and chapter_title and quote and snippet of the novel.";
			const sanitized = sanitizeDeepSynthesisDisplayValue(text);
			expect(sanitized).not.toContain("chapter_content");
			expect(sanitized).not.toContain("raw_response_text");
			expect(sanitized).not.toContain("chapter_title");
			expect(sanitized).toContain("[REDACTED_FIELD]");
		});

		it("returns default placeholder for null/undefined", () => {
			expect(sanitizeDeepSynthesisDisplayValue(null)).toBe("—");
			expect(sanitizeDeepSynthesisDisplayValue(undefined)).toBe("—");
		});
	});

	describe("buildDeepSynthesisApplyRequest", () => {
		const mockPreview: DeepSynthesisPreview = {
			summary: "test",
			proposed_changes: [
				{
					change_id: "ch-1",
					asset_type: "character",
					asset_id: "c1",
					asset_version: "v2",
					field_path: "name",
					current_value: "A",
					proposed_value: "B",
					confidence: 0.9,
					reason: "r",
					evidence_refs: [],
					risk_level: "low",
				},
				{
					change_id: "ch-2",
					asset_type: "world_fact",
					asset_id: "w1",
					asset_version: "v3",
					field_path: "desc",
					current_value: null,
					proposed_value: "X",
					confidence: 0.8,
					reason: "r",
					evidence_refs: [],
					risk_level: "medium",
				},
			],
			conflicts_resolved: [],
			new_links: [],
			risk_flags: [],
			confidence_delta: 0.1,
			evidence_refs: [],
			apply_plan: {
				requires_user_confirmation: true,
				apply_mode: "preview_patch",
				patch_strategy: "field_level",
				asset_write_policy: "confirm_before_apply",
			},
			requires_user_confirmation: true,
		};

		it("maps accepted and rejected change IDs correctly", () => {
			const selectionState: Record<
				string,
				"accepted" | "rejected" | "undecided"
			> = {
				"ch-1": "accepted",
				"ch-2": "rejected",
			};
			const request = buildDeepSynthesisApplyRequest({
				sessionId: "sess-1",
				preview: mockPreview,
				selectionState,
				dryRun: true,
			});
			expect(request.accepted_change_ids).toEqual(["ch-1"]);
			expect(request.rejected_change_ids).toEqual(["ch-2"]);
			expect(request.session_id).toBe("sess-1");
			expect(request.dry_run).toBe(true);
		});

		it("excludes undecided changes from accepted/rejected", () => {
			const selectionState: Record<
				string,
				"accepted" | "rejected" | "undecided"
			> = {
				"ch-1": "accepted",
				"ch-2": "undecided",
			};
			const request = buildDeepSynthesisApplyRequest({
				sessionId: "sess-1",
				preview: mockPreview,
				selectionState,
				dryRun: false,
			});
			expect(request.accepted_change_ids).toEqual(["ch-1"]);
			expect(request.rejected_change_ids).toEqual([]);
			expect(request.dry_run).toBe(false);
		});

		it("generates expected_asset_versions from preview", () => {
			const request = buildDeepSynthesisApplyRequest({
				sessionId: "sess-1",
				preview: mockPreview,
				selectionState: {},
				dryRun: true,
			});
			expect(request.expected_asset_versions).toEqual({
				"ch-1": "v2",
				"ch-2": "v3",
			});
		});

		it("maps idempotencyKey to idempotency_key in request", () => {
			const key = "test-idempotency-key-abc";
			const request = buildDeepSynthesisApplyRequest({
				sessionId: "sess-1",
				preview: mockPreview,
				selectionState: {},
				dryRun: false,
				idempotencyKey: key,
			});
			expect(request.idempotency_key).toBe(key);
		});

		it("sets idempotency_key to null when idempotencyKey is not provided", () => {
			const request = buildDeepSynthesisApplyRequest({
				sessionId: "sess-1",
				preview: mockPreview,
				selectionState: {},
				dryRun: false,
			});
			expect(request.idempotency_key).toBeNull();
		});

		it("sets idempotency_key to null when idempotencyKey is explicitly null", () => {
			const request = buildDeepSynthesisApplyRequest({
				sessionId: "sess-1",
				preview: mockPreview,
				selectionState: {},
				dryRun: true,
				idempotencyKey: null,
			});
			expect(request.idempotency_key).toBeNull();
		});

		it("idempotency_key does not contain proposed_value, current_value, or raw text", () => {
			const key = "safe-uuid-key-123";
			const request = buildDeepSynthesisApplyRequest({
				sessionId: "sess-1",
				preview: mockPreview,
				selectionState: { "ch-1": "accepted" },
				dryRun: false,
				idempotencyKey: key,
			});
			expect(request.idempotency_key).toBe(key);
			expect(request.idempotency_key).not.toContain("A");
			expect(request.idempotency_key).not.toContain("B");
			expect(request.idempotency_key).not.toContain("test");
			expect(request.idempotency_key).not.toContain("propose");
			expect(request.idempotency_key).not.toContain("current");
		});
	});

	describe("formatApplyStatus", () => {
		it("formats all status values", () => {
			expect(formatApplyStatus("success")).toBe("成功");
			expect(formatApplyStatus("partial")).toBe("部分成功");
			expect(formatApplyStatus("failed")).toBe("失败");
			expect(formatApplyStatus("dry_run")).toBe("预检通过");
		});
	});

	describe("formatApplySkipReason", () => {
		it("formats all skip reason values", () => {
			expect(formatApplySkipReason("rejected_by_user")).toBe("用户拒绝");
			expect(formatApplySkipReason("undecided")).toBe("未决定");
			expect(formatApplySkipReason("duplicate_change_id")).toBe("重复变更");
			expect(formatApplySkipReason("unsupported_asset_type")).toBe(
				"不支持的资产类型",
			);
			expect(formatApplySkipReason("missing_asset")).toBe("资产不存在");
			expect(formatApplySkipReason("invalid_field_path")).toBe("无效字段路径");
			expect(formatApplySkipReason("forbidden_field_path")).toBe(
				"禁止字段路径",
			);
			expect(formatApplySkipReason("version_mismatch")).toBe("版本不匹配");
			expect(formatApplySkipReason("current_value_mismatch")).toBe(
				"当前值不匹配",
			);
			expect(formatApplySkipReason("dry_run")).toBe("预检模式");
		});
	});

	describe("hasApplyConflicts", () => {
		it("returns true when conflicts exist", () => {
			expect(
				hasApplyConflicts({
					status: "partial",
					summary: {
						accepted_count: 1,
						rejected_count: 0,
						undecided_count: 0,
						applied_count: 0,
						skipped_count: 0,
						conflict_count: 1,
						failed_count: 0,
						dry_run: false,
						all_or_nothing: false,
					},
					applied_changes: [],
					skipped_changes: [],
					conflicts: [
						{
							change_id: "c1",
							asset_type: "character",
							asset_id: "a1",
							field_path: "f",
							reason: "version_mismatch",
							message: "m",
						},
					],
					warnings: [],
					task_type: "deep_synthesis_apply",
				} as DeepSynthesisApplyResult),
			).toBe(true);
		});

		it("returns false when no conflicts", () => {
			expect(
				hasApplyConflicts({
					status: "dry_run",
					summary: {
						accepted_count: 1,
						rejected_count: 0,
						undecided_count: 0,
						applied_count: 0,
						skipped_count: 0,
						conflict_count: 0,
						failed_count: 0,
						dry_run: true,
						all_or_nothing: false,
					},
					applied_changes: [],
					skipped_changes: [],
					conflicts: [],
					warnings: [],
					task_type: "deep_synthesis_apply",
				}),
			).toBe(false);
		});
	});

	describe("canConfirmRealApplyAfterDryRun", () => {
		it("returns true only for dry_run status without conflicts", () => {
			const dryRunNoConflict: DeepSynthesisApplyResult = {
				status: "dry_run",
				summary: {
					accepted_count: 1,
					rejected_count: 0,
					undecided_count: 0,
					applied_count: 0,
					skipped_count: 0,
					conflict_count: 0,
					failed_count: 0,
					dry_run: true,
					all_or_nothing: false,
				},
				applied_changes: [],
				skipped_changes: [],
				conflicts: [],
				warnings: [],
				task_type: "deep_synthesis_apply",
			};
			expect(canConfirmRealApplyAfterDryRun(dryRunNoConflict)).toBe(true);
		});

		it("returns false for null", () => {
			expect(canConfirmRealApplyAfterDryRun(null)).toBe(false);
		});

		it("returns false when conflicts exist", () => {
			const dryRunWithConflict: DeepSynthesisApplyResult = {
				status: "dry_run",
				summary: {
					accepted_count: 1,
					rejected_count: 0,
					undecided_count: 0,
					applied_count: 0,
					skipped_count: 0,
					conflict_count: 1,
					failed_count: 0,
					dry_run: true,
					all_or_nothing: false,
				},
				applied_changes: [],
				skipped_changes: [],
				conflicts: [
					{
						change_id: "c1",
						asset_type: "character",
						asset_id: "a1",
						field_path: "f",
						reason: "version_mismatch",
						message: "m",
					},
				],
				warnings: [],
				task_type: "deep_synthesis_apply",
			};
			expect(canConfirmRealApplyAfterDryRun(dryRunWithConflict)).toBe(false);
		});

		it("returns false for non-dry_run status", () => {
			const successResult: DeepSynthesisApplyResult = {
				status: "success",
				summary: {
					accepted_count: 1,
					rejected_count: 0,
					undecided_count: 0,
					applied_count: 1,
					skipped_count: 0,
					conflict_count: 0,
					failed_count: 0,
					dry_run: false,
					all_or_nothing: false,
				},
				applied_changes: [],
				skipped_changes: [],
				conflicts: [],
				warnings: [],
				task_type: "deep_synthesis_apply",
			};
			expect(canConfirmRealApplyAfterDryRun(successResult)).toBe(false);
		});
	});

	describe("extractApplyHistoryCounts", () => {
		it("extracts counts from a full apply history item", () => {
			const item: ExtractionApplyHistoryItem = {
				id: "a1",
				status: "success",
				parsed_candidate_counts: { applied: 5, skipped: 2, conflicts: 1 },
				user_acceptance_rate: 0.8,
			};
			const counts = extractApplyHistoryCounts(item);
			expect(counts.applied).toBe(5);
			expect(counts.skipped).toBe(2);
			expect(counts.conflicts).toBe(1);
			expect(counts.dryRun).toBe(false);
			expect(counts.acceptanceRate).toBe("80%");
		});

		it("handles missing parsed_candidate_counts", () => {
			const item: ExtractionApplyHistoryItem = { id: "a2", status: "partial" };
			const counts = extractApplyHistoryCounts(item);
			expect(counts.applied).toBe(0);
			expect(counts.skipped).toBe(0);
			expect(counts.conflicts).toBe(0);
			expect(counts.dryRun).toBe(false);
			expect(counts.acceptanceRate).toBe("—");
		});

		it("detects dry_run flag", () => {
			const item: ExtractionApplyHistoryItem = {
				id: "a3",
				status: "dry_run",
				parsed_candidate_counts: { dry_run: true, applied: 3 },
			};
			const counts = extractApplyHistoryCounts(item);
			expect(counts.dryRun).toBe(true);
			expect(counts.applied).toBe(3);
		});
	});

	describe("formatApplyHistoryStatus", () => {
		it("formats success status", () => {
			const result = formatApplyHistoryStatus("success");
			expect(result.label).toBe("成功");
			expect(result.tone).toBe("success");
		});

		it("formats partial status", () => {
			const result = formatApplyHistoryStatus("partial");
			expect(result.label).toBe("部分成功");
			expect(result.tone).toBe("warning");
		});

		it("formats failed status", () => {
			const result = formatApplyHistoryStatus("failed");
			expect(result.label).toBe("失败");
			expect(result.tone).toBe("danger");
		});

		it("formats dry_run status", () => {
			const result = formatApplyHistoryStatus("dry_run");
			expect(result.label).toBe("预检");
			expect(result.tone).toBe("neutral");
		});

		it("handles null status", () => {
			const result = formatApplyHistoryStatus(null);
			expect(result.label).toBe("未知");
			expect(result.tone).toBe("neutral");
		});
	});

	describe("matchesApplyHistoryFilters", () => {
		const successItem: ExtractionApplyHistoryItem = {
			id: "s1",
			status: "success",
			parsed_candidate_counts: { applied: 5, skipped: 0, conflicts: 0 },
		};
		const partialItem: ExtractionApplyHistoryItem = {
			id: "p1",
			status: "partial",
			parsed_candidate_counts: { applied: 3, skipped: 1, conflicts: 2 },
		};
		const failedItem: ExtractionApplyHistoryItem = {
			id: "f1",
			status: "failed",
			parsed_candidate_counts: { applied: 0, skipped: 0, conflicts: 0 },
		};
		const dryRunItem: ExtractionApplyHistoryItem = {
			id: "d1",
			status: "dry_run",
			parsed_candidate_counts: {
				applied: 2,
				skipped: 1,
				conflicts: 0,
				dry_run: true,
			},
		};
		const dryRunByCountsItem: ExtractionApplyHistoryItem = {
			id: "d2",
			status: "partial",
			parsed_candidate_counts: {
				applied: 1,
				skipped: 0,
				conflicts: 0,
				dry_run: true,
			},
		};

		it('matches all when all filters are "all"', () => {
			const filters: ApplyHistoryFilters = {
				status: "all",
				conflict: "all",
				runType: "all",
			};
			expect(matchesApplyHistoryFilters(successItem, filters)).toBe(true);
			expect(matchesApplyHistoryFilters(partialItem, filters)).toBe(true);
			expect(matchesApplyHistoryFilters(failedItem, filters)).toBe(true);
			expect(matchesApplyHistoryFilters(dryRunItem, filters)).toBe(true);
		});

		it("filters by status success", () => {
			const filters: ApplyHistoryFilters = {
				status: "success",
				conflict: "all",
				runType: "all",
			};
			expect(matchesApplyHistoryFilters(successItem, filters)).toBe(true);
			expect(matchesApplyHistoryFilters(partialItem, filters)).toBe(false);
			expect(matchesApplyHistoryFilters(failedItem, filters)).toBe(false);
			expect(matchesApplyHistoryFilters(dryRunItem, filters)).toBe(false);
		});

		it("filters by status partial", () => {
			const filters: ApplyHistoryFilters = {
				status: "partial",
				conflict: "all",
				runType: "all",
			};
			expect(matchesApplyHistoryFilters(partialItem, filters)).toBe(true);
			expect(matchesApplyHistoryFilters(successItem, filters)).toBe(false);
			expect(matchesApplyHistoryFilters(failedItem, filters)).toBe(false);
		});

		it("filters by status failed", () => {
			const filters: ApplyHistoryFilters = {
				status: "failed",
				conflict: "all",
				runType: "all",
			};
			expect(matchesApplyHistoryFilters(failedItem, filters)).toBe(true);
			expect(matchesApplyHistoryFilters(successItem, filters)).toBe(false);
			expect(matchesApplyHistoryFilters(partialItem, filters)).toBe(false);
		});

		it("filters by status dry_run including counts.dryRun items", () => {
			const filters: ApplyHistoryFilters = {
				status: "dry_run",
				conflict: "all",
				runType: "all",
			};
			expect(matchesApplyHistoryFilters(dryRunItem, filters)).toBe(true);
			expect(matchesApplyHistoryFilters(dryRunByCountsItem, filters)).toBe(
				true,
			);
			expect(matchesApplyHistoryFilters(successItem, filters)).toBe(false);
			expect(matchesApplyHistoryFilters(partialItem, filters)).toBe(false);
		});

		it("filters by conflict has_conflicts", () => {
			const filters: ApplyHistoryFilters = {
				status: "all",
				conflict: "has_conflicts",
				runType: "all",
			};
			expect(matchesApplyHistoryFilters(partialItem, filters)).toBe(true);
			expect(matchesApplyHistoryFilters(successItem, filters)).toBe(false);
			expect(matchesApplyHistoryFilters(dryRunItem, filters)).toBe(false);
		});

		it("filters by conflict no_conflicts", () => {
			const filters: ApplyHistoryFilters = {
				status: "all",
				conflict: "no_conflicts",
				runType: "all",
			};
			expect(matchesApplyHistoryFilters(successItem, filters)).toBe(true);
			expect(matchesApplyHistoryFilters(dryRunItem, filters)).toBe(true);
			expect(matchesApplyHistoryFilters(partialItem, filters)).toBe(false);
		});

		it("filters by run type real_apply", () => {
			const filters: ApplyHistoryFilters = {
				status: "all",
				conflict: "all",
				runType: "real_apply",
			};
			expect(matchesApplyHistoryFilters(successItem, filters)).toBe(true);
			expect(matchesApplyHistoryFilters(partialItem, filters)).toBe(true);
			expect(matchesApplyHistoryFilters(failedItem, filters)).toBe(true);
			expect(matchesApplyHistoryFilters(dryRunItem, filters)).toBe(false);
			expect(matchesApplyHistoryFilters(dryRunByCountsItem, filters)).toBe(
				false,
			);
		});

		it("filters by run type dry_run", () => {
			const filters: ApplyHistoryFilters = {
				status: "all",
				conflict: "all",
				runType: "dry_run",
			};
			expect(matchesApplyHistoryFilters(dryRunItem, filters)).toBe(true);
			expect(matchesApplyHistoryFilters(dryRunByCountsItem, filters)).toBe(
				true,
			);
			expect(matchesApplyHistoryFilters(successItem, filters)).toBe(false);
			expect(matchesApplyHistoryFilters(partialItem, filters)).toBe(false);
		});

		it("handles combined filters", () => {
			const filters: ApplyHistoryFilters = {
				status: "partial",
				conflict: "has_conflicts",
				runType: "real_apply",
			};
			expect(matchesApplyHistoryFilters(partialItem, filters)).toBe(true);
			expect(matchesApplyHistoryFilters(successItem, filters)).toBe(false);
			expect(matchesApplyHistoryFilters(dryRunItem, filters)).toBe(false);
			expect(matchesApplyHistoryFilters(dryRunByCountsItem, filters)).toBe(
				false,
			);
		});

		it("handles missing status", () => {
			const item: ExtractionApplyHistoryItem = { id: "x1" };
			const filters: ApplyHistoryFilters = {
				status: "success",
				conflict: "all",
				runType: "all",
			};
			expect(matchesApplyHistoryFilters(item, filters)).toBe(false);
		});
	});

	describe("filterApplyHistory", () => {
		const items: ExtractionApplyHistoryItem[] = [
			{
				id: "a",
				status: "success",
				parsed_candidate_counts: { applied: 5, conflicts: 0 },
			},
			{
				id: "b",
				status: "partial",
				parsed_candidate_counts: { applied: 3, conflicts: 2 },
			},
			{
				id: "c",
				status: "failed",
				parsed_candidate_counts: { applied: 0, conflicts: 0 },
			},
			{
				id: "d",
				status: "dry_run",
				parsed_candidate_counts: { applied: 1, conflicts: 0, dry_run: true },
			},
		];

		it("returns all items when no filters applied", () => {
			const result = filterApplyHistory(items, {
				status: "all",
				conflict: "all",
				runType: "all",
			});
			expect(result).toHaveLength(4);
		});

		it("filters by status", () => {
			const result = filterApplyHistory(items, {
				status: "success",
				conflict: "all",
				runType: "all",
			});
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("a");
		});

		it("filters by conflict", () => {
			const result = filterApplyHistory(items, {
				status: "all",
				conflict: "has_conflicts",
				runType: "all",
			});
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("b");
		});

		it("filters by run type", () => {
			const result = filterApplyHistory(items, {
				status: "all",
				conflict: "all",
				runType: "dry_run",
			});
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("d");
		});

		it("handles combined filters correctly", () => {
			const result = filterApplyHistory(items, {
				status: "partial",
				conflict: "has_conflicts",
				runType: "all",
			});
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("b");
		});

		it("returns empty array when no matches", () => {
			const result = filterApplyHistory(items, {
				status: "success",
				conflict: "has_conflicts",
				runType: "all",
			});
			expect(result).toHaveLength(0);
		});
	});
});

describe("Deep Synthesis persisted asset API integration", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("submits non-empty persisted assets and preserves consumable suggested_changes", async () => {
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				items: [{
					metadata: {
						id: "char-persisted-1",
						title: "Synthetic Engineer",
						type: "character",
						status: "published",
						tags: [],
						created_at: "2026-07-12T00:00:00Z",
						updated_at: "2026-07-12T00:00:00Z",
						version: 3,
						session_id: "session-m0",
						parent_id: "novel-m0",
					},
					content: "safe synthetic summary",
					extracted_data: {
						name: "Synthetic Engineer",
						suggested_changes: [{
							field_path: "profile.summary",
							current_value: "old",
							proposed_value: "new",
							confidence: 0.9,
							reason: "synthetic evidence",
						}],
					},
				}],
				total: 1,
				page: 1,
				limit: 500,
			}), { status: 200, headers: { "Content-Type": "application/json" } }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ status: "completed" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}));
		vi.stubGlobal("fetch", fetchMock);

		await deepSynthesisService.createPreviewFromPersistedAssets({
			sessionId: "session-m0",
			parentId: "novel-m0",
			scopeType: "full",
			budgetTier: "low",
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		const searchBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
		expect(searchBody).toMatchObject({
			session_id: "session-m0",
			parent_id: "novel-m0",
			content_types: ["character", "relationship", "timeline", "world"],
		});
		const previewBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
		expect(previewBody.scope_ids).toEqual(["char-persisted-1"]);
		expect(previewBody.assets).toHaveLength(1);
		expect(previewBody.assets[0]).toMatchObject({
			asset_type: "character",
			asset_id: "char-persisted-1",
			asset_version: "v3",
			data: {
				name: "Synthetic Engineer",
				suggested_changes: [{
					field_path: "profile.summary",
					proposed_value: "new",
				}],
			},
		});
	});

	it("rejects with a clear error before preview when no persisted asset has consumable changes", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			items: [{
				metadata: {
					id: "world-without-change",
					title: "Synthetic World",
					type: "world",
					status: "published",
					tags: [],
					created_at: "2026-07-12T00:00:00Z",
					updated_at: "2026-07-12T00:00:00Z",
					version: 1,
				},
				content: "safe synthetic world",
				extracted_data: { suggested_changes: [] },
			}],
			total: 1,
			page: 1,
			limit: 500,
		}), { status: 200, headers: { "Content-Type": "application/json" } }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(deepSynthesisService.createPreviewFromPersistedAssets({
			sessionId: "session-m0",
			scopeType: "full",
			budgetTier: "low",
		})).rejects.toThrow("没有包含可消费改进建议的结构化资产");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("maps only persisted assets whose suggested_changes are consumable", () => {
		const assets = buildDeepSynthesisRequestAssets([{
			metadata: {
				id: "timeline-1",
				title: "Synthetic Event",
				type: "timeline",
				status: "published",
				tags: [],
				created_at: "2026-07-12T00:00:00Z",
				updated_at: "2026-07-12T00:00:00Z",
				version: 2,
			},
			content: "safe synthetic event",
			extracted_data: {
				suggested_changes: [null, {}, { field_path: "description", proposed_value: "refined" }],
			},
		}]);
		expect(assets).toHaveLength(1);
		expect(assets[0].asset_type).toBe("event");
		expect(assets[0].data?.suggested_changes).toEqual([
			{ field_path: "description", proposed_value: "refined" },
		]);
	});
});

describe("Apply history detail snapshot compatibility", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each(["result", "result_snapshot"])("reads idempotency.%s snapshots", async (snapshotKey) => {
		const snapshot = {
			status: "success",
			summary: { applied_count: 1, conflict_count: 0 },
			applied_changes: [{
				change_id: "change-1",
				asset_type: "character",
				asset_id: "char-1",
				field_path: "profile.summary",
				asset_version_before: "v1",
				asset_version_after: "v2",
				previous_value: "old",
				applied_value: "new",
			}],
			conflicts: [],
			skipped_changes: [],
			warnings: [],
		};
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
			id: "attempt-1",
			status: "success",
			budget_summary: { idempotency: { [snapshotKey]: snapshot } },
		}), { status: 200, headers: { "Content-Type": "application/json" } })));

		const detail = await extractionAttemptService.getApplyHistoryDetail({
			sessionId: "session-m0",
			attemptId: "attempt-1",
		});

		expect(detail.detail_available).toBe(true);
		expect(detail.summary?.applied_count).toBe(1);
		expect(detail.applied_changes?.[0]).toMatchObject({
			change_id: "change-1",
			version_before: "v1",
			version_after: "v2",
		});
	});

	it("prefers the current result snapshot when both current and legacy keys exist", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
			id: "attempt-1",
			status: "partial",
			budget_summary: {
				idempotency: {
					result: { status: "success", summary: { applied_count: 2 } },
					result_snapshot: { status: "failed", summary: { applied_count: 0 } },
				},
			},
		}), { status: 200, headers: { "Content-Type": "application/json" } })));

		const detail = await extractionAttemptService.getApplyHistoryDetail({
			sessionId: "session-m0",
			attemptId: "attempt-1",
		});

		expect(detail.status).toBe("success");
		expect(detail.summary?.applied_count).toBe(2);
	});
});
