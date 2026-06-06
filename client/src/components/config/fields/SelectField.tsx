import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Param } from "@/lib/types";

type Props = { param: Param; value: string; onChange: (v: string) => void };

export function SelectField({ param, value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-600">
        {param.label}
        {param.required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(param.options ?? []).map((opt) => (
            <SelectItem key={opt} value={opt} className="text-xs">
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {param.hint && <p className="text-[10px] text-gray-400">{param.hint}</p>}
    </div>
  );
}
