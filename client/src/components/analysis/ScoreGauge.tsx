type Props = { score: number };

export function ScoreGauge({ score }: Props) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col items-center">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
        <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="text-2xl font-bold" fill={color} fontSize="22" fontWeight="700">
          {score}
        </text>
      </svg>
      <p className="text-xs text-gray-500 mt-0.5">Reliability Score</p>
    </div>
  );
}
