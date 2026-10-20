export default function StatusBadge({ status, hasNumber }: { status: 'draft' | 'finalized'; hasNumber: boolean }) {
  const [label, cls] =
    status === 'finalized'
      ? ['Finalized', 'bg-emerald-50 text-emerald-800 ring-emerald-200']
      : hasNumber
        ? ['Being edited', 'bg-amber-50 text-amber-800 ring-amber-200']
        : ['Draft', 'bg-slate-100 text-slate-700 ring-slate-200']
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{label}</span>
}