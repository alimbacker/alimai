// Appearance: "light" | "dark" | "system" (default). Persisted in localStorage.
export function getAppearance() {
  return localStorage.getItem("appearance") || "system";
}
export function applyAppearance(pref = getAppearance()) {
  localStorage.setItem("appearance", pref);
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const dark = pref === "dark" || (pref === "system" && systemDark);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
// Re-apply on OS theme change when in "system" mode.
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
  if (getAppearance() === "system") applyAppearance("system");
});
