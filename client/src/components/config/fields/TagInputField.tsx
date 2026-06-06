import { useState, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { Param } from "@/lib/types";

type Props = { param: Param; value: string[]; onChange: (v: string[]) => void };

export function TagInputField({ param, value, onChange }: Props) {
  const [inputVal, setInputVal] = useState("");

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInputVal("");
  };

  const removeTag = (tag: string) => onChange(value.filter((t) => t !== tag));

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputVal);
    }
    if (e.key === "Backspace" && inputVal === "" && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-600">
        {param.label}
        {param.required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <div className="min-h-[32px] border border-input rounded-md px-2 py-1 flex flex-wrap gap-1 focus-within:ring-1 focus-within:ring-ring">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-0.5 bg-gray-100 text-gray-700 text-[10px] px-1.5 py-0.5 rounded">
            {tag}
            <button onClick={() => removeTag(tag)} className="text-gray-400 hover:text-gray-600">
              <X size={9} />
            </button>
          </span>
        ))}
        <input
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => inputVal && addTag(inputVal)}
          placeholder={value.length === 0 ? "Type and press Enter…" : ""}
          className="flex-1 min-w-[60px] text-xs outline-none bg-transparent"
        />
      </div>
      {param.required && value.length === 0 && (
        <p className="text-[10px] text-red-500">Required</p>
      )}
      {param.hint && <p className="text-[10px] text-gray-400">{param.hint}</p>}
    </div>
  );
}
