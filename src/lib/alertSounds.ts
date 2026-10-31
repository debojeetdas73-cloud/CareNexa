export type AlertSoundId = "classic" | "bell" | "chime" | "beep" | "siren" | "marimba" | "doorbell";

export const ALERT_SOUNDS: Array<{ id: AlertSoundId; name: string; description: string }> = [
    { id: "classic", name: "Classic ring", description: "Fast two-tone ring. Loud and hard to miss." },
    { id: "bell", name: "Shop bell", description: "A soft bell with a long, gentle fade." },
    { id: "chime", name: "Rising chime", description: "Four notes going up. Pleasant but clear." },
    { id: "beep", name: "Triple beep", description: "Sharp electronic beeps, good in a noisy store." },
    { id: "siren", name: "Urgent siren", description: "Rising and falling tone. The loudest option." },
    { id: "marimba", name: "Marimba", description: "Warm wooden notes. Calm but noticeable." },
    { id: "doorbell", name: "Doorbell", description: "Classic ding-dong." },
];

/* How often the alert repeats while it is on screen. Every pattern below is shorter than this. */
export const ALERT_REPEAT_MS = 1500;

type Note = { f: number; to?: number; at: number; dur: number; type?: OscillatorType; gain?: number };

const seq = (freqs: number[], step: number, dur: number, type: OscillatorType, gain: number): Note[] =>
    freqs.map((f, i) => ({ f, at: i * step, dur, type, gain }));

const PATTERNS: Record<AlertSoundId, Note[]> = {
    classic: seq([880, 1175, 880, 1175, 880, 1175], 0.15, 0.14, "triangle", 0.32),
    bell: [
        { f: 1046.5, at: 0, dur: 1.3, type: "sine", gain: 0.3 },
        { f: 2093, at: 0, dur: 0.8, type: "sine", gain: 0.12 },
        { f: 1568, at: 0.5, dur: 0.9, type: "sine", gain: 0.22 },
    ],
    chime: seq([784, 988, 1175, 1568], 0.22, 0.4, "sine", 0.3),
    beep: seq([1000, 1000, 1000], 0.25, 0.16, "square", 0.16),
    siren: [
        { f: 600, to: 1000, at: 0, dur: 0.45, type: "sawtooth", gain: 0.16 },
        { f: 1000, to: 600, at: 0.45, dur: 0.45, type: "sawtooth", gain: 0.16 },
        { f: 600, to: 1000, at: 0.9, dur: 0.45, type: "sawtooth", gain: 0.16 },
    ],
    marimba: seq([523, 659, 784, 659, 523, 784], 0.18, 0.22, "triangle", 0.34),
    doorbell: [
        { f: 659, at: 0, dur: 0.55, type: "sine", gain: 0.32 },
        { f: 523, at: 0.5, dur: 0.85, type: "sine", gain: 0.32 },
    ],
};

export function playAlertSound(context: AudioContext, id: AlertSoundId, volume = 1) {
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    const level = Math.min(1, Math.max(0.1, volume));
    const base = context.currentTime + 0.02;
    (PATTERNS[id] || PATTERNS.classic).forEach((note) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = base + note.at;
        const end = start + note.dur;
        oscillator.type = note.type || "sine";
        oscillator.frequency.setValueAtTime(note.f, start);
        if (note.to) oscillator.frequency.linearRampToValueAtTime(note.to, end);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, (note.gain ?? 0.3) * level), start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(end + 0.02);
    });
}

/* ---------- saved choice (per browser) ---------- */
const KEY = "carenexa_alert_prefs_v1";
export type SoundPrefs = { sound: AlertSoundId; volume: number; enabled: boolean };
const DEFAULTS: SoundPrefs = { sound: "classic", volume: 1, enabled: true };

export function getSoundPrefs(): SoundPrefs {
    try {
        const raw = JSON.parse(window.localStorage.getItem(KEY) || "{}") as Partial<SoundPrefs>;
        const sound = ALERT_SOUNDS.some((s) => s.id === raw.sound) ? (raw.sound as AlertSoundId) : DEFAULTS.sound;
        const volume = typeof raw.volume === "number" ? Math.min(1, Math.max(0.1, raw.volume)) : DEFAULTS.volume;
        const enabled = typeof raw.enabled === "boolean" ? raw.enabled : DEFAULTS.enabled;
        return { sound, volume, enabled };
    } catch {
        return { ...DEFAULTS };
    }
}

export function saveSoundPrefs(patch: Partial<SoundPrefs>) {
    try {
        window.localStorage.setItem(KEY, JSON.stringify({ ...getSoundPrefs(), ...patch }));
    } catch {
        /* storage blocked: the choice just will not be remembered */
    }
}

export const setSoundEnabledPref = (enabled: boolean) => saveSoundPrefs({ enabled });

/* Timer that keeps ticking when the tab is in the background.
   Normal setInterval is slowed to about once a minute in hidden tabs, which would break the countdown and the repeating ring.
   A worker timer is not slowed. Falls back to setInterval if workers are blocked. */
export function startTicker(ms: number, tick: () => void): () => void {
    let stopped = false;
    let worker: Worker | null = null;
    let fallbackId: number | null = null;
    const useFallback = () => {
        if (stopped || fallbackId !== null) return;
        worker?.terminate();
        worker = null;
        fallbackId = window.setInterval(tick, ms);
    };
    try {
        const code = `const t=setInterval(()=>postMessage(0),${Math.round(ms)});onmessage=()=>clearInterval(t);`;
        const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
        worker = new Worker(url);
        URL.revokeObjectURL(url);
        worker.onmessage = () => { if (!stopped) tick(); };
        worker.onerror = useFallback;
    } catch {
        useFallback();
    }
    return () => {
        stopped = true;
        if (fallbackId !== null) window.clearInterval(fallbackId);
        if (worker) {
            worker.postMessage("stop");
            worker.terminate();
        }
    };
}