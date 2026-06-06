import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Param } from "@/lib/types";

type Props = { param: Param; value: boolean; onChange: (v: boolean) => void };

export function ToggleField({ param, value, onChange }: Props) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs text-gray-600 cursor-pointer" htmlFor={param.key}>
        {param.label}
        {param.required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Switch id={param.key} checked={value} onCheckedChange={onChange} />
    </div>
  );
}
