import * as LucideIcons from "lucide-react";
import type { ComponentDef } from "@/lib/types";
import { CATEGORY_COLORS } from "@/lib/categoryColors";

type Props = { def: ComponentDef };

export function ComponentCard({ def }: Props) {
  const Icon = (LucideIcons[def.icon as keyof typeof LucideIcons] ??
    LucideIcons.Box) as React.FC<{ size?: number; className?: string }>;

  const color = CATEGORY_COLORS[def.category] ?? "slate";

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("componentId", def.id);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="flex items-start gap-2 p-2 rounded-lg border border-transparent hover:border-gray-200 hover:bg-gray-50 cursor-grab active:cursor-grabbing transition-colors group"
    >
      <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-${color}-100`}>
        <Icon size={16} className={`text-${color}-600`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-800 truncate">{def.label}</p>
        <p className="text-[10px] text-gray-400 leading-tight mt-0.5 line-clamp-2">{def.description}</p>
      </div>
    </div>
  );
}
