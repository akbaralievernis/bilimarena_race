type BrandMarkProps = {
  className?: string;
};

/** Logo mark: a winding route from start (turquoise) to finish (sun). */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="9" fill="#635BFF" />
      <path
        d="M8 23c4 0 4-7 8-7s4-7 8-7"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="8" cy="23" r="3.25" fill="#21B8A6" stroke="#fff" strokeWidth="1.5" />
      <circle cx="24" cy="9" r="3.25" fill="#FFB020" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}
