"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const statuses = ["new", "in_progress", "in_review", "delivered", "revision_requested", "completed"] as const;
type RequestStatus = (typeof statuses)[number];
type TeamMember = { id: string; email: string; name: string };
type RequestRow = {
  id: string;
  user_id: string;
  name: string;
  prompt: string | null;
  source_type: string | null;
  source_url: string | null;
  workflow_status: RequestStatus;
  assigned_to: string | null;
  workflow_status_changed_at: string;
  created_at: string;
  updated_at: string;
  customer: { id: string; name: string; email: string | null; plan: string; request_count: number };
  latest_version: { title: string; video_url: string; thumbnail_url: string | null; is_delivered: boolean; version_number: number } | null;
};

type WorkspaceResponse = { requests: RequestRow[]; team: TeamMember[]; currentAdminId: string };

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusStyle(status: string) {
  if (status === "revision_requested") return "border-red-200 bg-red-50 text-red-700";
  if (status === "delivered" || status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "in_progress" || status === "in_review") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-line bg-paper text-muted";
}

function elapsedSince(value: string, now: number) {
  const hours = Math.max(0, Math.floor((now - new Date(value).getTime()) / 3_600_000));
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function AdminRequestWorkspace({ view }: { view: "overview" | "requests" }) {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [currentAdminId, setCurrentAdminId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("oldest");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<RequestStatus>("in_progress");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  async function loadRequests() {
    try {
      const response = await fetch("/api/admin/requests", { cache: "no-store" });
      const result = await response.json() as WorkspaceResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to load requests.");
      setRequests(result.requests);
      setTeam(result.team);
      setCurrentAdminId(result.currentAdminId);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRequests();
    const supabase = createClient();
    const channel = supabase
      .channel("admin-request-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => void loadRequests())
      .subscribe();
    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.clearInterval(clock);
      void supabase.removeChannel(channel);
    };
  }, []);

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = requests.filter((request) => {
      if (statusFilter !== "all" && request.workflow_status !== statusFilter) return false;
      if (dateFrom && request.created_at.slice(0, 10) < dateFrom) return false;
      if (dateTo && request.created_at.slice(0, 10) > dateTo) return false;
      if (scope === "mine" && request.assigned_to !== currentAdminId) return false;
      if (!query) return true;
      return `${request.name} ${request.prompt ?? ""} ${request.source_url ?? ""} ${request.customer.name} ${request.customer.email ?? ""}`.toLowerCase().includes(query);
    });

    filtered.sort((left, right) => {
      if (sort === "newest") return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      if (sort === "status") return statuses.indexOf(left.workflow_status) - statuses.indexOf(right.workflow_status);
      return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    });
    return filtered;
  }, [currentAdminId, dateFrom, dateTo, requests, scope, search, sort, statusFilter]);

  const summary = useMemo(() => {
    const pending = requests.filter((request) => request.workflow_status === "new" || request.workflow_status === "revision_requested").length;
    const inProgress = requests.filter((request) => request.workflow_status === "in_progress" || request.workflow_status === "in_review").length;
    const overdue = requests.filter((request) => !["delivered", "completed"].includes(request.workflow_status) && now - new Date(request.workflow_status_changed_at).getTime() > 24 * 3_600_000).length;
    const today = new Date(now);
    const todayKey = dateKey(today);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const weekKey = dateKey(weekStart);
    const completedToday = requests.filter((request) => request.workflow_status === "completed" && dateKey(new Date(request.updated_at ?? request.created_at)) === todayKey).length;
    const completedWeek = requests.filter((request) => request.workflow_status === "completed" && dateKey(new Date(request.updated_at ?? request.created_at)) >= weekKey).length;
    const start = new Date(today);
    start.setDate(today.getDate() - 13);
    start.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = dateKey(date);
      return { key, label: date.toLocaleDateString(undefined, { weekday: "short" }), count: requests.filter((request) => request.created_at.slice(0, 10) === key).length };
    });
    return { pending, inProgress, overdue, completedToday, completedWeek, days };
  }, [now, requests]);

  async function runBulkAction(action: "status" | "assign") {
    if (!selected.length || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "status"
          ? { ids: selected, action, status: bulkStatus }
          : { ids: selected, action, assignedTo: bulkAssignee || null }),
      });
      const result = await response.json() as { error?: string; updated?: number };
      if (!response.ok) throw new Error(result.error ?? "Unable to update requests.");
      setMessage(`${result.updated ?? selected.length} requests updated.`);
      setSelected([]);
      await loadRequests();
    } catch (actionError) {
      setMessage(actionError instanceof Error ? actionError.message : "Unable to update requests.");
    } finally {
      setBusy(false);
    }
  }

  if (view === "overview") {
    const attention = requests
      .filter((request) => !["delivered", "completed"].includes(request.workflow_status) && now - new Date(request.workflow_status_changed_at).getTime() > 24 * 3_600_000)
      .sort((left, right) => new Date(left.workflow_status_changed_at).getTime() - new Date(right.workflow_status_changed_at).getTime())
      .slice(0, 8);
    const maxCount = Math.max(1, ...summary.days.map((day) => day.count));

    return (
      <div className="mt-6 space-y-6">
        {error ? <ErrorBanner message={error} onRetry={() => void loadRequests()} /> : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label="Pending" value={summary.pending} tone="rose" />
          <SummaryCard label="In progress" value={summary.inProgress} tone="sage" />
          <SummaryCard label="Overdue · 24h+" value={summary.overdue} tone="peach" />
          <SummaryCard label="Completed today" value={summary.completedToday} tone="sky" />
          <SummaryCard label="Completed this week" value={summary.completedWeek} tone="ink" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-lg border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-[15px] font-medium text-ink-2">Requests · last 14 days</h2>
              <span className="text-[12px] text-muted">{requests.length} total</span>
            </div>
            <div className="mt-6 grid h-40 grid-cols-14 items-end gap-2" role="img" aria-label="Requests created per day over the last 14 days">
              {summary.days.map((day) => (
                <div key={day.key} className="flex h-full min-w-0 flex-col items-center justify-end gap-2" title={`${day.key}: ${day.count}`}>
                  <span className="text-[10px] tabular-nums text-muted">{day.count || ""}</span>
                  <div className="w-full max-w-8 rounded-t-[3px] bg-olive" style={{ height: `${Math.max(day.count ? 10 : 3, (day.count / maxCount) * 100)}%` }} />
                  <span className="text-[9px] text-muted">{day.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-[15px] font-medium text-ink-2">Needs attention</h2>
              <span className="text-[12px] text-muted">Stuck more than 24h</span>
            </div>
            <div className="mt-4 divide-y divide-line">
              {attention.map((request) => (
                <Link key={request.id} href={`/admin/requests/${request.id}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 hover:text-ink">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-ink-2">{request.name}</span>
                    <span className="mt-1 block text-[11px] text-muted">{statusLabel(request.workflow_status)} · {request.customer.name}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-red-700">{elapsedSince(request.workflow_status_changed_at, now)}</span>
                </Link>
              ))}
              {!attention.length ? <p className="py-6 text-[13px] text-muted">Nothing is overdue.</p> : null}
            </div>
          </section>
        </div>
      </div>
    );
  }

  const selectableIds = filteredRequests.map((request) => request.id);
  const allVisibleSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id));

  return (
    <section className="mt-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[16px] font-medium text-ink-2">Request queue</h2>
          <p className="mt-1 text-[12px] text-muted">Oldest first · {filteredRequests.length} shown</p>
        </div>
        {team.length > 1 ? (
          <div className="flex rounded-[8px] border border-line p-0.5" role="group" aria-label="Request assignment scope">
            {(["all", "mine"] as const).map((option) => (
              <button key={option} type="button" aria-pressed={scope === option} onClick={() => setScope(option)} className={`rounded-[6px] px-3 py-1.5 text-[12px] ${scope === option ? "bg-ink text-surface" : "text-muted hover:text-ink"}`}>
                {option === "all" ? "All requests" : "My requests"}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 rounded-lg border border-line bg-surface p-3 md:grid-cols-2 xl:grid-cols-5">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search prompt, customer, email" className="h-10 rounded-[8px] border border-line bg-paper px-3 text-[13px] outline-none focus:border-[#b7aa9c] xl:col-span-2" />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-[8px] border border-line bg-paper px-3 text-[13px] text-ink">
          <option value="all">All statuses</option>
          {statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 rounded-[8px] border border-line bg-paper px-3 text-[13px] text-ink">
          <option value="oldest">Oldest first</option>
          <option value="newest">Newest first</option>
          <option value="status">By status</option>
        </select>
        <div className="flex items-center gap-2">
          <input aria-label="Created from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-10 min-w-0 flex-1 rounded-[8px] border border-line bg-paper px-2 text-[11px] text-ink" />
          <input aria-label="Created to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-10 min-w-0 flex-1 rounded-[8px] border border-line bg-paper px-2 text-[11px] text-ink" />
        </div>
      </div>

      {selected.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-sidebar p-3">
          <span className="mr-2 text-[12px] font-medium text-ink-2">{selected.length} selected</span>
          <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as RequestStatus)} className="h-9 rounded-[7px] border border-line bg-surface px-2 text-[12px]">
            {statuses.filter((status) => status !== "delivered").map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={() => void runBulkAction("status")} className="h-9 rounded-[7px] bg-ink px-3 text-[12px] font-medium text-surface disabled:opacity-50">Change status</button>
          {team.length > 1 ? (
            <>
              <select value={bulkAssignee} onChange={(event) => setBulkAssignee(event.target.value)} className="h-9 rounded-[7px] border border-line bg-surface px-2 text-[12px]">
                <option value="">Unassigned</option>
                {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
              <button type="button" disabled={busy} onClick={() => void runBulkAction("assign")} className="h-9 rounded-[7px] border border-line bg-surface px-3 text-[12px] font-medium text-ink disabled:opacity-50">Assign</button>
            </>
          ) : null}
          <button type="button" onClick={() => setSelected([])} className="ml-auto text-[12px] text-muted hover:text-ink">Clear</button>
        </div>
      ) : null}
      {message ? <p role="status" className="text-[13px] text-muted">{message}</p> : null}
      {error ? <ErrorBanner message={error} onRetry={() => void loadRequests()} /> : null}

      {loading ? <div className="rounded-lg border border-dashed border-line p-8 text-center text-[13px] text-muted">Loading requests…</div> : (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="hidden grid-cols-[36px_minmax(220px,1.5fr)_minmax(130px,0.8fr)_140px_112px_120px] items-center gap-3 border-b border-line bg-paper px-4 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted lg:grid">
            <input aria-label="Select all visible requests" type="checkbox" checked={allVisibleSelected} onChange={() => setSelected(allVisibleSelected ? selected.filter((id) => !selectableIds.includes(id)) : [...new Set([...selected, ...selectableIds])])} />
            <span>Request</span><span>Customer</span><span>Status</span><span>Time in status</span><span>Assigned</span>
          </div>
          {filteredRequests.map((request) => {
            const elapsed = now - new Date(request.workflow_status_changed_at).getTime();
            const overdue = !["delivered", "completed"].includes(request.workflow_status) && elapsed > 24 * 3_600_000;
            const assignedName = team.find((member) => member.id === request.assigned_to)?.name ?? "Unassigned";
            return (
              <article key={request.id} className="grid gap-3 border-b border-line px-4 py-4 last:border-b-0 lg:grid-cols-[36px_minmax(220px,1.5fr)_minmax(130px,0.8fr)_140px_112px_120px] lg:items-center">
                <input aria-label={`Select ${request.name}`} type="checkbox" checked={selected.includes(request.id)} onChange={() => setSelected((current) => current.includes(request.id) ? current.filter((id) => id !== request.id) : [...current, request.id])} />
                <Link href={`/admin/requests/${request.id}`} className="flex min-w-0 items-center gap-3">
                  {request.latest_version?.thumbnail_url ? (
                    <img src={request.latest_version.thumbnail_url} alt="" className="h-14 w-20 shrink-0 rounded-[5px] border border-line bg-paper object-cover" />
                  ) : (
                    <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-[5px] border border-dashed border-line bg-paper text-[10px] text-muted">No video</div>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium text-ink-2">{request.name || "Untitled request"}</span>
                    <span className="mt-1 block line-clamp-2 text-[12px] leading-[1.4] text-muted">{request.prompt || request.source_url || "No prompt provided."}</span>
                    <span className="mt-1 block text-[10px] text-muted-2">{request.source_type || "Request"} · {new Date(request.created_at).toLocaleDateString()}</span>
                  </span>
                </Link>
                <div className="min-w-0 text-[12px]">
                  <p className="truncate font-medium text-ink-2">{request.customer.name}</p>
                  <p className="truncate text-muted">{request.customer.email ?? "Email unavailable"}</p>
                </div>
                <span className={`w-fit rounded-full border px-2.5 py-1 text-[11px] ${statusStyle(request.workflow_status)}`}>
                  {request.workflow_status === "revision_requested" ? "Revision requested" : statusLabel(request.workflow_status)}
                </span>
                <span className={`text-[12px] ${overdue ? "font-medium text-red-700" : "text-muted"}`}>
                  {elapsedSince(request.workflow_status_changed_at, now)}{overdue ? " · overdue" : ""}
                </span>
                <span className="truncate text-[12px] text-muted">{assignedName}</span>
              </article>
            );
          })}
          {!filteredRequests.length ? <div className="p-8 text-center text-[13px] text-muted">No requests match these filters.</div> : null}
        </div>
      )}
    </section>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "rose" | "sage" | "peach" | "sky" | "ink" }) {
  const tones = {
    rose: "border-[#e6d5d1] bg-[#fbf4f1]",
    sage: "border-[#d7dfd0] bg-[#f2f6ef]",
    peach: "border-[#ead7c7] bg-[#fbf4ed]",
    sky: "border-[#d5e0e7] bg-[#f1f6f8]",
    ink: "border-line bg-sidebar",
  };
  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-2 text-[28px] font-medium leading-none tabular-nums text-ink-2">{value}</p>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
      <span>{message}</span>
      <button type="button" onClick={onRetry} className="font-medium underline">Retry</button>
    </div>
  );
}
