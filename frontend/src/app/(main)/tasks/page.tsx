"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { z } from "zod";
import { AppLayout } from "../../../components/layout/AppLayout";
import { TaskCard } from "../../../components/tasks/TaskCard";
import { TaskSection } from "../../../components/tasks/TaskSection";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Loading } from "../../../components/ui/Loading";
import { formatTaskCardDate } from "../../../lib/task-list-display";
import { createInitialTaskListState, taskListReducer } from "../../../lib/task-list-state";
import styles from "./page.module.css";

const taskStatusSchema = z.enum([
  "active",
  "reviewing",
  "disputed",
  "success",
  "failed",
  "indeterminate",
  "closed",
]);

const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  achievementCondition: z.string(),
  deadlineAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  status: taskStatusSchema,
});

const taskPageSchema = z.object({
  items: z.array(taskSchema),
  nextCursor: z.string().min(1).nullable(),
});

type TaskView = z.infer<typeof taskSchema>;
type TaskListView = "active" | "history";
type TaskFilter = "all" | TaskView["status"];
type SectionStatus = "active" | "reviewing" | "success" | "failed" | "other";

const views: { label: string; value: TaskListView }[] = [
  { label: "進行中", value: "active" },
  { label: "履歴", value: "history" },
];

const filtersByView: Record<TaskListView, { label: string; value: TaskFilter }[]> = {
  active: [
    { label: "すべて", value: "all" },
    { label: "進行中", value: "active" },
    { label: "審査中", value: "reviewing" },
    { label: "異議あり", value: "disputed" },
  ],
  history: [
    { label: "すべて", value: "all" },
    { label: "完了", value: "success" },
    { label: "未達成", value: "failed" },
    { label: "判定不能", value: "indeterminate" },
    { label: "終了", value: "closed" },
  ],
};

const sections: SectionStatus[] = ["active", "reviewing", "success", "failed", "other"];

