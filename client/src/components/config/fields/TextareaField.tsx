import { useRef } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Param } from "@/lib/types";

type Props = { param: Param; value: string; onChange: (v: string) => void };

export function TextareaField({ param, value, onChange }: Props) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localVal, setLocalVal] = [value, onChange];

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-600">
        {param.label}
        {param.required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Textarea
        value={localVal}
        onChange={(e) => {
          const v = e.target.value;
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => onChange(v), 300);
          // Update display immediately via internal tracking (controlled but debounced to store)
          e.target.setAttribute("data-val", v);
          onChange(v);
        }}
        className="font-mono text-xs min-h-[100px] resize-y"
        placeholder={param.hint ?? ""}
      />
      {param.required && !value && (
        <p className="text-[10px] text-red-500">Required</p>
      )}
      {param.hint && value && <p className="text-[10px] text-gray-400">{param.hint}</p>}
    </div>
  );
}
