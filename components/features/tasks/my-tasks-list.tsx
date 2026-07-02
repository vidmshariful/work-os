import Link from "next/link";
import { SquareCheckBig } from "lucide-react";
import { Card } from "@/components/primitives/card";
import { ListRow } from "@/components/primitives/list-row";
import { TaskStatusChip } from "@/components/primitives/tag";
import { CodeLabel, CountBadge } from "@/components/primitives/misc";
import { EmptyState } from "@/components/primitives/empty-state";
import { Button } from "@/components/ui/button";
import { daysUntil } from "@/lib/format";
import type { TaskStatus } from "@/lib/types";
import { TaskStatusSelect } from "./task-status-select";
import {
  DueDateLabel,
  RevisionHint,
  MY_TASKS_STATUS_ORDER,
  STATUS_LABELS,
} from "./task-bits";

export interface MyTask {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  revision_count: number;
  completed_at: string | null;
  project: { code: string };
}

const DONE_LIMIT = 10;

function doneRecentFirst(tasks: MyTask[]) {
  return tasks
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .slice(0, DONE_LIMIT);
}

function groupByStatus(tasks: MyTask[]) {
  return MY_TASKS_STATUS_ORDER.map((status) => ({
    label: STATUS_LABELS[status],
    tasks:
      status === "done"
        ? doneRecentFirst(tasks)
        : tasks.filter((t) => t.status === status),
  })).filter((g) => g.tasks.length > 0);
}

function groupByDue(tasks: MyTask[]) {
  const open = tasks.filter((t) => t.status !== "done");
  const bucket = (t: MyTask) => {
    const days = daysUntil(t.due_date);
    if (days === null) return "none";
    if (days < 0) return "overdue";
    if (days === 0) return "today";
    if (days <= 7) return "week";
    return "later";
  };
  const groups = [
    { key: "overdue", label: "Overdue" },
    { key: "today", label: "Today" },
    { key: "week", label: "This week" },
    { key: "later", label: "Later" },
    { key: "none", label: "No due date" },
  ].map((g) => ({
    label: g.label,
    tasks: open.filter((t) => bucket(t) === g.key),
  }));
  groups.push({ label: "Done", tasks: doneRecentFirst(tasks) });
  return groups.filter((g) => g.tasks.length > 0);
}

export function MyTasksList({
  ws,
  tasks,
  groupBy,
}: {
  ws: string;
  tasks: MyTask[];
  groupBy: "status" | "due";
}) {
  const groups = groupBy === "due" ? groupByDue(tasks) : groupByStatus(tasks);

  if (groups.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<SquareCheckBig />}
          title="Nothing assigned to you yet. The project boards show what the team is working on."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={`/${ws}/projects`}>Browse projects</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.label}>
          <div className="flex items-center gap-2 px-1">
            <span className="group-label">{group.label}</span>
            <CountBadge count={group.tasks.length} className="ml-0" />
          </div>
          <Card className="mt-2">
            {group.tasks.map((t) => (
              <ListRow
                key={t.id}
                title={
                  <Link
                    href={`/${ws}/tasks/${t.id}`}
                    className="hover:underline"
                  >
                    {t.title}
                  </Link>
                }
                subtitle={<CodeLabel code={t.project.code} />}
                meta={
                  <>
                    <RevisionHint count={t.revision_count} />
                    <DueDateLabel date={t.due_date} status={t.status} />
                    <TaskStatusChip status={t.status} />
                  </>
                }
                trailing={
                  <TaskStatusSelect ws={ws} taskId={t.id} status={t.status} />
                }
              />
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}
