import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { t } from "../i18n";

/**
 * The search box over a list: the roster and the planning (#97).
 *
 * NOT A FormField, which is otherwise the only way a text field enters this
 * app. FormField exists for the aria-invalid / error-id wiring a submitted
 * form needs, and a search box has no submit and no error to wire: the server
 * refuses only a 101-character query, which `maxLength` already stops.
 *
 * THE LABEL IS VISUALLY HIDDEN AND REPEATED AS THE PLACEHOLDER, unless a
 * screen passes a shorter `placeholder` for a box that shares a row. A visible
 * label above the box would cost the planning a row, which is what #182 spent
 * two rounds taking away; the magnifier and the placeholder say what the box
 * is to a sighted reader, and the <label> says it to everybody else. A
 * placeholder alone would not do — it is no accessible name, and it vanishes
 * the moment somebody types.
 *
 * CONTROLLED, AND NOT DEBOUNCED HERE. The box reflects every keystroke; the
 * screen decides when a keystroke becomes a request, through
 * useDebouncedValue below. That keeps the clear button instant and lets a
 * screen reset its filters without waiting on a timer.
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
        // right only while there is one: an empty box sharing a phone row
        // with the planning's switch has no pixel to spare. WebKit's own
        // cancel button is hidden: two clear buttons, one of which only some
        // browsers draw, is one too many. `bg-panel` and `border-line`
        // because it sits beside the roster's native selects, and Input's
        // transparent default showed the page grey through it.
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
 * What turns a keystroke into a request. 250ms is under the pause between
 * words and over the gap between letters, so "perrine" is one request and not
 * seven — and the list keeps showing the last answer meanwhile, because the
 * screens pass `placeholderData: keepPreviousData` to their queries.
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
