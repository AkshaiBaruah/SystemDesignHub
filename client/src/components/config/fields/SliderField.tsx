import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { Param } from "@/lib/types";

type Props = { param: Param; value: number; onChange: (v: number) => void };

export function SliderField({ param, value, onChange }: Props) {
  const [min, max] = param.range ?? [0, 100];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-600">
          {param.label}
          {param.required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        <Input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
          className="h-6 w-16 text-xs text-right px-1"
        />
      </div>
      <Slider
        min={min}
        max={max}
        step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
      <div className="flex justify-between text-[9px] text-gray-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      {param.hint && <p className="text-[10px] text-gray-400">{param.hint}</p>}
    </div>
  );
}
