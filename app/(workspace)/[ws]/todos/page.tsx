import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import { TodosWorkspace } from "@/components/features/todos/todos-workspace";
import type { TodoDetail } from "@/components/features/todos/shared";
import type {
  PersonalTodo,
  TodoChecklistItem,
  TodoLabel,
  TodoStage,
} from "@/lib/types";

export const metadata: Metadata = { title: "My to-dos" };

type TodoRow = PersonalTodo & {
  todo_label_links: { todo_labels: TodoLabel | null }[];
  todo_checklist_items: TodoChecklistItem[];
};

export default async function TodosPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { ws } = await params;
  const view = (await searchParams).view === "board" ? "board" : "list";
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const [{ data: stageRows }, { data: labelRows }, { data: todoRows }] =
    await Promise.all([
      supabase
        .from("todo_stages")
        .select("*")
        .eq("profile_id", ctx.userId)
        .eq("workspace_id", ctx.workspace.id)
        .order("sort_order"),
      supabase
        .from("todo_labels")
        .select("*")
        .eq("profile_id", ctx.userId)
        .eq("workspace_id", ctx.workspace.id)
        .order("name"),
      supabase
        .from("personal_todos")
        .select("*, todo_label_links(todo_labels(*)), todo_checklist_items(*)")
        .eq("profile_id", ctx.userId)
        .eq("workspace_id", ctx.workspace.id)
        .order("created_at", { ascending: false }),
    ]);

  const stages = (stageRows ?? []) as TodoStage[];
  const labels = (labelRows ?? []) as TodoLabel[];
  const todos: TodoDetail[] = ((todoRows ?? []) as unknown as TodoRow[]).map(
    (t) => {
      const { todo_label_links, todo_checklist_items, ...base } = t;
      return {
        ...base,
        labels: (todo_label_links ?? [])
          .map((l) => l.todo_labels)
          .filter((l): l is TodoLabel => l !== null),
        checklist: (todo_checklist_items ?? [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order),
      };
    }
  );

  return (
    <TodosWorkspace
      ws={ws}
      view={view}
      stages={stages}
      todos={todos}
      labels={labels}
    />
  );
}
