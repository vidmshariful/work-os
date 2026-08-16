import Link from "next/link";
import { PersonAvatar } from "@/components/primitives/avatar";
import { Tag } from "@/components/primitives/tag";
import { ROLE_LABELS } from "@/components/shell/sidebar";
import { ARCHETYPE_META, type Member } from "./labels";

interface TreeNode {
  member: Member;
  children: TreeNode[];
}

// Builds the reporting tree from reports_to. Roots are people who report to
// nobody, or whose manager is not an active member here.
function buildTree(members: Member[]): TreeNode[] {
  const byId = new Map(members.map((m) => [m.profile_id, m]));
  const nodes = new Map<string, TreeNode>(
    members.map((m) => [m.profile_id, { member: m, children: [] }])
  );
  const roots: TreeNode[] = [];
  for (const m of members) {
    const node = nodes.get(m.profile_id)!;
    if (m.reports_to && byId.has(m.reports_to) && m.reports_to !== m.profile_id) {
      nodes.get(m.reports_to)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (list: TreeNode[]) => {
    list.sort((a, b) =>
      a.member.profile.full_name.localeCompare(b.member.profile.full_name)
    );
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function OrgNode({ node, ws, depth }: { node: TreeNode; ws: string; depth: number }) {
  const m = node.member;
  const meta = ARCHETYPE_META[m.archetype];
  return (
    <div className={depth > 0 ? "ml-5 border-l border-border pl-4" : ""}>
      <Link
        href={`/${ws}/team/${m.profile_id}`}
        className="group my-1.5 flex items-center gap-3 rounded-[10px] border border-border bg-surface px-3.5 py-2.5 shadow-[var(--shadow-card)] transition-colors hover:border-border-strong"
      >
        <PersonAvatar name={m.profile.full_name} src={m.profile.avatar_url} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-medium text-text-1">
            {m.profile.full_name}
          </span>
          <span className="block text-meta text-text-3">
            {ROLE_LABELS[m.role] ?? m.role}
          </span>
        </span>
        <Tag tone={meta.tone}>{meta.label}</Tag>
        {node.children.length > 0 ? (
          <span className="font-mono text-label text-text-3 tabular">
            {node.children.length} report{node.children.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </Link>
      {node.children.map((child) => (
        <OrgNode key={child.member.id} node={child} ws={ws} depth={depth + 1} />
      ))}
    </div>
  );
}

export function OrgChart({ members, ws }: { members: Member[]; ws: string }) {
  const roots = buildTree(members);
  return (
    <div>
      {roots.map((node) => (
        <OrgNode key={node.member.id} node={node} ws={ws} depth={0} />
      ))}
    </div>
  );
}
