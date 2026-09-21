import Image from "next/image";

// NARAN Amerik Baraa logo (black on transparent). "wordmark" drops the
// "Since 2016" line so it stays legible at nav height; "full" is the whole mark.
export function Logo({ variant = "wordmark", className = "", priority = false }:
  { variant?: "wordmark" | "full"; className?: string; priority?: boolean }) {
  const full = variant === "full";
  return (
    <Image
      src={full ? "/brand/naran-logo.png" : "/brand/naran-logo-wordmark.png"}
      alt="Naran Amerik Baraa"
      width={452}
      height={full ? 330 : 256}
      priority={priority}
      className={`w-auto select-none ${className}`}
    />
  );
}
