import KiroIcon from '../ui/KiroIcon';

export default function KiroLogo() {
  return (
    <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-800/50">
      <KiroIcon size={36} />
      <div className="flex flex-col leading-tight">
        <span className="text-white font-bold text-base">Kiro</span>
        <span className="text-purple-400 text-[10px] font-medium">Analytics Dashboard</span>
      </div>
    </div>
  );
}
