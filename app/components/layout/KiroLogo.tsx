import KiroIcon from '../ui/KiroIcon';

export default function KiroLogo() {
  return (
    <div className="flex items-center gap-3 px-4 py-4 border-b border-dashboard-border">
      <KiroIcon size={32} />
      <div className="flex flex-col leading-tight">
        <span className="text-white font-bold text-base">Kiro</span>
        <span className="text-slate-400 text-xs">Analytics Dashboard</span>
      </div>
    </div>
  );
}
