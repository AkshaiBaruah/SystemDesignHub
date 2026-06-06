import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { Param } from "@/lib/types";

type Props = { param: Param; value: string; onChange: (v: string) => void };

export function TextField({ param, value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-600">
        {param.label}
        {param.required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={param.hint ?? ""}
        className="h-8 text-xs"
      />
      {param.required && !value && (
        <p className="text-[10px] text-red-500">Required</p>
      )}
      {param.hint && value && <p className="text-[10px] text-gray-400">{param.hint}</p>}
    </div>
  );
}
