"use client";

import { TaskCard } from "../tasks/TaskCard";
import { Button } from "../ui/Button";
import { isTaskOverdue, type FriendActivityTask, type TaskSort } from "../../lib/friendDetailApi";
import { taskRemainingText } from "../../lib/task-detail-display";
import styles from "./FriendDetailContent.module.css";

interface Props {
  friendId: string;
  tasks: FriendActivityTask[];
  sort: TaskSort;
  onSort: (sort: TaskSort) => void;
  nextCursor: string | null;
  onMore: () => void;
  loadingMore: boolean;
  now: number;
}
export function FriendActivityList({ friendId, tasks, now, sort, onSort, nextCursor, onMore, loadingMore }: Props) {
  return (
    <section aria-labelledby="friend-tasks-heading">
      <div className={styles["listHeading"]}>
        <h2 id="friend-tasks-heading">進行中のタスク</h2>
        <label className={styles["sort"]}>並び順
          <select value={sort} onChange={event => { onSort(event.target.value === "latest" ? "latest" : "soonest"); }}>
            <option value="soonest">期限が近い順</option><option value="latest">期限が遠い順</option>
          </select>
        </label>
      </div>
      {tasks.length === 0 ? <p>表示するタスクはありません。</p> : (
        <ul className={styles["taskList"]}>
          {tasks.map(task => {
            const overdue = isTaskOverdue(task, now);
            const remaining = Date.parse(task.dueAt) === now ? "残り1分未満" : taskRemainingText(task.dueAt, task.status, now);
            const label = task.status === "reviewing" ? "審査期限" : task.status === "disputed" ? "追加提出期限" : "期限";
            return <li key={task.id} className={overdue ? styles["overdue"] : undefined}>
              <TaskCard href={`/friends/${encodeURIComponent(friendId)}/tasks/${encodeURIComponent(task.id)}`} title={task.title} description={task.achievementCondition || "達成条件の指定なし"} deadline={`${label}：${new Date(task.dueAt).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`} status={task.status} remainingText={remaining} />
            </li>;
          })}
        </ul>
      )}
      {nextCursor && <Button fullWidth variant="secondary" disabled={loadingMore} onClick={onMore}>{loadingMore ? "読み込み中..." : "さらに表示"}</Button>}
    </section>
  );
}
