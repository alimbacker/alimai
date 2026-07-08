// Thin wrappers around the browser's built-in Web Speech API. No dependencies,
// no server calls. Speech recognition works in Chromium-based browsers; speech
// synthesis works nearly everywhere. Both degrade gracefully when unsupported.

export function speechSupported() {
  return typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// Start listening once. Calls onResult(transcript) with the final text, onEnd()
// when it stops, onError(msg) on failure. Returns a stop() function.
export function startListening({ onResult, onEnd, onError, interim } = {}) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) { onError?.("Voice input isn't supported in this browser. Try Chrome."); return () => {}; }

  const rec = new Rec();
  rec.lang = navigator.language || "en-US";
  rec.interimResults = !!interim;
  rec.maxAlternatives = 1;
  rec.continuous = false;

  let finalText = "";
  rec.onresult = (e) => {
    let interimText = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const chunk = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += chunk;
      else interimText += chunk;
    }
    onResult?.(finalText || interimText, e.results[e.results.length - 1].isFinal);
  };
  rec.onerror = (e) => onError?.(e.error === "not-allowed"
    ? "Microphone access was blocked. Allow it in your browser to use voice."
    : `Voice error: ${e.error}`);
  rec.onend = () => onEnd?.(finalText);

  try { rec.start(); } catch (err) { onError?.(err.message); }
  return () => { try { rec.stop(); } catch { /* noop */ } };
}

// Speak text aloud. Cancels anything already speaking. Strips markdown so it
// reads cleanly. No-ops if speech synthesis is unavailable.
export function speak(text, { onEnd } = {}) {
  if (typeof window === "undefined" || !window.speechSynthesis || !text) { onEnd?.(); return; }
  const clean = String(text)
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/[*_#>`~]/g, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = navigator.language || "en-US";
  u.rate = 1.02;
  u.pitch = 1;
  u.onend = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
}
