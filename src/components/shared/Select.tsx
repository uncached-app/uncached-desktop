import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeUnder } from "../../utils/menuPlacement.mjs";

export type SelectOption = { value: string; label: string };

/**
 * Pick one of a list, in the app's own drawing.
 *
 * A native `<select>` is the operating system's control, not this one: it
 * arrives with the platform's typeface, its focus ring and its popup, and on a
 * dark panel it reads as a hole. So the list is the same surface as the
 * command palette and the context menu — a rounded panel, `forest` on
 * `forest`, one row per value.
 *
 * The panel is portalled to the body rather than drawn in place. Two reasons:
 * an ancestor with a backdrop filter turns `fixed` into "relative to that
 * ancestor", and a scrolling settings body would clip a list longer than the
 * row that opened it.
 */
export function Select({
  value,
  options,
  onChange,
  disabled = false,
  label,
  className = "",
  size = "md",
  icon,
  onPreview,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** What the control is choosing, for anyone not reading the row beside it. */
  label: string;
  className?: string;
  size?: "sm" | "md";
  icon?: React.ReactNode;
  /**
   * The option the cursor is resting on, for a value worth showing before it is
   * chosen. `null` when the list closes without a choice, which is the caller's
   * cue to put back whatever was there.
   *
   * Driven by the highlight rather than by the pointer, so the arrow keys
   * preview exactly as hovering does — they are the same cursor.
   */
  onPreview?: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [box, setBox] = useState({ left: 0, top: 0, maxHeight: 0, minWidth: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const chosen = options.find((option) => option.value === value);

  // Placed from its measured size, and again whenever that size changes —
  // applying the trigger's width as a floor is itself a size change.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const list = listRef.current;
    if (!trigger || !list) return;
    const place = () => {
      const anchor = trigger.getBoundingClientRect();
      const { width, height } = list.getBoundingClientRect();
      setBox({
        ...placeUnder({
          anchor,
          width,
          height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        }),
        minWidth: anchor.width,
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(list);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: MouseEvent) {
      const target = event.target as Node;
      if (!listRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    }
    // The control moves with the panel it sits in, so a scroll leaves the list
    // pointing at nothing. Its own scrolling is the reader using it.
    function onScroll(event: Event) {
      if (!listRef.current?.contains(event.target as Node)) setOpen(false);
    }
    const close = () => setOpen(false);
    window.addEventListener("mousedown", dismiss, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", dismiss, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  // Focus stays on the trigger and `aria-activedescendant` says where the
  // cursor is, so closing never has to put focus back anywhere.
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  // Held in a ref so the effect below does not re-run whenever the caller
  // happens to pass a new function, which is every render.
  const preview = useRef(onPreview);
  preview.current = onPreview;
  /** Whether the list is closing because something was picked. */
  const chose = useRef(false);

  const previewing = open ? (options[active]?.value ?? null) : null;
  useEffect(() => {
    if (previewing === null && chose.current) {
      chose.current = false;
      return;
    }
    preview.current?.(previewing);
  }, [previewing]);

  // Closing the panel this lives in unmounts the whole thing, and a preview
  // nobody took back would leave the app wearing a theme nobody chose.
  useEffect(() => () => preview.current?.(null), []);

  function show() {
    const at = options.findIndex((option) => option.value === value);
    setActive(at < 0 ? 0 : at);
    setOpen(true);
    // Taken, not assumed.
    //
    // On macOS, clicking a button does not focus it — WebKit follows the
    // platform convention, and Full Keyboard Access is the setting that changes
    // it. Every key this control listens for is bound to the trigger, so a list
    // opened with the mouse was one the arrow keys could not reach: the events
    // were going to the body. Asking for focus here is what makes the keyboard
    // half of this control exist on a Mac.
    triggerRef.current?.focus();
  }

  function choose(option: SelectOption) {
    // The preview does not have to be taken back: the value it was showing is
    // now the value. Clearing it here would repaint the old one for as long as
    // saving takes, which is a flash of the theme the user just replaced.
    chose.current = true;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKey(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      // Only when there is a list to close. The panels this sits in close on
      // Escape too, and one key should not shut two things at once.
      if (open) event.stopPropagation();
      setOpen(false);
      return;
    }
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        show();
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((at) => (at + step + options.length) % options.length);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (options[active]) choose(options[active]);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        /* `outline-none`, and the border says it instead.

           Opening the list focuses the trigger, which is what makes the arrow
           keys work on a Mac — and it brought the platform's focus ring with
           it, drawn square around a rounded control in a colour from neither
           theme. The control already has a way of saying it is live: the same
           sage border it wears while open, which is exactly when arrowing
           happens. Keyboard focus on the closed control keeps it too, so
           tabbing here still shows where you are. */
        className={`flex items-center justify-between gap-2 rounded-xl border text-start outline-none transition-colors cursor-pointer disabled:opacity-60 ${
          size === "sm" ? "h-9 px-3 text-xs" : "px-3 py-2 text-sm"
        } ${
          open
            ? "border-sage-400 bg-forest-850 text-mist-100"
            : "border-forest-800 bg-forest-900 text-mist-100 focus-visible:border-sage-400/70 enabled:hover:border-forest-750 enabled:hover:bg-forest-850"
        } ${className}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {icon && <span className="shrink-0 text-mist-500">{icon}</span>}
          <span className="truncate">{chosen?.label ?? ""}</span>
        </span>
        <ChevronDown size={14} className="shrink-0 text-mist-500" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={listRef}
            id={id}
            role="listbox"
            aria-label={label}
            style={{ left: box.left, top: box.top, maxHeight: box.maxHeight, minWidth: box.minWidth }}
            /* The context menu's panel. A second dropdown drawn its own way is
               how two surfaces of one app stop looking like one app. */
            className="ui-rise fixed z-50 max-w-xs overflow-y-auto overscroll-contain rounded-2xl border border-forest-800 bg-forest-900 py-1.5 shadow-2xl"
            /* Portalled content still bubbles through the React tree, and the
               panel this opens over closes on a click outside itself. */
            onClick={(event) => event.stopPropagation()}
          >
            {options.map((option, at) => (
              <button
                key={option.value}
                id={`${id}-${at}`}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onMouseMove={() => setActive(at)}
                onClick={() => choose(option)}
                /* `MenuRow`'s tokens, deliberately: a menu row is a verb with
                   an icon and an option is a value with a state, so they are
                   not the same component, and they are the same line. */
                className={`flex w-full items-center gap-3 px-4 py-2 text-start outline-none transition-colors ${
                  at === active ? "bg-forest-800" : ""
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-mist-100">{option.label}</span>
                {option.value === value && <Check size={14} className="shrink-0 text-sage-300" aria-hidden="true" />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
