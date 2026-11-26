"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Activity, ClipboardList, Database, FileCheck, LayoutDashboard, LogOut, Menu, RefreshCw, ShieldCheck, Users, X, ScrollText } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/services/api";
import { Field, Loading, Notice, Pager, formatDate, errorMessage, inputClass, primaryClass, secondaryClass, panelClass, useRemote } from "@/components/data-manager/ManagementShared";
import { NAME_FIELDS, type PageResponse, type ItemResponse, type ProposalRecord } from "@/types/data-manager-management";
const BASE = "/p14/admin";
const roles = ["merchant", "reviewer", "data_manager", "admin"];
const tabs = [
    ["Overview", LayoutDashboard], ["Users", Users], ["Review Queue", ClipboardList], ["Dataset", Database], ["Approvals", FileCheck], ["Security", ShieldCheck], ["Audit Logs", ScrollText],
] as const;
type Tab = typeof tabs[number][0];
type User = {
    userId: string;
    name: string;
    email: string;
    role: string;
    status: string;
    createdAt: string | null;
    updatedAt: string | null;
    lastLoginAt: string | null;
};
type Reviewer = {
    userId: string;
    name: string;
    email: string;
    pending: number;
    escalated: number;
    awaitingConfirmation: number;
};
type Job = {
    jobId: string;
    revision: number;
    addressStatus: string;
    reviewStatus: string;
    reviewerId: string | null;
    assignedAt: string | null;
    createdAt: string | null;
};
type Locality = {
    localityId: string;
    nameEn: string;
    nameBn: string;
    areaEn: string;
    districtEn: string;
    divisionEn: string;
    approved: boolean;
    aliasCount: number;
    landmarkCount: number;
    datasetVersion: string | null;
};
type Audit = {
    eventId: string;
    actorId: string | null;
    action: string;
    result: string;
    targetId: string | null;
    requestId: string | null;
    createdAt: string | null;
};
type Eligibility = {
    eligible: boolean;
    allowedRoles: string[];
    reasonCode: string | null;
};
type Mutation = {
    success: true;
    message?: string;
    auditRecorded?: boolean;
    revokedSessions?: number;
};
type Stats = {
    users: {
        total: number;
        active: number;
        suspended: number;
        otherStatus: number;
        byRole: Record<string, number>;
    };
    addresses: {
        total: number;
        confirmed: number;
        unresolved: number;
        saved: number;
        confirmationRate: number;
        reviews: {
            totalRequested: number;
            awaitingAssignment: number;
            pending: number;
            escalated: number;
            awaitingMerchantConfirmation: number;
            other: number;
        };
    };
    dataset: {
        localities: {
            total: number;
            approved: number;
            notApproved: number;
        };
        proposals: {
            total: number;
            pending: number;
            approved: number;
            rejected: number;
            other: number;
        };
    };
    activity: {
        periodDays: number;
        from: string;
        to: string;
        newUsers: number;
        newAddressRequests: number;
        newProposals: number;
    };
    system: {
        status: string;
        databases: {
            main: string;
            audit: string;
        };
    };
    generatedAt: string;
};
function titleCase(s: string) { return s.replaceAll("_", " "); }
function Heading({ title, description, children }: {
    title: string;
    description: string;
    children?: ReactNode;
}) { return <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Administration workspace</p><h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1><p className="mt-2 text-sm text-slate-500">{description}</p></div>{children}</header>; }
function Refresh({ onClick }: {
    onClick: () => void;
}) { return <button type="button" className={secondaryClass} onClick={onClick}><RefreshCw size={16}/> Refresh</button>; }
function Tag({ value }: {
    value: string;
}) { return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${["active", "approved", "reachable", "operational", "confirmed", "success"].includes(value) ? "bg-emerald-100 text-emerald-800" : ["suspended", "rejected", "unavailable", "denied", "degraded"].includes(value) ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>{titleCase(value)}</span>; }
function Table({ heads, children }: {
    heads: string[];
    children: ReactNode;
}) { return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr>{heads.map(h => <th key={h} scope="col" className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{children}</tbody></table></div>; }
const td = "px-4 py-3 align-top text-slate-700";
function usePage<T>(path: string) { const [cursors, setCursors] = useState<(string | null)[]>([null]); const [revision, setRevision] = useState(0); const cursor = cursors.at(-1); const remote = useRemote<PageResponse<T>>(`${path}${path.includes("?") ? "&" : "?"}limit=10${cursor ? `&cursor=${cursor}` : ""}`, revision); return { ...remote, refresh: () => { setCursors([null]); setRevision(n => n + 1); }, pager: <Pager pagination={remote.data?.pagination} page={cursors.length} disabled={remote.loading} onPrevious={() => setCursors(v => v.length > 1 ? v.slice(0, -1) : v)} onNext={() => { const next = remote.data?.pagination.nextCursor; if (next)
        setCursors(v => [...v, next]); }}/> }; }
function Result({ loading, error, empty, children }: {
    loading: boolean;
    error: string;
    empty: boolean;
    children: ReactNode;
}) { return loading ? <Loading /> : error ? <Notice message={error}/> : empty ? <p className="py-8 text-center text-sm text-slate-500">No matching records.</p> : <>{children}</>; }
function useMutation(onDone: () => void) { const lock = useRef(false); const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false); const [notice, setNotice] = useState(""); const [ok, setOk] = useState(false); async function run(endpoint: string, body: unknown, confirmation: string) { if (lock.current || failed || !window.confirm(confirmation))
    return; lock.current = true; setBusy(true); setNotice(""); try {
    const result = await apiRequest<Mutation>(endpoint, { method: "POST", body });
    setOk(result.auditRecorded !== false);
    setNotice(result.auditRecorded === false ? "Change committed; final audit confirmation unavailable. Contact the operator." : result.message ?? `Operation completed.${result.revokedSessions !== undefined ? ` Sessions revoked: ${result.revokedSessions}.` : ""}`);
    onDone();
}
catch (error) {
    setFailed(true);
    setOk(false);
    setNotice(`${errorMessage(error)} Refresh the records before another attempt.`);
}
finally {
    lock.current = false;
    setBusy(false);
} } return { run, busy, failed, notice: <Notice message={notice} success={ok}/>, reset: () => { if (!lock.current) {
        setFailed(false);
        setNotice("");
    } } }; }
function Overview() { const [version, setVersion] = useState(0); const remote = useRemote<{
    success: true;
    statistics: Stats;
}>(`${BASE}/statistics`, version); const s = remote.data?.statistics; return <><Heading title="System Overview" description="Live operational metrics and system health."><Refresh onClick={() => setVersion(n => n + 1)}/></Heading><Result loading={remote.loading} error={remote.error} empty={!s}>{s && <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Total users", s.users.total], ["Active accounts", s.users.active], ["Address requests", s.addresses.total], ["Confirmed addresses", s.addresses.confirmed], ["Awaiting assignment", s.addresses.reviews.awaitingAssignment], ["Pending reviews", s.addresses.reviews.pending], ["Escalations", s.addresses.reviews.escalated], ["Approved localities", s.dataset.localities.approved]].map(([label, n]) => <article key={label} className={panelClass}><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-3xl font-bold tabular-nums">{Number(n).toLocaleString("en-BD")}</p></article>)}</div><div className="grid gap-4 lg:grid-cols-2"><section className={panelClass}><h2 className="font-bold">User distribution</h2>{Object.entries(s.users.byRole).map(([label, n]) => <div key={label} className="mt-4"><div className="flex justify-between text-sm capitalize"><span>{titleCase(label)}</span><strong>{n}</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${s.users.total ? n / s.users.total * 100 : 0}%` }}/></div></div>)}</section><section className={panelClass}><h2 className="font-bold">Last 7 days · new records</h2>{[["Users", s.activity.newUsers], ["Addresses", s.activity.newAddressRequests], ["Proposals", s.activity.newProposals]].map(([label, n]) => <div className="mt-5" key={label}><div className="flex justify-between text-sm"><span>{label}</span><strong>{n}</strong></div><div className="mt-2 h-3 rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600" style={{ width: `${Number(n) / Math.max(1, s.activity.newUsers, s.activity.newAddressRequests, s.activity.newProposals) * 100}%` }}/></div></div>)}<p className="mt-4 text-xs text-slate-500">{formatDate(s.activity.from)} — {formatDate(s.activity.to)}</p></section><section className={panelClass}><h2 className="font-bold">Resolution & dataset</h2><dl className="mt-4 grid grid-cols-2 gap-4 text-sm">{[["Confirmation rate", `${s.addresses.confirmationRate}%`], ["Unresolved", s.addresses.unresolved], ["Saved addresses", s.addresses.saved], ["Suspended users", s.users.suspended], ["Awaiting merchant confirmation", s.addresses.reviews.awaitingMerchantConfirmation], ["Pending proposals", s.dataset.proposals.pending], ["Approved proposals", s.dataset.proposals.approved], ["Rejected proposals", s.dataset.proposals.rejected]].map(([l, n]) => <div key={l}><dt className="text-slate-500">{l}</dt><dd className="mt-1 font-bold">{n}</dd></div>)}</dl></section><section className={panelClass}><h2 className="flex items-center gap-2 font-bold"><Activity size={18}/> System health</h2><div className="my-4"><Tag value={s.system.status}/></div>{Object.entries(s.system.databases).map(([k, v]) => <div key={k} className="flex items-center justify-between border-t border-slate-100 py-3 capitalize">{k} database <Tag value={v}/></div>)}<p className="text-xs text-slate-500">Connectivity only. Updated {formatDate(s.generatedAt)}.</p></section></div></>}</Result></>; }
function UserDetails({ userId, security, onChanged, onClose }: {
    userId: string;
    security: boolean;
    onChanged: () => void;
    onClose: () => void;
}) { const [version, setVersion] = useState(0); const [role, setRole] = useState(""); const detail = useRemote<ItemResponse<User>>(`${BASE}/users/${userId}`, version); const eligible = useRemote<{
    success: true;
    eligibility: Eligibility;
}>(security ? null : `${BASE}/users/${userId}/role-eligibility`, version); const refresh = () => { setVersion(n => n + 1); onChanged(); }; const mutation = useMutation(refresh); const item = detail.data?.item; return <section className={panelClass} aria-label="Selected user"><div className="flex items-center justify-between gap-3"><h2 className="font-bold">User details</h2><div className="flex gap-2"><Refresh onClick={() => { mutation.reset(); refresh(); }}/><button className={secondaryClass} onClick={onClose} disabled={mutation.busy}>Close</button></div></div>{mutation.notice}<Result loading={detail.loading} error={detail.error} empty={!item}>{item && <div className="mt-4 space-y-4"><div><p className="text-lg font-bold">{item.name}</p><p className="break-all text-sm text-slate-500">{item.email}</p><p className="mt-2 break-all text-xs text-slate-500">{item.userId}</p></div><div className="flex flex-wrap gap-2"><Tag value={item.role}/><Tag value={item.status}/></div><p className="text-sm">Created: {formatDate(item.createdAt)} · Last login: {formatDate(item.lastLoginAt)}</p>{security ? <div className="flex flex-wrap gap-2">{item.role !== "admin" && ["active", "suspended"].includes(item.status) ? <><button className={primaryClass} disabled={mutation.busy || mutation.failed} onClick={() => mutation.run(`${BASE}/users/${userId}/status`, { status: item.status === "active" ? "suspended" : "active", expectedStatus: item.status }, `${item.status === "active" ? "Suspend" : "Reactivate"} this account and revoke its sessions?`)}>{item.status === "active" ? "Suspend account" : "Reactivate account"}</button><button className={secondaryClass} disabled={mutation.busy || mutation.failed} onClick={() => mutation.run(`${BASE}/users/${userId}/revoke-sessions`, {}, "Revoke all sessions for this account?")}>Revoke all sessions</button></> : <p className="text-sm text-slate-500">Protected or unsupported account.</p>}</div> : <Result loading={eligible.loading} error={eligible.error} empty={!eligible.data}>{eligible.data?.eligibility.eligible ? <div className="flex flex-wrap items-end gap-3"><Field label="New role"><select className={inputClass} value={role} disabled={mutation.busy} onChange={e => setRole(e.target.value)}><option value="" disabled>Select a role</option><option value="reviewer">Reviewer</option><option value="data_manager">Data Manager</option></select></Field><button className={primaryClass} disabled={mutation.busy || mutation.failed || item.userId !== userId || !["reviewer", "data_manager"].includes(role)} onClick={() => { if (item.userId !== userId || !["reviewer", "data_manager"].includes(role)) return; void mutation.run(`${BASE}/users/${userId}/role`, { role }, `Assign ${role === "reviewer" ? "Reviewer" : "Data Manager"} role to ${item.name} (${item.email})? Existing sessions will be revoked.`); }}>Assign role</button></div> : <p className="text-sm text-slate-600">Not eligible: {titleCase(eligible.data?.eligibility.reasonCode ?? "")}</p>}</Result>}</div>}</Result></section>; }
function UserList({ query, security }: {
    query: string;
    security: boolean;
}) { const page = usePage<User>(`${BASE}/users?${query}`); const [selected, setSelected] = useState<string | null>(null); return <>{selected && <UserDetails key={selected} userId={selected} security={security} onChanged={page.refresh} onClose={() => setSelected(null)}/>}<section className={panelClass}><div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Account directory</h2><Refresh onClick={page.refresh}/></div><Result loading={page.loading} error={page.error} empty={!page.data?.items.length}><Table heads={["User", "Role", "Status", "Last login", "Action"]}>{page.data?.items.map(u => <tr key={u.userId}><td className={td}><strong>{u.name}</strong><p className="break-all text-xs text-slate-500">{u.email}</p></td><td className={td}><Tag value={u.role}/></td><td className={td}><Tag value={u.status}/></td><td className={td}>{formatDate(u.lastLoginAt)}</td><td className={td}><button className={secondaryClass} onClick={() => setSelected(u.userId)}>Manage</button></td></tr>)}</Table></Result>{page.pager}</section></>; }
function UsersPanel({ security = false }: {
    security?: boolean;
}) { const [q, setQ] = useState(""); const [role, setRole] = useState("all"); const [status, setStatus] = useState("all"); const [query, setQuery] = useState("role=all&status=all"); return <><Heading title={security ? "Account Security" : "User Management"} description={security ? "Suspend or reactivate non-administrator accounts and revoke sessions." : "Search user accounts and assign dedicated operational roles."}/><form className={`${panelClass} grid gap-3 sm:grid-cols-4`} onSubmit={e => { e.preventDefault(); setQuery(new URLSearchParams({ q: q.trim(), role, status }).toString()); }}><Field label="Search users"><input className={inputClass} value={q} maxLength={80} onChange={e => setQ(e.target.value)} placeholder="Name or email"/></Field><Field label="Role"><select className={inputClass} value={role} onChange={e => setRole(e.target.value)}>{["all", ...roles].map(r => <option key={r} value={r}>{titleCase(r)}</option>)}</select></Field><Field label="Account status"><select className={inputClass} value={status} onChange={e => setStatus(e.target.value)}>{["all", "active", "suspended"].map(s => <option key={s} value={s}>{s}</option>)}</select></Field><button className={`${primaryClass} self-end`} type="submit">Search</button></form><UserList key={query} query={query} security={security}/></>; }
function AssignPanel({ job, onDone, onClose }: {
    job: Job;
    onDone: () => void;
    onClose: () => void;
}) { const page = usePage<Reviewer>(`${BASE}/reviewers`); const [reviewer, setReviewer] = useState(""); const [completed, setCompleted] = useState(false); const mutation = useMutation(() => { setCompleted(true); onDone(); page.refresh(); setReviewer(""); }); return <section className={panelClass} aria-label="Assign reviewer"><div className="flex justify-between gap-2"><div><h2 className="font-bold">Assign reviewer</h2><p className="break-all text-xs text-slate-500">{job.jobId}</p></div><button className={secondaryClass} disabled={mutation.busy} onClick={onClose}>Close</button></div>{mutation.notice}<div className="mt-4"><Refresh onClick={() => { onDone(); onClose(); }}/></div><Result loading={page.loading} error={page.error} empty={!page.data?.items.length}><Table heads={["Reviewer", "Pending", "Escalated", "Awaiting confirmation", "Select"]}>{page.data?.items.map(r => <tr key={r.userId}><td className={td}><strong>{r.name}</strong><p className="text-xs break-all">{r.email}</p></td><td className={td}>{r.pending}</td><td className={td}>{r.escalated}</td><td className={td}>{r.awaitingConfirmation}</td><td className={td}><button className={secondaryClass} aria-pressed={reviewer === r.userId} onClick={() => setReviewer(r.userId)}>{reviewer === r.userId ? "Selected" : "Select"}</button></td></tr>)}</Table></Result>{page.pager}<button className={`${primaryClass} mt-4`} disabled={completed || !reviewer || mutation.busy || mutation.failed} onClick={() => mutation.run(`${BASE}/review-queue/${job.jobId}/assign`, { reviewerId: reviewer, revision: job.revision }, "Assign this review request to the selected reviewer?")}>Confirm assignment</button></section>; }
function QueueList({ query }: {
    query: string;
}) { const page = usePage<Job>(`${BASE}/review-queue?${query}`); const [job, setJob] = useState<Job | null>(null); return <>{job && <AssignPanel key={job.jobId} job={job} onDone={page.refresh} onClose={() => setJob(null)}/>}<section className={panelClass}><div className="mb-4 flex justify-between"><h2 className="font-bold">Manual review requests</h2><Refresh onClick={page.refresh}/></div><Result loading={page.loading} error={page.error} empty={!page.data?.items.length}><Table heads={["Request ID", "Status", "Created", "Reviewer", "Action"]}>{page.data?.items.map(r => <tr key={r.jobId}><td className={`${td} font-mono text-xs break-all`}>{r.jobId}<p>Revision {r.revision}</p></td><td className={td}><Tag value={r.reviewStatus}/></td><td className={td}>{formatDate(r.createdAt)}</td><td className={`${td} break-all text-xs`}>{r.reviewerId ?? "Not assigned"}</td><td className={td}>{r.reviewStatus === "unassigned" ? <button className={secondaryClass} onClick={() => setJob(r)}>Assign</button> : "—"}</td></tr>)}</Table></Result>{page.pager}</section></>; }
function ReviewQueue() { const [status, setStatus] = useState("unassigned"); const [jobId, setJobId] = useState(""); const [query, setQuery] = useState("status=unassigned"); return <><Heading title="Review Queue" description="Assign unassigned requests to active reviewers. Only request metadata is displayed."/><form className={`${panelClass} grid gap-3 sm:grid-cols-3`} onSubmit={e => { e.preventDefault(); setQuery(new URLSearchParams({ status, ...(jobId.trim() ? { jobId: jobId.trim() } : {}) }).toString()); }}><Field label="Review status"><select className={inputClass} value={status} onChange={e => setStatus(e.target.value)}>{["unassigned", "pending", "escalated", "resolved"].map(v => <option key={v} value={v}>{v}</option>)}</select></Field><Field label="Request ID"><input className={inputClass} value={jobId} maxLength={24} pattern="[a-fA-F0-9]{24}" onChange={e => setJobId(e.target.value)}/></Field><button className={`${primaryClass} self-end`}>Search</button></form><QueueList key={query} query={query}/></>; }
function LocalityList({ q }: {
    q: string;
}) { const page = usePage<Locality>(`${BASE}/localities?q=${encodeURIComponent(q)}`); return <section className={panelClass}><div className="mb-4 flex justify-between"><h2 className="font-bold">Locality reference records</h2><Refresh onClick={page.refresh}/></div><Result loading={page.loading} error={page.error} empty={!page.data?.items.length}><Table heads={["Locality", "Area / district", "Approval", "Terms", "Version"]}>{page.data?.items.map(l => <tr key={l.localityId}><td className={td}><strong>{l.nameEn}</strong><p lang="bn">{l.nameBn}</p><p className="text-xs break-all">{l.localityId}</p></td><td className={td}>{l.areaEn}, {l.districtEn}, {l.divisionEn}</td><td className={td}><Tag value={l.approved ? "approved" : "not approved"}/></td><td className={td}>{l.aliasCount} aliases · {l.landmarkCount} landmarks</td><td className={td}>{l.datasetVersion ?? "—"}</td></tr>)}</Table></Result>{page.pager}</section>; }
function Dataset() { const [q, setQ] = useState(""); const [search, setSearch] = useState(""); return <><Heading title="Dataset" description="Read-only locality directory. All changes are published through approved proposals."/><form className={`${panelClass} flex flex-wrap items-end gap-3`} onSubmit={e => { e.preventDefault(); setSearch(q.trim()); }}><Field label="Search localities"><input className={inputClass} value={q} maxLength={80} onChange={e => setQ(e.target.value)}/></Field><button className={primaryClass}>Search</button></form><LocalityList key={search} q={search}/></>; }
function ProposalDetail({ kind, id, onClose, onDone }: {
    kind: string;
    id: string;
    onClose: () => void;
    onDone: () => void;
}) { const [version, setVersion] = useState(0); const [reason, setReason] = useState(""); const remote = useRemote<ItemResponse<ProposalRecord>>(`${BASE}/dataset-proposals/${kind}/${id}`, version); const refresh = () => { setVersion(n => n + 1); setReason(""); onDone(); }; const mutation = useMutation(refresh); const p = remote.data?.item; return <section className={panelClass} aria-label="Proposal details"><div className="flex justify-between gap-2"><h2 className="font-bold">Proposal details</h2><div className="flex gap-2"><Refresh onClick={() => { mutation.reset(); refresh(); }}/><button className={secondaryClass} disabled={mutation.busy} onClick={onClose}>Close</button></div></div>{mutation.notice}<Result loading={remote.loading} error={remote.error} empty={!p}>{p && <div className="mt-4 space-y-4"><div className="flex flex-wrap gap-3"><strong>{p.localityId}</strong><Tag value={p.status}/><Tag value={p.operation}/></div>{kind === "locality" ? <Table heads={["Field", "Previous", "Proposed"]}>{NAME_FIELDS.map(([key, label]) => <tr key={key}><td className={td}>{label}</td><td className={td}>{p.baseLocality?.[key] ?? "—"}</td><td className={td}>{p.locality?.[key] ?? "—"}</td></tr>)}</Table> : <div className="rounded-xl bg-slate-50 p-4 text-sm"><p>Field: {p.field}</p><p>Proposed {p.operation}: {p.term}</p><p>Existing terms: {p.baseTerms?.join(", ") || "None"}</p></div>}<div className="grid gap-3 sm:grid-cols-2"><div><h3 className="font-semibold">Reason</h3><p className="whitespace-pre-wrap break-words text-sm">{p.reason}</p></div><div><h3 className="font-semibold">Evidence</h3><p className="whitespace-pre-wrap break-words text-sm">{p.evidence}</p></div></div>{p.decision && <div className="rounded-xl bg-slate-50 p-4"><h3 className="font-bold">Decision history</h3><p>{p.decision.action} · {formatDate(p.decision.decidedAt)}</p><p className="whitespace-pre-wrap break-words">{p.decision.reason}</p><p>{p.decision.published ? "Dataset changes published." : "Dataset unchanged."}</p></div>}{p.status === "pending" && <><Field label="Decision reason"><textarea className={inputClass} minLength={10} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)}/></Field><div className="flex flex-wrap gap-2">{["approve", "reject"].map(action => <button key={action} className={action === "approve" ? primaryClass : secondaryClass} disabled={reason.trim().length < 10 || /[\p{Cc}]/u.test(reason.trim()) || mutation.busy || mutation.failed} onClick={() => mutation.run(`${BASE}/dataset-proposals/${kind}/${id}/decision`, { action, reason: reason.trim() }, `${titleCase(action)} this proposal?`)}>{action === "approve" ? "Approve proposal" : "Reject proposal"}</button>)}</div></>}</div>}</Result></section>; }
function ProposalList({ kind, status }: {
    kind: string;
    status: string;
}) { const page = usePage<ProposalRecord>(`${BASE}/dataset-proposals/${kind}?status=${status}`); const [selected, setSelected] = useState<string | null>(null); return <>{selected && <ProposalDetail key={selected} id={selected} kind={kind} onClose={() => setSelected(null)} onDone={page.refresh}/>}<section className={panelClass}><div className="mb-4 flex justify-between"><h2 className="font-bold">Dataset proposals</h2><Refresh onClick={page.refresh}/></div><Result loading={page.loading} error={page.error} empty={!page.data?.items.length}><Table heads={["Proposal ID", "Locality", "Operation", "Status", "Action"]}>{page.data?.items.map(p => <tr key={p.proposalId}><td className={`${td} break-all text-xs font-mono`}>{p.proposalId}</td><td className={td}>{p.localityId}</td><td className={td}>{p.operation}</td><td className={td}><Tag value={p.status}/></td><td className={td}><button className={secondaryClass} onClick={() => setSelected(p.proposalId)}>View proposal</button></td></tr>)}</Table></Result>{page.pager}</section></>; }
function Approvals() { const [kind, setKind] = useState("locality"); const [status, setStatus] = useState("pending"); return <><Heading title="Dataset Approvals" description="Review previous and proposed data before approving or rejecting changes."/><div className={`${panelClass} grid gap-3 sm:grid-cols-2`}><Field label="Proposal type"><select className={inputClass} value={kind} onChange={e => setKind(e.target.value)}><option value="locality">Locality</option><option value="term">Landmark & alias</option></select></Field><Field label="Proposal status"><select className={inputClass} value={status} onChange={e => setStatus(e.target.value)}>{["pending", "approved", "rejected", "all"].map(s => <option key={s} value={s}>{s}</option>)}</select></Field></div><ProposalList key={`${kind}:${status}`} kind={kind} status={status}/></>; }
function AuditList({ query }: {
    query: string;
}) { const page = usePage<Audit>(`${BASE}/audit-events?${query}`); return <section className={panelClass}><div className="mb-4 flex justify-between"><h2 className="font-bold">Administrative & security events</h2><Refresh onClick={page.refresh}/></div><Result loading={page.loading} error={page.error} empty={!page.data?.items.length}><Table heads={["Action / result", "Actor ID", "Target ID", "Request ID", "Timestamp"]}>{page.data?.items.map(e => <tr key={e.eventId}><td className={td}><p className="break-all font-semibold text-xs">{e.action}</p><Tag value={e.result}/></td><td className={`${td} break-all text-xs`}>{e.actorId ?? "System"}</td><td className={`${td} break-all text-xs`}>{e.targetId ?? "—"}</td><td className={`${td} break-all text-xs`}>{e.requestId ?? "—"}</td><td className={td}>{formatDate(e.createdAt)}</td></tr>)}</Table></Result>{page.pager}</section>; }
function AuditLogs() { const [action, setAction] = useState(""); const [result, setResult] = useState(""); const [actor, setActor] = useState(""); const [query, setQuery] = useState(""); return <><Heading title="Audit Logs" description="Read-only audit evidence from the separate Audit Database."/><form className={`${panelClass} grid gap-3 sm:grid-cols-4`} onSubmit={e => { e.preventDefault(); setQuery(new URLSearchParams({ ...action ? { action } : {}, ...result ? { result } : {}, ...actor ? { actorId: actor } : {} }).toString()); }}><Field label="Action"><input className={inputClass} value={action} maxLength={80} pattern="[A-Z][A-Z0-9_]*" onChange={e => setAction(e.target.value.toUpperCase())} placeholder="ADMIN_REVIEW_ASSIGN"/></Field><Field label="Result"><select className={inputClass} value={result} onChange={e => setResult(e.target.value)}>{["", "success", "started", "denied", "failed", "failure", "conflict", "unconfirmed"].map(s => <option key={s} value={s}>{s || "All results"}</option>)}</select></Field><Field label="Actor ID"><input className={inputClass} value={actor} maxLength={24} pattern="[a-fA-F0-9]{24}" onChange={e => setActor(e.target.value)}/></Field><button className={`${primaryClass} self-end`}>Search</button></form><AuditList key={query} query={query}/></>; }
function Workspace({ name }: {
    name: string;
}) { const { logout } = useAuth(); const router = useRouter(); const [tab, setTab] = useState<Tab>("Overview"); const [open, setOpen] = useState(false); const [signing, setSigning] = useState(false); const [error, setError] = useState(""); const panels: Record<Tab, ReactNode> = { Overview: <Overview />, Users: <UsersPanel />, "Review Queue": <ReviewQueue />, Dataset: <Dataset />, Approvals: <Approvals />, Security: <UsersPanel security/>, "Audit Logs": <AuditLogs /> }; async function signOut() { if (signing)
    return; setSigning(true); setError(""); try {
    await logout();
    router.replace("/login/");
}
catch (e) {
    setError(errorMessage(e));
}
finally {
    setSigning(false);
} } return <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[260px_minmax(0,1fr)]"><aside className="bg-[#102c2a] text-white lg:sticky lg:top-0 lg:h-screen"><div className="flex items-center justify-between gap-3 px-5 py-5"><div className="flex items-center gap-3"><ShieldCheck className="text-emerald-400" size={30}/><div><p className="text-xl font-bold">ThikanaHub</p><p className="text-xs text-emerald-100/70">Administration portal</p></div></div><button type="button" className="lg:hidden" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button></div><nav aria-label="Admin navigation" className={`${open ? "block" : "hidden"} space-y-1 px-3 pb-4 lg:block`}>{tabs.map(([label, Icon]) => <button key={label} type="button" aria-current={tab === label ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold ${tab === label ? "bg-emerald-700 text-white" : "text-slate-200 hover:bg-white/10"}`} onClick={() => { setTab(label); setOpen(false); }}><Icon size={18}/>{label}</button>)}</nav><div className="border-t border-white/10 px-5 py-4"><p className="truncate font-semibold">{name}</p><p className="text-xs text-emerald-100/70">System Administrator</p><button disabled={signing} className="mt-4 flex items-center gap-2 text-sm" onClick={signOut}><LogOut size={18}/> Sign out</button></div></aside><main className="min-w-0 space-y-5 p-4 sm:p-7 lg:p-9"><Notice message={error}/><div key={tab} className="space-y-5">{panels[tab]}</div></main></div>; }
export default function AdminPortal() { const { status, user, refreshUser } = useAuth(); const router = useRouter(); useEffect(() => { if (status === "anonymous")
    router.replace("/login/");
else if (status === "authenticated" && user?.role !== "admin")
    router.replace("/dashboard/"); }, [status, user?.role, router]); const access = useRemote<{
    success: true;
}>(status === "authenticated" && user?.role === "admin" ? `${BASE}/access` : null); if (status === "error" || access.error)
    return <main className="mx-auto max-w-lg space-y-4 p-8"><Notice message={access.error || "Unable to verify your session."}/><button className={primaryClass} onClick={() => { void refreshUser(); }}>Verify session</button><button className={secondaryClass} onClick={() => router.replace("/dashboard/")}>Dashboard</button></main>; if (status !== "authenticated" || user?.role !== "admin" || !access.data)
    return <Loading />; return <Workspace key={user.id} name={user.name}/>; }
