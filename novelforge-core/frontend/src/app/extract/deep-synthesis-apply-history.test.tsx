import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractionAttemptService } from "@/lib/api";
import type {
	DeepSynthesisApplyHistoryDetail,
	ExtractionApplyHistoryItem,
} from "@/types";
import { DeepSynthesisApplyHistory } from "./deep-synthesis-apply-history";

vi.mock("@/lib/api", () => ({
	extractionAttemptService: {
		listApplyHistory: vi.fn(),
		getApplyHistoryDetail: vi.fn(),
	},
}));

const mockList = vi.mocked(extractionAttemptService.listApplyHistory);
const mockGetDetail = vi.mocked(extractionAttemptService.getApplyHistoryDetail);

function makeItem(
	overrides: Partial<ExtractionApplyHistoryItem> = {},
): ExtractionApplyHistoryItem {
	return {
		id: "test-id",
		task_type: "deep_synthesis_apply",
		session_id: "sess-1",
		created_at: "2026-06-17T12:00:00Z",
		status: "success",
		latency_ms: 1500,
		parsed_candidate_counts: { applied: 3, skipped: 1, conflicts: 0 },
		user_acceptance_rate: 0.75,
		...overrides,
	};
}

const MIXED_ITEMS: ExtractionApplyHistoryItem[] = [
	makeItem({
		id: "s1",
		status: "success",
		parsed_candidate_counts: { applied: 5, skipped: 0, conflicts: 0 },
	}),
	makeItem({
		id: "p1",
		status: "partial",
		parsed_candidate_counts: { applied: 3, skipped: 1, conflicts: 2 },
	}),
	makeItem({
		id: "f1",
		status: "failed",
		parsed_candidate_counts: { applied: 0, skipped: 0, conflicts: 0 },
	}),
	makeItem({
		id: "d1",
		status: "dry_run",
		parsed_candidate_counts: {
			applied: 1,
			skipped: 0,
			conflicts: 0,
			dry_run: true,
		},
	}),
	makeItem({
		id: "d2",
		status: "partial",
		parsed_candidate_counts: {
			applied: 1,
			skipped: 0,
			conflicts: 0,
			dry_run: true,
		},
	}),
];

function getStatusBadges(): Element[] {
	return Array.from(
		document.querySelectorAll("article span.inline-flex.rounded-full"),
	);
}

function getArticles(): Element[] {
	return Array.from(document.querySelectorAll("article"));
}

function articleHasStatusBadge(article: Element, label: string): boolean {
	const spans = (article as HTMLElement).querySelectorAll(
		"span.inline-flex.rounded-full",
	);
	return Array.from(spans).some((s) => s.textContent?.trim() === label);
}

