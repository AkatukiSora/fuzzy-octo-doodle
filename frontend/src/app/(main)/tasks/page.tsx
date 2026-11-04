"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "../../../components/layout/AppLayout";
import { TaskCard } from "../../../components/tasks/TaskCard";
import { TaskSection } from "../../../components/tasks/TaskSection";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Loading } from "../../../components/ui/Loading";
import type { TaskStatus } from "../../../types/task";
import styles from "./page.module.css";

interface TaskView {
  id: string;
  title: string;
  achievementCondition: string;
  deadlineAt: string;
  createdAt: string;
  status: TaskStatus;
}

interface TaskPage {
  items: TaskView[];
  nextCursor: string | null;
}

type TaskListView = "active" | "history";
type TaskFilter = "all" | "active" | "reviewing" | "success" | "failed";
type SectionStatus = "active" | "reviewing" | "success" | "failed" | "other";

const taskStatuses: readonly TaskStatus[] = [
  "active",
  "reviewing",
  "disputed",
  "success",
  "failed",
  "indeterminate",
  "closed",
];

const filters: { label: string; value: TaskFilter }[] = [
  { label: "すべて", value: "all" },
  { label: "進行中", value: "active" },
  { label: "審査中", value: "reviewing" },
  { label: "完了", value: "success" },
  { label: "失敗", value: "failed" },
];

