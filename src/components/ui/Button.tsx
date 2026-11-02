import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

/** Primary is the landing's ink pill that warms to cobalt on hover. */
const VARIANT: Record<Variant, string> = {
  primary:
    "bg-kite-ink text-white border-kite-ink hover:bg-kite-cobalt hover:border-kite-cobalt disabled:bg-sunk disabled:border-line-strong disabled:text-ink-3",
  secondary: "bg-sheet text-ink border-line-strong hover:border-kite-ink hover:bg-sheet disabled:text-ink-3 disabled:bg-sunk disabled:border-line",
  ghost: "bg-transparent text-ink-2 border-transparent hover:bg-sunk hover:text-ink disabled:text-ink-3",
  danger: "bg-sheet text-failed border-failed hover:bg-failed-wash disabled:text-ink-3 disabled:border-line",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = "secondary", loading = false, icon, children, className = "", disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed ${VARIANT[variant]} ${className}`}
    >
      {loading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
