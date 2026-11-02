import { useState, useCallback, useRef, useEffect } from "react";
import { requireSupabase } from "@/lib/supabase";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

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

type UseAIAssistantOptions = {
  userLatitude?: number | null;
  userLongitude?: number | null;
  onHospitalsFound?: (hospitals: HospitalSuggestion[]) => void;
};

export function useAIAssistant({
  userLatitude,
  userLongitude,
  onHospitalsFound,
}: UseAIAssistantOptions = {}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hello! I'm your CareNexa AI assistant. I can help you find nearby hospitals based on your location and health needs. What are you looking for?",
      createdAt: Date.now(),
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-1.5-flash";
  const FALLBACK_MODELS = ["gemini-1.5-flash", "gemini-1.5-flash-002", "gemini-1.5-pro", "gemini-1.0-pro"];

  const systemPrompt = `
You are CareNexa's AI health assistant. You help users find nearby hospitals and answer general health questions.

IMPORTANT RULES:
1. When a user asks about a disease, symptom, or medical specialty (e.g., "fever", "heart pain", "diabetes", "cardiologist"), recommend hospitals near their location that have relevant departments.
2. Always consider the user's current location when suggesting hospitals.
3. If the user asks a general question, answer helpfully and offer to find nearby hospitals if relevant.
4. Keep responses concise, friendly, and in plain language.
5. Do not provide medical diagnosis or treatment advice. Always suggest consulting a doctor.
6. Respond in the same language the user uses.

When hospital data is provided in context, use it to make specific recommendations with hospital names, distances, and departments.
`;

  const fetchNearbyHospitals = useCallback(async (query: string): Promise<HospitalSuggestion[]> => {
    try {
      const supabase = requireSupabase();
      let dbQuery = supabase
        .from("hospitals")
        .select("id,name,city,state,address,phone,departments,latitude,longitude")
        .eq("status", "approved");

      const { data } = await dbQuery;
      const hospitals = (data || []) as Array<{
        id: string;
        name: string;
        city: string;
        state: string;
        address: string;
        phone: string | null;
        departments: string[] | null;
        latitude: number | null;
        longitude: number | null;
      }>;

      const lowerQuery = query.toLowerCase();

      const matched = hospitals.filter((h) => {
        const depts = (h.departments || []).map((d) => d.toLowerCase());
        const text = `${h.name} ${h.city} ${h.state} ${depts.join(" ")}`;
        return (
          depts.some((d) => lowerQuery.includes(d) || d.includes(lowerQuery)) ||
          text.includes(lowerQuery)
        );
      });

      const withDistance = matched.map((h) => {
        let distance: number | undefined;
        if (
          userLatitude != null &&
          userLongitude != null &&
          h.latitude != null &&
          h.longitude != null &&
          h.latitude !== 0 &&
          h.longitude !== 0
        ) {
          const radians = (deg: number) => (deg * Math.PI) / 180;
          const latDelta = radians(h.latitude - userLatitude);
          const lngDelta = radians(h.longitude - userLongitude);
          const a =
            Math.sin(latDelta / 2) ** 2 +
            Math.cos(radians(userLatitude)) *
              Math.cos(radians(h.latitude)) *
              Math.sin(lngDelta / 2) ** 2;
          distance = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
        return {
          id: h.id,
          name: h.name,
          city: h.city,
          state: h.state,
          address: h.address,
          phone: h.phone,
          departments: h.departments || [],
          distance,
        };
      });

      withDistance.sort((a, b) => {
        if (a.distance != null && b.distance != null) return a.distance - b.distance;
        return a.name.localeCompare(b.name);
      });

      return withDistance.slice(0, 8);
    } catch {
      return [];
    }
  }, [userLatitude, userLongitude]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!GEMINI_API_KEY || GEMINI_API_KEY === "your_gemini_api_key_here") {
        setError(
          "Gemini API key is not configured. Please add VITE_GEMINI_API_KEY to your .env file."
        );
        return;
      }

      const userMsg: Message = {
        id: `msg-${Date.now()}`,
        role: "user",
        content,
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      setError("");

      const healthKeywords = [
        "hospital",
        "doctor",
        "fever",
        "pain",
        "heart",
        "diabetes",
        "cold",
        "cough",
        "emergency",
        "clinic",
        "specialist",
        "dentist",
        "surgery",
        "checkup",
        "near me",
        "nearby",
      ];
      const isHealthQuery = healthKeywords.some((k) => content.toLowerCase().includes(k));

      let hospitalsContext = "";
      if (isHealthQuery) {
        const hospitals = await fetchNearbyHospitals(content);
        if (hospitals.length > 0 && onHospitalsFound) {
          onHospitalsFound(hospitals);
        }
        hospitalsContext =
          hospitals.length > 0
            ? `\n\nNearby hospitals relevant to this query:\n${hospitals
                .map(
                  (h) =>
                    `- ${h.name} (${h.city}, ${h.state})${h.distance != null ? `, ~${h.distance.toFixed(1)} km` : ""} - Depts: ${h.departments.join(", ")}`
                )
                .join("\n")}`
            : "\n\nNo specific hospitals found matching this query near your location.";
      }

      const conversation = messages
        .slice(-10)
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");

      const fullPrompt = `${systemPrompt}

Conversation so far:
${conversation}

User: ${content}${hospitalsContext}

Assistant:`;

      abortControllerRef.current = new AbortController();

      try {
        // Try primary model, then fallbacks if it fails
        const modelsToTry = [GEMINI_MODEL, ...FALLBACK_MODELS.filter(m => m !== GEMINI_MODEL)];
        let lastError: any = null;

        for (const model of modelsToTry) {
          try {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: fullPrompt }] }],
                  generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1000,
                  },
                }),
                signal: abortControllerRef.current.signal,
              }
            );

            if (!response.ok) {
              lastError = new Error(`Gemini API error: ${response.status}`);
              continue;
            }

            const data = await response.json();
            const assistantText =
              data.candidates?.[0]?.content?.parts?.[0]?.text ||
              "I'm sorry, I couldn't generate a response. Please try again.";

            const assistantMsg: Message = {
              id: `msg-${Date.now() + 1}`,
              role: "assistant",
              content: assistantText,
              createdAt: Date.now(),
            };

            setMessages((prev) => [...prev, assistantMsg]);
            return; // Success, exit the loop
          } catch (err: any) {
            if (err.name === "AbortError") return;
            lastError = err;
            continue;
          }
        }

        // All models failed
        throw lastError || new Error("All Gemini models failed");
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to get response from AI assistant."
        );
      } finally {
        setLoading(false);
        abortControllerRef.current = null;
      }
    },
    [
      GEMINI_API_KEY,
      GEMINI_MODEL,
      systemPrompt,
      messages,
      fetchNearbyHospitals,
      onHospitalsFound,
    ]
  );

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const clearChat = useCallback(() => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Hello! I'm your CareNexa AI assistant. How can I help you find hospitals today?",
        createdAt: Date.now(),
      },
    ]);
    setError("");
  }, []);

  return {
    messages,
    loading,
    error,
    sendMessage,
    clearChat,
  };
}
