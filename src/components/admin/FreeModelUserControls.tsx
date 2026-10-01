"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

const userSettingsSchema = z.object({
  users: z.array(z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    plan: z.enum(["free", "pro", "business"]),
    createdAt: z.string().nullable(),
    dailyCap: z.number().int().nullable(),
    modelId: z.string().nullable(),
  }).strict()),
  models: z.array(z.object({ id: z.string(), label: z.string() }).strict()),
}).strict();

type UserSettings = z.infer<typeof userSettingsSchema>["users"][number];
type ModelOption = z.infer<typeof userSettingsSchema>["models"][number];

export function FreeModelUserControls() {
  const [users, setUsers] = useState<UserSettings[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingUser, setSavingUser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/free-model-users", { cache: "no-store" });
      const result = await response.json() as unknown;
      if (!response.ok) {
        const message = result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Unable to load AI user settings.";
        throw new Error(message);
      }
      const parsed = userSettingsSchema.safeParse(result);
      if (!parsed.success) throw new Error("AI user settings returned invalid data.");
      setUsers(parsed.data.users);
      setModels(parsed.data.models);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load AI user settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function saveUser(user: UserSettings) {
    setSavingUser(user.id);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/free-model-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, dailyCap: user.dailyCap, modelId: user.modelId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to save AI user settings.");
      setStatus(`Saved settings for ${user.email || user.name || "user"}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save AI user settings.");
    } finally {
      setSavingUser(null);
    }
  }

  const normalizedSearch = search.trim().toLowerCase();
  const filteredUsers = users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(normalizedSearch));

  return (
    <section className="mt-5 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-medium text-ink-2">Per-user AI access</h2>
          <p className="mt-1 text-[13px] text-muted">Blank values inherit the plan cap and global primary model.</p>
        </div>
        <label className="text-[12px] font-medium text-ink-2">
          Search users
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or email" className="mt-1 block h-9 w-[min(320px,80vw)] rounded-lg border border-line bg-surface px-3 text-[13px] outline-none" />
        </label>
      </header>

      {error ? <p role="alert" className="text-[13px] text-red-700">{error}</p> : null}
      {status ? <p role="status" className="text-[13px] text-olive">{status}</p> : null}

      {loading ? (
        <p role="status" className="py-8 text-center text-[13px] text-muted">Loading users…</p>
      ) : filteredUsers.length ? (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[850px] border-collapse text-left text-[13px]">
            <thead className="border-b border-line bg-paper text-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium">User</th>
                <th className="px-3 py-2.5 font-medium">Plan</th>
                <th className="px-3 py-2.5 font-medium">Daily cap</th>
                <th className="px-3 py-2.5 font-medium">Preferred free model</th>
                <th className="px-3 py-2.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td className="px-3 py-3">
                    <p className="font-medium text-ink-2">{user.name || user.email || "Unnamed user"}</p>
                    {user.name && user.email ? <p className="mt-0.5 text-[11px] text-muted">{user.email}</p> : null}
                  </td>
                  <td className="px-3 py-3 capitalize text-muted">{user.plan}</td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      step={1}
                      aria-label={`Daily free-model cap for ${user.email || user.name}`}
                      value={user.dailyCap ?? ""}
                      placeholder="Plan default"
                      onChange={(event) => {
                        const value = event.target.value;
                        const dailyCap = value === "" ? null : Number(value);
                        setUsers((current) => current.map((item) => item.id === user.id ? { ...item, dailyCap } : item));
                      }}
                      className="h-9 w-32 rounded-md border border-line bg-surface px-2 text-[13px] outline-none"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <select
                      aria-label={`Preferred free model for ${user.email || user.name}`}
                      value={user.modelId ?? ""}
                      onChange={(event) => setUsers((current) => current.map((item) => item.id === user.id ? { ...item, modelId: event.target.value || null } : item))}
                      className="h-9 max-w-[280px] rounded-md border border-line bg-surface px-2 text-[12px]"
                    >
                      <option value="">Global primary</option>
                      {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <button type="button" disabled={savingUser === user.id} onClick={() => void saveUser(user)} className="h-9 rounded-md bg-ink px-3 text-[12px] font-medium text-surface disabled:opacity-50">
                      {savingUser === user.id ? "Saving…" : "Save"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-8 text-center text-[13px] text-muted">{users.length ? "No users match this search." : "No users found."}</p>
      )}
    </section>
  );
}