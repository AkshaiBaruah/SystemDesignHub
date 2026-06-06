import * as LucideIcons from "lucide-react";
import { useDesignStore } from "@/store/designStore";
import { CATEGORY_COLORS } from "@/lib/categoryColors";
import { SliderField } from "./fields/SliderField";
import { SelectField } from "./fields/SelectField";
import { ToggleField } from "./fields/ToggleField";
import { TagInputField } from "./fields/TagInputField";
import { TextareaField } from "./fields/TextareaField";
import { TextField } from "./fields/TextField";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Param } from "@/lib/types";
import type { Node } from "@xyflow/react";
import type { DesignNodeData } from "@/lib/types";

type Props = { node: Node<DesignNodeData> };

export function NodeConfig({ node }: Props) {
  const { componentDefs, updateNodeParam } = useDesignStore();
  const def = componentDefs.find((d) => d.id === node.data.defId);
  if (!def) return null;

  const color = CATEGORY_COLORS[def.category] ?? "slate";
  const Icon = (LucideIcons[def.icon as keyof typeof LucideIcons] ??
    LucideIcons.Box) as React.FC<{ size?: number; className?: string }>;

  const paramValue = (key: string) => node.data.params[key] ?? def.params.find((p) => p.key === key)?.default;

  // Check if a param should be shown based on showWhen condition
  const shouldShow = (param: Param): boolean => {
    if (!param.showWhen) return true;
    return paramValue(param.showWhen.key) === param.showWhen.value;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`flex items-center gap-2 p-3 border-b border-gray-100 bg-${color}-50`}>
        <div className={`w-7 h-7 rounded-md flex items-center justify-center bg-${color}-100`}>
          <Icon size={14} className={`text-${color}-600`} />
        </div>
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wide text-${color}-600`}>{def.category}</p>
          <p className="text-sm font-semibold text-gray-800">{def.label}</p>
        </div>
      </div>

      {/* Description */}
      <p className="px-3 py-2 text-[11px] text-gray-500 border-b border-gray-100">{def.description}</p>

      {/* Params */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {def.params.map((param) => {
            if (!shouldShow(param)) return null;
            const val = paramValue(param.key);
            const onChange = (v: unknown) => updateNodeParam(node.id, param.key, v);

            if (param.type === "int") {
              return <SliderField key={param.key} param={param} value={Number(val ?? 0)} onChange={onChange as (v: number) => void} />;
            }
            if (param.type === "enum") {
              return <SelectField key={param.key} param={param} value={String(val ?? "")} onChange={onChange as (v: string) => void} />;
            }
            if (param.type === "bool") {
              return <ToggleField key={param.key} param={param} value={Boolean(val)} onChange={onChange as (v: boolean) => void} />;
            }
            if (param.type === "text[]") {
              return <TagInputField key={param.key} param={param} value={Array.isArray(val) ? (val as string[]) : []} onChange={onChange as (v: string[]) => void} />;
            }
            if (param.type === "textarea") {
              return <TextareaField key={param.key} param={param} value={String(val ?? "")} onChange={onChange as (v: string) => void} />;
            }
            return <TextField key={param.key} param={param} value={String(val ?? "")} onChange={onChange as (v: string) => void} />;
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