const sections: SectionStatus[] = [
  "active",
  "reviewing",
  "success",
  "failed",
  "other",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTaskStatus(status: string): status is TaskStatus {
  return taskStatuses.some((taskStatus) => taskStatus === status);
}

function parseTask(value: unknown): TaskView {
  if (
    !isRecord(value) ||
    typeof value["id"] !== "string" ||
    typeof value["title"] !== "string" ||
    typeof value["achievementCondition"] !== "string" ||
    typeof value["deadlineAt"] !== "string" ||
    typeof value["createdAt"] !== "string" ||
    typeof value["status"] !== "string" ||
    !isTaskStatus(value["status"]) ||
    Number.isNaN(Date.parse(value["deadlineAt"])) ||
    Number.isNaN(Date.parse(value["createdAt"]))
  ) {
    throw new Error("タスク一覧の形式が正しくありません。");
  }

  return {
    id: value["id"],
    title: value["title"],
    achievementCondition: value["achievementCondition"],
    deadlineAt: value["deadlineAt"],
    createdAt: value["createdAt"],
    status: value["status"],
  };
}

async function fetchTasks(
  view: TaskListView,
  search: string,
  cursor?: string,
): Promise<TaskPage> {
  const query = new URLSearchParams({ view, limit: "50" });
  if (search) query.set("search", search);
  if (cursor) query.set("cursor", cursor);

  const response = await fetch(`/api/tasks?${query.toString()}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`タスクの取得に失敗しました（${String(response.status)}）。`);
  }

  const body: unknown = await response.json();
  if (
    !isRecord(body) ||
    !Array.isArray(body["items"]) ||
    !(typeof body["nextCursor"] === "string" || body["nextCursor"] === null)
  ) {
    throw new Error("タスク一覧の形式が正しくありません。");
  }

  return {
    items: body["items"].map(parseTask),
    nextCursor: body["nextCursor"],
  };
}

function getSectionStatus(status: TaskStatus): SectionStatus {
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

function matchesFilter(status: TaskStatus, filter: TaskFilter): boolean {
  if (filter === "all") return true;
  if (filter === "reviewing") {
    return status === "reviewing" || status === "disputed";
  }
  return status === filter;
}

function formatDate(value: string, includeTime: boolean): string {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime
      ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const }
      : {}),
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const formatted = get("year") + "/" + get("month") + "/" + get("day");
  return includeTime
    ? formatted + " " + get("hour") + ":" + get("minute")
    : formatted;
}

function getRemainingText(task: TaskView): string | undefined {
  if (task.status !== "active") return undefined;
  const remainingMilliseconds = Date.parse(task.deadlineAt) - Date.now();
  if (remainingMilliseconds <= 0) return "期限を過ぎています";
  const remainingHours = Math.ceil(remainingMilliseconds / (60 * 60 * 1000));
  if (remainingHours < 24) return "あと" + String(remainingHours) + "時間";
  return "あと" + String(Math.ceil(remainingHours / 24)) + "日";
}

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [cursors, setCursors] = useState<Record<TaskListView, string | null>>({
    active: null,
    history: null,
  });
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMoreError(null);
    const loadTasks = async () => {
      try {
        const [activePage, historyPage] = await Promise.all([
          fetchTasks("active", search),
          fetchTasks("history", search),
        ]);
        if (cancelled) return;
        setTasks([...activePage.items, ...historyPage.items]);
        setCursors({
          active: activePage.nextCursor,
          history: historyPage.nextCursor,
        });
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "タスクの取得に失敗しました。",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadTasks();

    return () => {
      cancelled = true;
    };
  }, [search, reloadKey]);

  const filteredTasks = useMemo(
    () => tasks.filter((task) => matchesFilter(task.status, filter)),
    [filter, tasks],
  );
  const groupedTasks = useMemo(
    () =>
      sections.map((status) => ({
        status,
        tasks: filteredTasks.filter(
          (task) => getSectionStatus(task.status) === status,
        ),
      })),
    [filteredTasks],
  );
  const hasMore = cursors.active !== null || cursors.history !== null;

  async function loadMore() {
    setLoadingMore(true);
    setMoreError(null);
    try {
      const [activePage, historyPage] = await Promise.all([
        cursors.active
          ? fetchTasks("active", search, cursors.active)
          : Promise.resolve(null),
        cursors.history
          ? fetchTasks("history", search, cursors.history)
          : Promise.resolve(null),
      ]);
      const nextTasks = [
        ...(activePage?.items ?? []),
        ...(historyPage?.items ?? []),
      ];
      setTasks((current) => [...current, ...nextTasks]);
      setCursors({
        active: activePage?.nextCursor ?? null,
        history: historyPage?.nextCursor ?? null,
      });
    } catch (loadError) {
      setMoreError(
        loadError instanceof Error
          ? loadError.message
          : "タスクを追加で読み込めませんでした。",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  function submitSearch(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(draftSearch.trim());
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
              setSearchOpen((open) => !open);
            }}
            aria-label={searchOpen ? "検索を閉じる" : "タスクを検索"}
            aria-expanded={searchOpen}
            aria-controls="task-search-panel"
          >
            {searchOpen ? (
              <svg
                viewBox="0 0 24 24"
                width="26"
                height="26"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="26"
                height="26"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="10.8" cy="10.8" r="6.8" />
                <path d="m16 16 4 4" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className={styles["headerButton"]}
            onClick={() => {
              setFiltersOpen((open) => !open);
            }}
            aria-label={filtersOpen ? "絞り込みを閉じる" : "絞り込みを開く"}
            aria-expanded={filtersOpen}
            aria-controls="task-status-filters"
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M7 12h10m-7 5h4" />
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
                  setDraftSearch(event.target.value);
                }}
                placeholder="タスクを検索"
              />
              <button type="submit" aria-label="検索">
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <circle cx="10.8" cy="10.8" r="6.8" />
                  <path d="m16 16 4 4" />
                </svg>
              </button>
            </form>
            {(draftSearch || search) && (
              <button
                type="button"
                className={styles["clearSearch"]}
                onClick={() => {
                  setDraftSearch("");
                  setSearch("");
                }}
              >
                クリア
              </button>
            )}
          </div>
        )}

        {filtersOpen && (
          <div
            className={styles["filters"]}
            id="task-status-filters"
            aria-label="タスクの絞り込み"
          >
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                className={[
                  styles["filter"] ?? "",
                  filter === item.value ? styles["selected"] ?? "" : "",
                ].join(" ")}
                onClick={() => {
                  setFilter(item.value);
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
              setReloadKey((key) => key + 1);
            }}
          />
        ) : filteredTasks.length === 0 ? (
          <EmptyState
            title={search || filter !== "all" ? "タスクが見つかりません" : "タスクはありません"}
            description={
              search || filter !== "all"
                ? "検索条件や絞り込みを変更してください。"
                : "新しいタスクを作成して、目標に挑戦しましょう。"
            }
          />
        ) : (
          <div className={styles["sections"]}>
            {groupedTasks.map(
              ({ status, tasks: sectionTasks }) =>
                sectionTasks.length > 0 && (
                  <TaskSection
                    key={status}
                    status={status}
                    count={sectionTasks.length}
                  >
                    {sectionTasks.map((task) => {
                      const remainingText = getRemainingText(task);
                      return (
                        <TaskCard
                          key={task.id}
                          title={task.title}
                          description={task.achievementCondition}
                          deadline={formatDate(
                            status === "success" ||
                              status === "failed" ||
                              status === "other"
                              ? task.createdAt
                              : task.deadlineAt,
                            status === "active" || status === "reviewing",
                          )}
                          status={task.status}
                          {...(remainingText === undefined
                            ? {}
                            : { remainingText })}
                          onClick={() => {
                            router.push(`/tasks/${encodeURIComponent(task.id)}`);
                          }}
                        />
                      );
                    })}
                  </TaskSection>
                ),
            )}
          </div>
        )}

        {moreError && <p className={styles["moreError"]} role="alert">{moreError}</p>}
        {!loading && !error && hasMore && (
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
