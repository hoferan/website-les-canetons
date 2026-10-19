import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { t } from "../i18n";

/**
 * The search box over a list: the roster and the planning (#97).
 *
 * Not a FormField: that exists for the error wiring a submitted form needs,
 * and a search box has no submit and no error. The server refuses only a
 * query over the length `maxLength` already stops.
 *
 * The label is visually hidden and repeated as the placeholder, unless a
 * screen passes a shorter `placeholder` for a box that shares a row. A visible
 * label would cost the planning a row against the #182 phone budget. A
 * placeholder alone is no accessible name and vanishes on typing.
 *
 * Controlled and not debounced here: the screen decides when a keystroke
 * becomes a request, through useDebouncedValue below, so the clear button is
 * instant and a screen can reset its filters without waiting on a timer.
 */
export function SearchField({
  id,
  label,
  placeholder,
  value,
  onChange,
  className,
}: {
  id: string;
  label: string;
  /** Shorter visible text, where the box shares a row; `label` stays its accessible name. */
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
      />
      <Input
        id={id}
        type="search"
        // The API's own ceiling (App\Support\Search::MAX_LENGTH), so the one
        // refusal the endpoint has can never be typed.
        maxLength={100}
        placeholder={placeholder ?? label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // Room for the magnifier on the left, and for the clear button on the
        // right only while there is one: an empty box sharing a phone row has
        // no pixel to spare. WebKit's own cancel button is hidden so there is
        // one clear button. `bg-panel` and `border-line` match the roster's
        // native selects beside it.
        className={`border-line bg-panel pl-9 [&::-webkit-search-cancel-button]:hidden ${value === "" ? "pr-3" : "pr-12"}`}
        autoComplete="off"
      />
      {value === "" ? null : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-1/2 right-0 -translate-y-1/2"
          aria-label={t("common.clearSearch")}
          onClick={() => onChange("")}
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

/**
 * `value`, once it has stopped changing for `delay` milliseconds.
 *
 * 250ms is under the pause between words and over the gap between letters, so
 * a typed name is one request. The list keeps showing the last answer
 * meanwhile, because the screens pass `placeholderData: keepPreviousData`.
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
