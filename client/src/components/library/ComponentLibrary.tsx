import { useState } from "react";
import { Search } from "lucide-react";
import { useDesignStore } from "@/store/designStore";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ComponentSkeleton } from "./ComponentSkeleton";
import { CategorySection } from "./CategorySection";

export function ComponentLibrary() {
  const { componentDefs, componentDefsLoading } = useDesignStore();
  const [query, setQuery] = useState("");

  const filtered = query
    ? componentDefs.filter(
        (d) =>
          d.label.toLowerCase().includes(query.toLowerCase()) ||
          d.description.toLowerCase().includes(query.toLowerCase())
      )
    : componentDefs;

  // Group by category
  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, def) => {
    acc[def.category] = acc[def.category] ?? [];
    acc[def.category].push(def);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      <div className="p-3 border-b border-gray-100">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Components</h2>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="pl-7 h-7 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        {componentDefsLoading ? (
          <div className="pt-3">
            <ComponentSkeleton />
          </div>
        ) : (
          <div className="py-1">
            {Object.entries(grouped).map(([category, defs]) => (
              <CategorySection key={category} category={category} defs={defs} />
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-8">No components found</p>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
