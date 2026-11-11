"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Variant = "field" | "pill";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /**
   * Marks a row that does something instead of picking a value, such as "Manage…". It sits below a
   * divider, is quieter than the choices, and never shows the selected check.
   */
  action?: boolean;
  /** A small icon at the end of the row, in the column the selected check uses. */
  icon?: ReactNode;
}

export interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  variant?: Variant;
  compact?: boolean;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
}

const SHAPE: Record<Variant, string> = {
  field: "h-10 max-sm:h-11 rounded-stamp pl-3 pr-9",
  pill: "h-9 max-sm:h-11 rounded-full pl-4 pr-9 font-medium",
};

const MENU_MAX_HEIGHT = 256;
const GAP = 6;

interface Placement {
  left: number;
  width: number;
  maxHeight: number;
  /** Distance from the top of the screen, or from the bottom when the menu opens upward. */
  top?: number;
  bottom?: number;
}

/**
 * A dropdown that looks like the rest of the app. The menu is drawn here, not by the
 * browser, so it matches the buttons and fields. It works with the keyboard too:
 * arrows, Home/End, Enter or Space to choose, Escape to close, and typing to jump.
 */
export function Select({
  value,
  options,
  onChange,
  variant = "field",
  compact = false,
  disabled = false,
  id,
  "aria-label": ariaLabel,
  className = "",
}: SelectProps) {
  const uid = useId();
  const listId = `${uid}-list`;
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const [placement, setPlacement] = useState<Placement | null>(null);
  const [active, setActive] = useState(0);
  const open = placement !== null;

  const selected = options.findIndex((o) => o.value === value);
  const shown = options[selected];

  function openMenu() {
    const button = trigger.current;
    if (!button || disabled || options.length === 0) return;
    const rect = button.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP - 8;
    const above = rect.top - GAP - 8;
    const wanted = Math.min(MENU_MAX_HEIGHT, options.length * 36 + 8);
    const up = below < wanted && above > below;
    setPlacement({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(120, Math.min(MENU_MAX_HEIGHT, up ? above : below)),
      ...(up ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
    });
    setActive(selected >= 0 ? selected : (options.findIndex((o) => !o.disabled) ?? 0));
  }

  function close(refocus = true) {
    setPlacement(null);
    if (refocus) trigger.current?.focus();
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    close();
  }

  /** Next enabled option from `from` in `step` direction, staying put at either end. */
  function move(from: number, step: 1 | -1): number {
    for (let i = from + step; i >= 0 && i < options.length; i += step) {
      if (!options[i].disabled) return i;
    }
    return from;
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((a) => move(a, 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActive((a) => move(a, -1));
        return;
      case "Home":
        event.preventDefault();
        setActive(move(-1, 1));
        return;
      case "End":
        event.preventDefault();
        setActive(move(options.length, -1));
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        return;
      case "Escape":
        // A dialog around the select must not close with it.
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      case "Tab":
        close(false);
        return;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const now = Date.now();
          const text = (now - typed.current.at > 700 ? "" : typed.current.text) + event.key.toLowerCase();
          typed.current = { text, at: now };
          const hit = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(text));
          if (hit >= 0) setActive(hit);
        }
    }
  }

  // Close when the page moves under the menu or a click lands elsewhere.
  useEffect(() => {
    if (!open) return;
    const away = (event: Event) => {
      const target = event.target as Node;
      if (trigger.current?.contains(target) || list.current?.contains(target)) return;
      setPlacement(null);
    };
    const resize = () => setPlacement(null);
    document.addEventListener("pointerdown", away);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  return (
    <span className={`relative block ${className}`}>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${uid}-opt-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        // The border carries the focus state. A second outline around it looked doubled.
        className={`peer block w-full cursor-pointer truncate border border-line-strong bg-sheet text-left text-sm text-ink outline-none transition-colors duration-150 hover:border-kite-ink focus-visible:border-postal aria-expanded:border-postal disabled:cursor-not-allowed disabled:border-line disabled:bg-sunk disabled:text-ink-3 ${SHAPE[variant]} ${compact ? "h-8" : ""}`}
      >
        {shown?.label ?? ""}
      </button>
      <ChevronDown
        aria-hidden
        className={`pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-3 transition-transform duration-150 peer-hover:text-kite-ink peer-disabled:opacity-50 ${open ? "rotate-180 text-kite-ink" : ""}`}
      />
      {placement
        ? createPortal(
            <ul
              ref={list}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              style={{ position: "fixed", left: placement.left, minWidth: placement.width, top: placement.top, bottom: placement.bottom, maxHeight: placement.maxHeight }}
              // Elevation is the shadow alone: a hairline under a soft shadow reads as a boxed card.
              className={`select-menu z-[60] max-w-[min(24rem,calc(100vw-1rem))] overflow-auto rounded-xl bg-sheet p-1.5 shadow-lift ${
                placement.bottom !== undefined ? "origin-bottom" : "origin-top"
              }`}
            >
              {options.map((option, index) => {
                const isSelected = index === selected && !option.action;
                const isActive = index === active && !option.disabled;
                return (
                  <li
                    key={option.value}
                    id={`${uid}-opt-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    // Keep focus on the button so the keyboard keeps working.
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseMove={() => !option.disabled && setActive(index)}
                    onClick={() => choose(index)}
                    // One highlight only: the row under the pointer or keyboard. The chosen row is told apart
                    // by weight and its check, so hovering never produces two matching blue rows.
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-100 max-sm:py-2.5 ${
                      option.action ? "relative mt-1.5 before:absolute before:inset-x-1 before:-top-1 before:h-px before:bg-line" : ""
                    } ${
                      option.disabled
                        ? "cursor-not-allowed text-ink-3"
                        : isSelected
                          ? "font-semibold text-ink"
                          : "text-ink"
                    } ${isActive ? "bg-sunk" : ""}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {/* Trailing, in the same column as the check, so every label starts at the same left edge. */}
                    {option.icon ? <span className="grid size-4 shrink-0 place-items-center text-ink-3">{option.icon}</span> : null}
                    {isSelected ? <Check aria-hidden className="size-4 shrink-0 text-postal" strokeWidth={2.25} /> : null}
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </span>
  );
}
