// Dependency-free SVG bar chart for the admin dashboard.
export default function BarChart({ data = [], height = 120, color = "var(--accent)", suffix = "" }) {
  const vals = data.map((d) => d.value || 0);
  const max = Math.max(1, ...vals);
  const hasData = vals.some((v) => v > 0);

  if (!data.length || !hasData) {
    return <div className="chart-empty">No data yet</div>;
  }

  const gap = 6;
  const n = data.length;
  const bw = 100 / n;

  return (
    <div className="barchart">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
        {data.map((d, i) => {
          const h = ((d.value || 0) / max) * (height - 8);
          return (
            <rect
              key={i}
              x={i * bw + gap / 4}
              y={height - h}
              width={bw - gap / 2}
              height={Math.max(h, d.value ? 2 : 0)}
              rx="1.5"
              fill={color}
              opacity={d.value ? 0.9 : 0.15}
            >
              <title>{d.date}: {d.value}{suffix}</title>
            </rect>
          );
        })}
      </svg>
      <div className="barchart-axis">
        <span>{data[0]?.date?.slice(5)}</span>
        <span>{data[data.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  );
}
