import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ComponentDef } from "@/lib/types";
import { ComponentCard } from "./ComponentCard";
import { CATEGORY_COLORS } from "@/lib/categoryColors";

type Props = { category: string; defs: ComponentDef[] };

export function CategorySection({ category, defs }: Props) {
  const [open, setOpen] = useState(true);
  const color = CATEGORY_COLORS[category] ?? "slate";

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-left hover:bg-gray-50 transition-colors"
      >
        {open ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
        <span className={`text-[10px] font-bold uppercase tracking-wider text-${color}-600`}>{category}</span>
        <span className="ml-auto text-[10px] text-gray-400">{defs.length}</span>
      </button>
      {open && (
        <div className="px-1 pb-1 space-y-0.5">
          {defs.map((def) => (
            <ComponentCard key={def.id} def={def} />
          ))}
        </div>
      )}
    </div>
  );
}
