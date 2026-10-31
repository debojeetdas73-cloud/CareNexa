import { useEffect, useState } from "react";
import { Search, MapPin, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getCurrentLocation, type Coordinates } from "@/lib/geolocation";
import { searchMedicineCatalogue } from "@/lib/pharmacyData";
import type { Medicine } from "@/data/medicines";

interface HeroSectionProps {
  onSearch: (medicine: Medicine | null) => void;
  onLocationChange: (location: Coordinates) => void;
}

const HeroSection = ({ onSearch, onLocationChange }: HeroSectionProps) => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Medicine[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [locationError, setLocationError] = useState("");
  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      setSuggestionError("");
      return;
    }

    let cancelled = false;
    setSuggestionsLoading(true);
    setSuggestionError("");
    const timer = window.setTimeout(() => {
      void searchMedicineCatalogue(normalized)
        .then((rows) => { if (!cancelled) { setSuggestions(rows); setActiveSuggestion(0); } })
        .catch((error) => {
          if (!cancelled) {
            setSuggestions([]);
            setSuggestionError(error instanceof Error ? error.message : "Could not search the medicine catalogue.");
          }
        })
        .finally(() => { if (!cancelled) setSuggestionsLoading(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  const chooseMedicine = (medicine: Medicine) => {
    setQuery(medicine.name);
    setSuggestionsOpen(false);
    setSuggestions([]);
    onSearch(medicine);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const medicine = suggestions[activeSuggestion] ?? suggestions[0];
    if (medicine) chooseMedicine(medicine);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setSuggestionsOpen(true);
      setActiveSuggestion((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setActiveSuggestion((current) => (current + suggestions.length - 1) % suggestions.length);
    } else if (event.key === "Escape") {
      setSuggestionsOpen(false);
    }
  };

  const handleLocate = async () => {
    setLocating(true);
    setLocationError("");
    try {
      const location = await getCurrentLocation();
      onLocationChange(location);
      setLocationReady(true);
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "Could not get your location.");
    } finally {
      setLocating(false);
    }
  };

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary to-[hsl(var(--hero-gradient-to))] px-4 py-20 md:py-32">
      <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-primary-foreground/5" />
      <div className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-primary-foreground/5" />

      <div className="container relative mx-auto max-w-3xl text-center">
        <p className="mb-4 inline-block rounded-full bg-primary-foreground/15 px-4 py-1.5 text-sm font-medium text-primary-foreground opacity-0 animate-fade-up">
          <MapPin className="mb-0.5 mr-1 inline h-3.5 w-3.5" />
          Find medicine at pharmacies near you
        </p>

        <h1
          className="font-display text-4xl font-extrabold leading-[1.1] tracking-tight text-primary-foreground opacity-0 animate-fade-up md:text-6xl"
          style={{ animationDelay: "100ms" }}
        >
          Your Medicine,{" "}
          <span className="relative">
            One Call Away
            <span className="absolute -bottom-1 left-0 h-1 w-full rounded-full bg-accent" />
          </span>
        </h1>

        <p
          className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-primary-foreground/80 opacity-0 animate-fade-up"
          style={{ animationDelay: "200ms" }}
        >
          Search any medicine and instantly see which nearby pharmacies have it
          in stock. Order for delivery or pick up in minutes.
        </p>

        <form
          onSubmit={handleSearch}
          className="mx-auto mt-10 flex max-w-xl flex-col gap-3 opacity-0 animate-fade-up sm:flex-row"
          style={{ animationDelay: "350ms" }}
        >
          <div className="relative flex-1 text-left">
            <Search className="pointer-events-none absolute left-4 top-4 h-5 w-5 text-muted-foreground" />
            <input
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={suggestionsOpen && query.trim().length >= 2}
              aria-controls="medicine-search-suggestions"
              aria-activedescendant={suggestionsOpen && suggestions.length ? `medicine-suggestion-${suggestions[activeSuggestion]?.id}` : undefined}
              type="text"
              value={query}
              onFocus={() => setSuggestionsOpen(true)}
              onKeyDown={handleSearchKeyDown}
              onChange={(e) => { setQuery(e.target.value); setSuggestions([]); setActiveSuggestion(0); setSuggestionsOpen(true); onSearch(null); }}
              placeholder="Search by medicine, generic, or brand..."
              className="h-14 w-full rounded-xl border-0 bg-primary-foreground pl-12 pr-4 text-foreground shadow-xl shadow-primary/20 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {suggestionsOpen && query.trim().length >= 2 && <div id="medicine-search-suggestions" role="listbox" className="absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-xl border border-border bg-card p-1 text-foreground shadow-xl">
              {suggestionsLoading ? <p role="status" className="px-3 py-3 text-sm text-muted-foreground">Searching the medicine catalogue…</p>
                : suggestionError ? <p role="alert" className="px-3 py-3 text-sm text-destructive">{suggestionError}</p>
                  : suggestions.length ? suggestions.map((medicine, index) => <button
                    type="button"
                    role="option"
                    aria-selected={index === activeSuggestion}
                    id={`medicine-suggestion-${medicine.id}`}
                    key={medicine.id}
                    onMouseEnter={() => setActiveSuggestion(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseMedicine(medicine)}
                    className={`flex min-h-12 w-full items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-primary/10 ${index === activeSuggestion ? "bg-primary/10" : ""}`}
                  >
                    <span className="min-w-0"><span className="block font-semibold">{medicine.name}{medicine.strength && !medicine.name.toLocaleLowerCase().includes(medicine.strength.toLocaleLowerCase()) ? ` · ${medicine.strength}` : ""}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{[medicine.genericName, medicine.brandName, medicine.dosageForm, medicine.packSize, medicine.manufacturer].filter(Boolean).join(" · ")}</span></span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {medicine.hasStock && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-900">In stock</span>}
                    </span>
                  </button>)
                    : <p className="px-3 py-3 text-sm text-muted-foreground">No matching medicine in the catalogue.</p>}
            </div>}
          </div>
          <Button type="submit" variant="hero" size="xl" disabled={!suggestions.length}>
            Search
          </Button>
        </form>

        <p className="mx-auto mt-2 max-w-xl text-xs text-primary-foreground/75">Select a catalogue medicine to see approved pharmacies with live stock and prices.</p>

        <div className="mx-auto mt-4 max-w-lg">
          <button
            type="button"
            onClick={handleLocate}
            disabled={locating}
            className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/10 disabled:opacity-60"
          >
            <MapPin className="h-4 w-4" />
            {locating ? "Detecting your location…" : locationReady ? "Refresh my location" : "Use my current location"}
          </button>
          {locationReady && <p role="status" className="mt-2 text-xs text-primary-foreground/80">Your location is active for nearby pharmacy distances.</p>}
          {locationError && <p role="alert" className="mt-2 text-xs text-primary-foreground">{locationError}</p>}
        </div>
        <div className="mx-auto mt-5 max-w-lg">
          <Link to="/hospitals" className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/35 bg-primary-foreground/10 px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-foreground/20">
            <Building2 className="h-4 w-4" /> Find hospitals
          </Link>
        </div>

      </div>
    </section>
  );
};

export default HeroSection;
