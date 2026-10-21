type BrandMarkProps = {
  className?: string;
};

/** Bilim Arena logo mark (the same as on the main site): a tunduk in the red circle. */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small static logo, no optimisation needed
    <img src="/brand/mark.png" alt="" aria-hidden="true" width={36} height={36} className={className} />
  );
}
