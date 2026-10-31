import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownUp, Filter } from "lucide-react";

export type SortOption = "distance" | "rating";

export interface PharmacyFilterState {
  openNow: boolean;
  maxDistance: number;
  sortBy: SortOption;
}

interface PharmacyFiltersProps {
  filters: PharmacyFilterState;
  onChange: (filters: PharmacyFilterState) => void;
}

const PharmacyFilters = ({ filters, onChange }: PharmacyFiltersProps) => {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Filter className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Filter &amp; Sort
        </h3>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        {/* Open Now */}
        <div className="flex items-center gap-2">
          <Switch
            id="open-now"
            checked={filters.openNow}
            onCheckedChange={(checked) =>
              onChange({ ...filters, openNow: checked })
            }
          />
          <Label htmlFor="open-now" className="text-sm font-medium text-foreground cursor-pointer">
            Open Now
          </Label>
        </div>

        {/* Distance */}
        <div className="flex items-center gap-3 min-w-[200px]">
          <Label className="text-sm font-medium text-foreground whitespace-nowrap">
            Max Distance
          </Label>
          <Slider
            value={[filters.maxDistance]}
            onValueChange={([v]) => onChange({ ...filters, maxDistance: v })}
            min={0.5}
            max={5}
            step={0.5}
            className="w-28"
          />
          <span className="text-sm font-semibold text-primary whitespace-nowrap">
            {filters.maxDistance} km
          </span>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
          <Select
            value={filters.sortBy}
            onValueChange={(v) => onChange({ ...filters, sortBy: v as SortOption })}
          >
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="distance">Distance</SelectItem>
              <SelectItem value="rating">Rating</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default PharmacyFilters;
