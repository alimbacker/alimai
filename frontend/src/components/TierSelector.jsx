// Effort selector shown in place of the raw model name. Low / Medium / High map
// to real models on the server, which the user never sees.
export default function TierSelector({ value, onChange, tiers }) {
  const labels = { low: "Low", medium: "Medium", high: "High" };
  const opts = tiers && tiers.length ? tiers : ["low", "medium", "high"];
  return (
    <select className="tier-selector" value={value} onChange={(e) => onChange(e.target.value)} title="Response effort">
      {opts.map((t) => (
        <option key={t} value={t}>{labels[t] || t}</option>
      ))}
    </select>
  );
}