async function fetchTasks({
  view,
  search,
  cursor,
  signal,
  status,
}: {
  view: TaskListView;
  search: string;
  cursor?: string;
  signal?: AbortSignal;
  status?: TaskView["status"];
}) {
  const query = new URLSearchParams({ view, limit: "50" });
  if (search) query.set("search", search);
  if (cursor) query.set("cursor", cursor);
  if (status) query.set("status", status);

  const response = await fetch(`/api/tasks?${query.toString()}`, {
    credentials: "include",
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) {
    throw new Error(`タスクの取得に失敗しました（${String(response.status)}）。`);
  }

  const result = taskPageSchema.safeParse(await response.json());
  if (!result.success) throw new Error("タスク一覧の形式が正しくありません。");
  return result.data;
}

function getSectionStatus(status: TaskView["status"]): SectionStatus {
  switch (status) {
    case "active":
      return "active";
    case "reviewing":
    case "disputed":
      return "reviewing";
    case "success":
      return "success";
    case "failed":
      return "failed";
    case "indeterminate":
    case "closed":
      return "other";
  }
}

function getRemainingText(task: TaskView): string | undefined {
  if (task.status !== "active") return undefined;
  const remainingMilliseconds = Date.parse(task.deadlineAt) - Date.now();
  if (remainingMilliseconds <= 0) return "期限を過ぎています";
  const remainingHours = Math.ceil(remainingMilliseconds / (60 * 60 * 1000));
  if (remainingHours < 24) return `あと${String(remainingHours)}時間`;
  return `あと${String(Math.ceil(remainingHours / 24))}日`;
}

export default function TasksPage() {
  const requestGeneration = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [view, setView] = useState<TaskListView>("active");
  const [listState, dispatchListState] = useReducer(
    taskListReducer<TaskView["status"]>,
    createInitialTaskListState<TaskView["status"]>(),
  );
  const { draftSearch, search, searchOpen, filtersOpen, filter } = listState;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const controller = new AbortController();
    const generation = requestGeneration.current;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setMoreError(null);
    setTasks([]);
    setNextCursor(null);

    void fetchTasks({
      view,
      search,
      ...(filter === "all" ? {} : { status: filter }),
      signal: controller.signal,
    })
      .then((page) => {
        if (controller.signal.aborted || generation !== requestGeneration.current) return;
        setTasks(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted || generation !== requestGeneration.current) return;
        setError(
          loadError instanceof Error ? loadError.message : "タスクの取得に失敗しました。",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted && generation === requestGeneration.current) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [filter, reloadKey, search, view]);

  const groupedTasks = useMemo(
    () =>
      sections.map((status) => ({
        status,
        tasks: tasks.filter((task) => getSectionStatus(task.status) === status),
      })),
    [tasks],
  );

  async function loadMore() {
    if (nextCursor === null || loadingMore) return;
    const generation = requestGeneration.current;
    const currentView = view;
    const currentSearch = search;
    const currentFilter = filter;
    const cursor = nextCursor;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await fetchTasks({
        view: currentView,
        search: currentSearch,
        cursor,
        ...(currentFilter === "all" ? {} : { status: currentFilter }),
      });
      if (generation !== requestGeneration.current) return;
      setTasks((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      if (generation !== requestGeneration.current) return;
      setMoreError(
        loadError instanceof Error
          ? loadError.message
          : "タスクを追加で読み込めませんでした。",
      );
    } finally {
      if (generation === requestGeneration.current) setLoadingMore(false);
    }
  }

  function submitSearch(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = draftSearch.trim();
    if (nextSearch !== search) requestGeneration.current += 1;
    dispatchListState({ type: "apply-search" });
  }

  function selectView(nextView: TaskListView) {
    if (nextView === view) return;
    requestGeneration.current += 1;
    setView(nextView);
    dispatchListState({ type: "change-view" });
  }

  function selectFilter(nextFilter: TaskFilter) {
    if (nextFilter === filter) return;
    requestGeneration.current += 1;
    dispatchListState({ type: "select-filter", filter: nextFilter });
  }

  function clearSearch() {
    if (search !== "") requestGeneration.current += 1;
    dispatchListState({ type: "clear-search" });
  }

  return (
    <AppLayout
      title="マイタスク"
      headerActions={
        <div className={styles["headerActions"]}>
          <button
            type="button"
            className={styles["headerButton"]}
            onClick={() => {
              if (searchOpen && search !== "") requestGeneration.current += 1;
              dispatchListState({ type: "toggle-search-panel" });
            }}
            aria-label={searchOpen ? "検索を閉じる" : "タスクを検索"}
            aria-expanded={searchOpen}
            aria-controls={searchOpen ? "task-search-panel" : undefined}
          >
            {searchOpen ? (
              <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none">
                <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none">
                <circle cx="10.8" cy="10.8" r="6.4" stroke="currentColor" strokeWidth="1.8" />
                <path d="m15.5 15.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className={styles["headerButton"]}
            onClick={() => {
              if (filtersOpen && filter !== "all") requestGeneration.current += 1;
              dispatchListState({ type: "toggle-filter-panel" });
            }}
            aria-label={filtersOpen ? "絞り込みを閉じる" : "絞り込みを開く"}
            aria-expanded={filtersOpen}
            aria-controls={filtersOpen ? "task-status-filters" : undefined}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="9" cy="6" r="2" fill="white" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="15" cy="12" r="2" fill="white" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="9" cy="18" r="2" fill="white" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
        </div>
      }
    >
      <div className={styles["page"]}>
        {searchOpen && (
          <div className={styles["searchPanel"]} id="task-search-panel">
            <form className={styles["search"]} onSubmit={submitSearch} role="search">
              <label className={styles["visuallyHidden"]} htmlFor="task-search">
                タスクを検索
              </label>
              <input
                id="task-search"
                ref={searchInputRef}
                type="search"
                value={draftSearch}
                onChange={(event) => {
                  dispatchListState({ type: "draft-search-changed", value: event.target.value });
                }}
                placeholder="タスクを検索"
              />
              <button type="submit" aria-label="検索">
                検索
              </button>
            </form>
            {(draftSearch || search) && (
              <button type="button" className={styles["clearSearch"]} onClick={clearSearch}>
                クリア
              </button>
            )}
          </div>
        )}

        <div className={styles["views"]} role="group" aria-label="タスクの表示">
          {views.map((item) => (
            <button
              key={item.value}
              type="button"
              className={[
                styles["view"],
                view === item.value ? styles["viewSelected"] : "",
              ].filter(Boolean).join(" ")}
              onClick={() => {
                selectView(item.value);
              }}
              aria-pressed={view === item.value}
            >
              {item.label}
            </button>
          ))}
        </div>

        {filtersOpen && (
          <div
            className={styles["filters"]}
            id="task-status-filters"
            role="group"
            aria-label="状態で絞り込む"
          >
            {filtersByView[view].map((item) => (
              <button
                key={item.value}
                type="button"
                className={[
                  styles["filter"],
                  filter === item.value ? styles["selected"] : "",
                ].filter(Boolean).join(" ")}
                onClick={() => {
                  selectFilter(item.value);
                }}
                aria-pressed={filter === item.value}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <Loading message="タスクを読み込んでいます..." />
        ) : error ? (
          <ErrorState
            description={error}
            onRetry={() => {
              requestGeneration.current += 1;
              setReloadKey((key) => key + 1);
            }}
          />
        ) : tasks.length === 0 ? (
          <EmptyState
            title={search || filter !== "all" ? "タスクが見つかりません" : view === "history" ? "履歴はありません" : "タスクはありません"}
            description={
              search || filter !== "all"
                ? "検索条件や絞り込みを変更してください。"
                : view === "history"
                  ? "完了したタスクはここに表示されます。"
                  : "新しいタスクを作成して、目標に挑戦しましょう。"
            }
          />
        ) : (
          <div className={styles["sections"]}>
            {groupedTasks.map(({ status, tasks: sectionTasks }) =>
              sectionTasks.length > 0 ? (
                <TaskSection key={status} status={status} count={sectionTasks.length}>
                  {sectionTasks.map((task) => {
                    const remainingText = getRemainingText(task);
                    const isHistory = view === "history";
                    return (
                      <TaskCard
                        key={task.id}
                        href={`/tasks/${encodeURIComponent(task.id)}`}
                        title={task.title}
                        description={task.achievementCondition}
                        deadline={formatTaskCardDate(
                          isHistory ? task.createdAt : task.deadlineAt,
                          isHistory,
                          !isHistory && (status === "active" || status === "reviewing"),
                        )}
                        status={task.status}
                        {...(remainingText === undefined ? {} : { remainingText })}
                      />
                    );
                  })}
                </TaskSection>
              ) : null,
            )}
          </div>
        )}

        {moreError && <p className={styles["moreError"]} role="alert">{moreError}</p>}
        {!loading && !error && nextCursor !== null && (
          <button
            type="button"
            className={styles["loadMore"]}
            onClick={() => {
              void loadMore();
            }}
            disabled={loadingMore}
          >
            {loadingMore ? "読み込み中..." : "もっと読み込む"}
          </button>
        )}
      </div>
    </AppLayout>
  );
}
