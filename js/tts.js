// HIVEMIND - Text-to-Speech Engine (Web Speech API)
// Voice synthesis for NPC dialogue — no external services needed

let voice = null;
let speaking = false;
let enabled = true;

function getVoice() {
  if (voice) return voice;
  const voices = speechSynthesis.getVoices();
  // Prefer a deep/robotic sounding English voice
  const preferred = ['Google UK English Male', 'Microsoft David', 'Daniel', 'Alex', 'Fred', 'Google US English'];
  for (const name of preferred) {
    const found = voices.find(v => v.name.includes(name));
    if (found) { voice = found; return voice; }
  }
  voice = voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
  return voice;
}

// Voices load asynchronously in some browsers
if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = getVoice;
}

export function speak(text, rate = 0.85, pitch = 0.7) {
  if (!enabled || !text || typeof speechSynthesis === 'undefined') return;
  stop();

  const utterance = new SpeechSynthesisUtterance(text);
  const v = getVoice();
  if (v) utterance.voice = v;
  utterance.rate = rate;
  utterance.pitch = pitch;
  utterance.volume = 0.7;

  utterance.onstart = () => { speaking = true; };
  utterance.onend = () => { speaking = false; };
  utterance.onerror = () => { speaking = false; };

  speechSynthesis.speak(utterance);
}

export function stop() {
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel();
  }
  speaking = false;
}

export function isSpeaking() { return speaking; }
export function setEnabled(val) { enabled = val; }
export function isEnabled() { return enabled; }