describe("DeepSynthesisApplyHistory", () => {
	beforeEach(() => {
		mockList.mockReset();
		mockGetDetail.mockReset();
	});

	it("shows empty state when no sessionId", () => {
		render(<DeepSynthesisApplyHistory sessionId={null} />);
		expect(screen.getByText(/请先选择或完成一个项目导入/)).toBeTruthy();
	});

	it("shows loading state initially", () => {
		mockList.mockReturnValue(new Promise(() => {}));
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		expect(screen.getByText(/正在加载应用历史/)).toBeTruthy();
	});

	it("shows empty state when no items", async () => {
		mockList.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 0 });
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(screen.getByText(/暂无深度合成应用记录/)).toBeTruthy();
		});
	});

	it("shows error state on failure", async () => {
		mockList.mockRejectedValue(new Error("Network error"));
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(screen.getByText("Network error")).toBeTruthy();
		});
	});

	it("renders apply history items", async () => {
		mockList.mockResolvedValue({
			items: [
				makeItem({
					id: "a1",
					status: "success",
					parsed_candidate_counts: { applied: 5, skipped: 2, conflicts: 1 },
				}),
				makeItem({
					id: "a2",
					status: "partial",
					parsed_candidate_counts: { applied: 3, skipped: 0, conflicts: 2 },
				}),
			],
			total: 2,
			limit: 10,
			offset: 0,
		});
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			const badges = getStatusBadges();
			const texts = badges.map((b) => b.textContent?.trim());
			expect(texts).toContain("成功");
			expect(texts).toContain("部分成功");
		});
	});

	it("displays total count", async () => {
		mockList.mockResolvedValue({
			items: [makeItem()],
			total: 25,
			limit: 10,
			offset: 0,
		});
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(screen.getByText(/共 25 条记录/)).toBeTruthy();
		});
	});

	it("shows pagination when total exceeds page size", async () => {
		const items = Array.from({ length: 10 }, (_, i) =>
			makeItem({ id: `a${i}` }),
		);
		mockList.mockResolvedValue({ items, total: 25, limit: 10, offset: 0 });
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(screen.getByText(/第 1 \/ 3 页/)).toBeTruthy();
			expect(screen.getByText("下一页")).toBeTruthy();
		});
	});

	it("refreshes on button click", async () => {
		mockList.mockResolvedValue({
			items: [makeItem()],
			total: 1,
			limit: 10,
			offset: 0,
		});
		const user = userEvent.setup();
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(screen.getByText("刷新")).toBeTruthy();
		});
		await user.click(screen.getByText("刷新"));
		await waitFor(() => {
			expect(mockList).toHaveBeenCalledTimes(2);
		});
	});

	it("default shows all loaded records", async () => {
		mockList.mockResolvedValue({
			items: MIXED_ITEMS,
			total: 5,
			limit: 10,
			offset: 0,
		});
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			const badges = getStatusBadges();
			expect(badges.length).toBeGreaterThanOrEqual(4);
			const texts = badges.map((b) => b.textContent?.trim());
			expect(texts).toContain("成功");
			expect(texts).toContain("部分成功");
			expect(texts).toContain("失败");
			expect(texts).toContain("预检");
		});
	});

	it("status success filter shows only success", async () => {
		mockList.mockResolvedValue({
			items: MIXED_ITEMS,
			total: 5,
			limit: 10,
			offset: 0,
		});
		const user = userEvent.setup();
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(getStatusBadges().length).toBeGreaterThanOrEqual(1);
		});
		await user.selectOptions(screen.getByLabelText(/状态/), "success");
		await waitFor(() => {
			const badges = getStatusBadges();
			expect(badges.length).toBe(1);
			expect(badges[0].textContent?.trim()).toBe("成功");
		});
	});

	it("status partial filter shows only partial", async () => {
		mockList.mockResolvedValue({
			items: MIXED_ITEMS,
			total: 5,
			limit: 10,
			offset: 0,
		});
		const user = userEvent.setup();
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(getArticles().length).toBeGreaterThanOrEqual(1);
		});
		await user.selectOptions(screen.getByLabelText(/状态/), "partial");
		await waitFor(() => {
			const articles = getArticles();
			expect(articles.length).toBe(2);
			expect(articles.every((a) => articleHasStatusBadge(a, "部分成功"))).toBe(
				true,
			);
		});
	});

	it("status failed filter shows only failed", async () => {
		mockList.mockResolvedValue({
			items: MIXED_ITEMS,
			total: 5,
			limit: 10,
			offset: 0,
		});
		const user = userEvent.setup();
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(getStatusBadges().length).toBeGreaterThanOrEqual(1);
		});
		await user.selectOptions(screen.getByLabelText(/状态/), "failed");
		await waitFor(() => {
			const badges = getStatusBadges();
			expect(badges.length).toBe(1);
			expect(badges[0].textContent?.trim()).toBe("失败");
		});
	});

	it("status dry_run filter shows dry-run items", async () => {
		mockList.mockResolvedValue({
			items: MIXED_ITEMS,
			total: 5,
			limit: 10,
			offset: 0,
		});
		const user = userEvent.setup();
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(getArticles().length).toBeGreaterThanOrEqual(1);
		});
		await user.selectOptions(screen.getByLabelText(/状态/), "dry_run");
		await waitFor(() => {
			const articles = getArticles();
			expect(articles.length).toBe(2);
			expect(articles.every((a) => articleHasStatusBadge(a, "预检"))).toBe(
				true,
			);
		});
	});

	it("conflict has_conflicts filter shows only items with conflicts", async () => {
		mockList.mockResolvedValue({
			items: MIXED_ITEMS,
			total: 5,
			limit: 10,
			offset: 0,
		});
		const user = userEvent.setup();
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(getStatusBadges().length).toBeGreaterThanOrEqual(1);
		});
		await user.selectOptions(screen.getByLabelText(/冲突/), "has_conflicts");
		await waitFor(() => {
			const badges = getStatusBadges();
			expect(badges.length).toBe(1);
			expect(badges[0].textContent?.trim()).toBe("部分成功");
		});
	});

	it("conflict no_conflicts filter excludes items with conflicts", async () => {
		mockList.mockResolvedValue({
			items: MIXED_ITEMS,
			total: 5,
			limit: 10,
			offset: 0,
		});
		const user = userEvent.setup();
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(getArticles().length).toBeGreaterThanOrEqual(1);
		});
		await user.selectOptions(screen.getByLabelText(/冲突/), "no_conflicts");
		await waitFor(() => {
			const articles = getArticles();
			expect(articles.length).toBe(4);
			const badgeTexts = articles.flatMap((a) =>
				Array.from(
					(a as HTMLElement).querySelectorAll("span.inline-flex.rounded-full"),
				).map((s) => s.textContent?.trim()),
			);
			expect(badgeTexts.filter((t) => t === "部分成功").length).toBe(1);
		});
	});

	it("run type real_apply filter shows non-dry-run records", async () => {
		mockList.mockResolvedValue({
			items: MIXED_ITEMS,
			total: 5,
			limit: 10,
			offset: 0,
		});
		const user = userEvent.setup();
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(getStatusBadges().length).toBeGreaterThanOrEqual(1);
		});
		await user.selectOptions(screen.getByLabelText(/运行类型/), "real_apply");
		await waitFor(() => {
			const badges = getStatusBadges();
			expect(badges.length).toBe(3);
			const texts = badges.map((b) => b.textContent?.trim());
			expect(texts).toContain("成功");
			expect(texts).toContain("部分成功");
			expect(texts).toContain("失败");
			expect(texts).not.toContain("预检");
		});
	});

	it("run type dry_run filter shows dry-run records", async () => {
		mockList.mockResolvedValue({
			items: MIXED_ITEMS,
			total: 5,
			limit: 10,
			offset: 0,
		});
		const user = userEvent.setup();
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(getArticles().length).toBeGreaterThanOrEqual(1);
		});
		await user.selectOptions(screen.getByLabelText(/运行类型/), "dry_run");
		await waitFor(() => {
			const articles = getArticles();
			expect(articles.length).toBe(2);
			expect(articles.every((a) => articleHasStatusBadge(a, "预检"))).toBe(
				true,
			);
		});
	});

	it("combined filters match correctly", async () => {
		mockList.mockResolvedValue({
			items: MIXED_ITEMS,
			total: 5,
			limit: 10,
			offset: 0,
		});
		const user = userEvent.setup();
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(getStatusBadges().length).toBeGreaterThanOrEqual(1);
		});
		await user.selectOptions(screen.getByLabelText(/状态/), "partial");
		await user.selectOptions(screen.getByLabelText(/冲突/), "has_conflicts");
		await waitFor(() => {
			const badges = getStatusBadges();
			expect(badges.length).toBe(1);
			expect(badges[0].textContent?.trim()).toBe("部分成功");
		});
	});

	it("reset filters restores all loaded records", async () => {
		mockList.mockResolvedValue({
			items: MIXED_ITEMS,
			total: 5,
			limit: 10,
			offset: 0,
		});
		const user = userEvent.setup();
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(getArticles().length).toBeGreaterThanOrEqual(1);
		});
		await user.selectOptions(screen.getByLabelText(/状态/), "success");
		await waitFor(() => {
			expect(getArticles().length).toBe(1);
		});
		await user.click(screen.getByText("重置筛选"));
		await waitFor(() => {
			expect(getArticles().length).toBe(5);
		});
	});

	it("filter-empty state appears for non-empty loaded page with zero filter matches", async () => {
		mockList.mockResolvedValue({
			items: MIXED_ITEMS,
			total: 5,
			limit: 10,
			offset: 0,
		});
		const user = userEvent.setup();
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(getArticles().length).toBeGreaterThanOrEqual(1);
		});
		await user.selectOptions(screen.getByLabelText(/状态/), "success");
		await user.selectOptions(screen.getByLabelText(/冲突/), "has_conflicts");
		await waitFor(() => {
			expect(
				screen.getByText(/当前筛选没有匹配的 Apply History 记录/),
			).toBeTruthy();
		});
	});

	it("filtered item can still open detail drawer", async () => {
		mockList.mockResolvedValue({
			items: MIXED_ITEMS,
			total: 5,
			limit: 10,
			offset: 0,
		});
		mockGetDetail.mockResolvedValue({
			detail_available: true,
			idempotency_snapshot_available: true,
			status: "success",
		} as DeepSynthesisApplyHistoryDetail);
		const user = userEvent.setup();
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(getStatusBadges().length).toBeGreaterThanOrEqual(1);
		});
		await user.selectOptions(screen.getByLabelText(/状态/), "success");
		await waitFor(() => {
			expect(getStatusBadges().length).toBe(1);
		});
		const detailButtons = screen.getAllByText("查看详情");
		await user.click(detailButtons[0]);
		await waitFor(() => {
			expect(mockGetDetail).toHaveBeenCalledTimes(1);
		});
	});

	it("refresh button still calls listApplyHistory", async () => {
		mockList.mockResolvedValue({
			items: MIXED_ITEMS,
			total: 5,
			limit: 10,
			offset: 0,
		});
		const user = userEvent.setup();
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(screen.getByText("刷新")).toBeTruthy();
		});
		const callCount = mockList.mock.calls.length;
		await user.click(screen.getByText("刷新"));
		await waitFor(() => {
			expect(mockList.mock.calls.length).toBeGreaterThan(callCount);
		});
	});

	it("refreshKey rerender calls listApplyHistory with offset 0", async () => {
		mockList.mockResolvedValue({
			items: [makeItem()],
			total: 1,
			limit: 10,
			offset: 0,
		});
		const { rerender } = render(
			<DeepSynthesisApplyHistory sessionId="sess-1" refreshKey={0} />,
		);
		await waitFor(() => {
			expect(mockList).toHaveBeenCalledTimes(1);
		});
		const callCountBefore = mockList.mock.calls.length;
		rerender(<DeepSynthesisApplyHistory sessionId="sess-1" refreshKey={1} />);
		await waitFor(() => {
			expect(mockList.mock.calls.length).toBeGreaterThan(callCountBefore);
			const lastCall = mockList.mock.calls[mockList.mock.calls.length - 1];
			expect(lastCall[0]).toMatchObject({ sessionId: "sess-1" });
		});
	});

	it("filter change after navigating to page 2 resets offset to 0 and preserves taskType", async () => {
		const page1Items = Array.from({ length: 10 }, (_, i) =>
			makeItem({
				id: `p1-${i}`,
				status: "success",
				parsed_candidate_counts: { applied: 1, skipped: 0, conflicts: 0 },
			}),
		);
		const page2Items = Array.from({ length: 5 }, (_, i) =>
			makeItem({
				id: `p2-${i}`,
				status: "partial",
				parsed_candidate_counts: { applied: 1, skipped: 0, conflicts: 0 },
			}),
		);
		mockList
			.mockResolvedValueOnce({
				items: page1Items,
				total: 15,
				limit: 10,
				offset: 0,
			})
			.mockResolvedValueOnce({
				items: page2Items,
				total: 15,
				limit: 10,
				offset: 10,
			});
		const user = userEvent.setup();
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(screen.getByText("下一页")).toBeTruthy();
		});
		await user.click(screen.getByText("下一页"));
		await waitFor(() => {
			expect(mockList).toHaveBeenCalledTimes(2);
			expect(mockList.mock.calls[1][0]).toMatchObject({ offset: 10 });
		});
		mockList.mockResolvedValue({
			items: page1Items,
			total: 15,
			limit: 10,
			offset: 0,
		});
		await user.selectOptions(screen.getByLabelText(/状态/), "partial");
		await waitFor(() => {
			const lastCall = mockList.mock.calls[mockList.mock.calls.length - 1];
			expect(lastCall[0]).toMatchObject({
				offset: 0,
				taskType: "deep_synthesis_apply",
			});
		});
	});

	it("calls preserve taskType deep_synthesis_apply", async () => {
		mockList.mockResolvedValue({
			items: [makeItem()],
			total: 1,
			limit: 10,
			offset: 0,
		});
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(mockList).toHaveBeenCalled();
			expect(mockList.mock.calls[0][0]).toMatchObject({
				taskType: "deep_synthesis_apply",
			});
		});
	});

	it("forbidden fields are not displayed", async () => {
		mockList.mockResolvedValue({
			items: [
				makeItem({
					id: "sec1",
					budget_summary: {
						idempotency_key: "secret-key-123",
						raw_response_text: "raw content",
						chapter_content: "chapter text",
					},
				}),
			],
			total: 1,
			limit: 10,
			offset: 0,
		});
		render(<DeepSynthesisApplyHistory sessionId="sess-1" />);
		await waitFor(() => {
			expect(getStatusBadges().length).toBeGreaterThanOrEqual(1);
		});
		const pageText = document.body.textContent ?? "";
		expect(pageText).not.toContain("secret-key-123");
		expect(pageText).not.toContain("raw content");
		expect(pageText).not.toContain("chapter text");
		expect(pageText).not.toContain("idempotency_key");
		expect(pageText).not.toContain("request_fingerprint");
	});
});
