import { useState, useEffect, useRef } from "react";
import { Send, Bot, X, Loader2, MapPin, Sparkles } from "lucide-react";
import { useAIAssistant } from "./useAIAssistant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

type HospitalSuggestion = {
  id: string;
  name: string;
  city: string;
  state: string;
  address: string;
  phone: string | null;
  departments: string[];
  distance?: number;
};

export default function AIAssistant({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationLoaded, setLocationLoaded] = useState(false);
  const [showHospitals, setShowHospitals] = useState<HospitalSuggestion[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, loading, error, sendMessage, clearChat } = useAIAssistant({
    userLatitude: userLocation?.latitude ?? null,
    userLongitude: userLocation?.longitude ?? null,
    onHospitalsFound: (hospitals) => {
      setShowHospitals(hospitals);
    },
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationLoaded(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setLocationLoaded(true);
      },
      () => {
        setLocationLoaded(true);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("message") as HTMLInputElement | null;
    const text = input?.value.trim();
    if (!text) return;
    input.value = "";
    void sendMessage(text);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {!open ? (
        <Button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 bg-[#065c3f] hover:bg-[#0b7a55] shadow-lg"
          size="sm"
        >
          <Bot size={18} className="text-white" />
          <span className="text-white font-semibold text-sm">CareNexa AI</span>
        </Button>
      ) : (
        <div
          className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}
      {open && (
        <div
          className={`fixed bottom-6 right-6 z-[70] w-96 h-[70vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col ${className || ""}`}
        >
          <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
            <div className="flex items-center gap-2">
              <Bot size={20} className="text-[#065c3f]" />
              <h3 className="font-semibold text-slate-900">CareNexa AI Assistant</h3>
            </div>
            <Button
              onClick={() => setOpen(false)}
              variant="outline"
              size="sm"
              className="h-8 px-2 text-slate-600 hover:text-[#065c3f]"
            >
              <X size={16} />
            </Button>
          </div>

          <ScrollArea className="flex-1 p-4 space-y-4">
            <div ref={scrollRef} className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${
                    msg.role === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-lg rounded-tl-none ${
                      msg.role === "user"
                        ? "bg-[#065c3f] text-white rounded-br-none"
                        : "bg-[#eef4f1] text-slate-800 rounded-bl-none"
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  </div>
                  {msg.role === "assistant" && (
                    <span className="flex shrink-0 items-center justify-center w-6 h-6 rounded-full bg-[#065c3f]/10 text-[#065c3f] text-xs">
                      <Sparkles size={12} />
                    </span>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3 flex-row-reverse">
                  <div className="max-w-[80%] p-3 bg-[#eef4f1] text-slate-800 rounded-lg rounded-bl-none">
                    <div className="flex gap-1">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="w-2 h-2 bg-[#065c3f]/40 rounded-full animate-pulse"
                        ></div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {error && (
                <div className="flex gap-3">
                  <div className="max-w-[80%] p-3 bg-red-50 text-red-700 rounded-lg rounded-bl-none text-sm">
                    {error}
                  </div>
                </div>
              )}
              {showHospitals.length > 0 && (
                <div className="flex gap-3">
                  <div className="max-w-[80%] p-3 bg-blue-50 text-blue-800 rounded-lg rounded-bl-none">
                    <p className="text-sm font-semibold mb-1">Nearby hospitals I found:</p>
                    <ul className="text-xs space-y-1">
                      {showHospitals.map((h) => (
                        <li key={h.id} className="flex gap-1">
                          <MapPin size={12} className="text-[#065c3f]/60" />
                          <span className="truncate">
                            {h.name}
                            {h.distance != null ? ` (~${h.distance.toFixed(1)} km)` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-[10px] text-blue-600">
                      Tap a hospital above to view details
                    </p>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-3 border-t border-slate-100 bg-white rounded-b-2xl">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                name="message"
                placeholder="Ask about hospitals, diseases, or health..."
                disabled={loading}
                className="flex-1 text-sm"
              />
              <Button
                type="submit"
                disabled={loading}
                className="h-9 w-9 p-0"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={18} />
                )}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}