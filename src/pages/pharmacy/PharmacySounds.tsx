import { useState } from "react";
import { Bell, Check, Play, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { ALERT_SOUNDS, getSoundPrefs, saveSoundPrefs } from "@/lib/alertSounds";
import type { AlertSoundId } from "@/lib/alertSounds";

type Props = {
    notificationSound: boolean;
    onToggleSound: () => void;
    onPreview: (id: AlertSoundId, volume: number) => void;
};

export default function PharmacySounds({ notificationSound, onToggleSound, onPreview }: Props) {
    const [selected, setSelected] = useState<AlertSoundId>(() => getSoundPrefs().sound);
    const [volume, setVolume] = useState(() => getSoundPrefs().volume);

    function choose(id: AlertSoundId) {
        setSelected(id);
        saveSoundPrefs({ sound: id });
        onPreview(id, volume);
        const name = ALERT_SOUNDS.find((s) => s.id === id)?.name;
        toast.success(`Alert sound set to ${name}`);
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Bell size={20} /></span>
                    <div>
                        <p className="font-extrabold text-slate-900">Order and request alerts</p>
                        <p className="text-sm text-slate-500">Rings and counts down 30 seconds when a new order or prescription request arrives.</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onToggleSound}
                    aria-pressed={notificationSound}
                    className={`min-h-[44px] rounded-xl px-4 text-sm font-bold ${notificationSound ? "bg-emerald-600 text-white" : "border border-slate-300 text-slate-700"}`}
                >
                    {notificationSound ? "Sound on" : "Sound off, turn on"}
                </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <label htmlFor="alert-volume" className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <Volume2 size={16} /> Volume <span className="font-medium text-slate-500">{Math.round(volume * 100)}%</span>
                </label>
                <input
                    id="alert-volume"
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={Math.round(volume * 100)}
                    onChange={(e) => {
                        const next = Number(e.target.value) / 100;
                        setVolume(next);
                        saveSoundPrefs({ volume: next });
                    }}
                    onPointerUp={() => onPreview(selected, volume)}
                    onKeyUp={() => onPreview(selected, volume)}
                    className="mt-3 w-full accent-emerald-600"
                />
            </div>

            <fieldset>
                <legend className="mb-3 text-sm font-extrabold uppercase tracking-wider text-slate-500">Choose your alert sound</legend>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {ALERT_SOUNDS.map((sound) => {
                        const active = selected === sound.id;
                        return (
                            <div key={sound.id} className={`flex items-center gap-3 rounded-2xl border-2 bg-white p-4 shadow-sm ${active ? "border-emerald-600 bg-emerald-50/60" : "border-slate-200"}`}>
                                <label className="flex min-h-[44px] flex-1 cursor-pointer items-start gap-3">
                                    <input type="radio" name="alert-sound" checked={active} onChange={() => choose(sound.id)} className="mt-1 h-4 w-4 accent-emerald-600" />
                                    <span>
                                        <span className="flex items-center gap-2 font-bold text-slate-900">{sound.name}{active && <Check size={15} className="text-emerald-700" aria-label="Selected" />}</span>
                                        <span className="block text-sm text-slate-500">{sound.description}</span>
                                    </span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => onPreview(sound.id, volume)}
                                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                                    aria-label={`Play ${sound.name}`}
                                >
                                    <Play size={16} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </fieldset>
            <p className="text-xs text-slate-500">Your choice is saved in this browser. Keep this dashboard open and unmuted on your device so the alert can ring.</p>
        </div>
    );
}