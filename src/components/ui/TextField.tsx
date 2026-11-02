import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: string;
  error?: string;
  /** Rendered inside the field's right edge, e.g. a show/hide toggle. */
  trailing?: ReactNode;
  mono?: boolean;
}

export const inputClass =
  "h-10 w-full rounded-stamp border border-line-strong bg-sheet px-3 text-sm text-ink transition-colors duration-150 hover:border-ink-3 outline-none focus:border-postal focus-visible:outline-none disabled:bg-sunk disabled:text-ink-3 aria-[invalid=true]:border-failed";

export function TextField({ label, hint, error, trailing, mono, className = "", ...rest }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          {...rest}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${inputClass} ${mono ? "font-mono" : ""} ${trailing ? "pr-11" : ""}`}
        />
        {trailing ? <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div> : null}
      </div>
      {hint ? (
        <p id={hintId} className="mt-1 text-[13px] leading-snug text-ink-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 text-[13px] leading-snug text-failed">
          {error}
        </p>
      ) : null}
    </div>
  );
}
