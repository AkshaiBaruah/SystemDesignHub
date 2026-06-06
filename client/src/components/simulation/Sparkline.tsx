import type { MetricPoint } from "@/simulation/types";

type Props = {
  data: MetricPoint[];
  width?: number;
  height?: number;
  color?: string;
};

export function Sparkline({ data, width = 200, height = 36, color = "#8b5cf6" }: Props) {
  if (data.length < 2) {
    return <svg width={width} height={height} className="opacity-30" />;
  }

  const values = data.map((d) => d.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const px = (i: number) => (i / (data.length - 1)) * width;
  const py = (v: number) => height - ((v - min) / range) * (height - 4) - 2;

  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${px(i).toFixed(1)} ${py(v).toFixed(1)}`)
    .join(" ");

  // Area fill path
  const area = `${d} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`sg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color.replace("#", "")})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
