export default function ModelSelector({ models, selected, onChange }) {
  if (models.length === 0) {
    return (
      <div className="model-selector model-selector--empty">
        No models configured — add an API key in backend/.env
      </div>
    );
  }

  return (
    <select
      className="model-selector"
      value={selected || ""}
      onChange={(e) => onChange(e.target.value)}
    >
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
