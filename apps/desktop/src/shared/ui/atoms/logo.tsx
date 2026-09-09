import type { SVGProps } from "react";

export function EdgeMagicLogo({
  size = 24,
  className,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="EdgeMagic logo"
      {...props}
    >
      <rect width="256" height="256" rx="48" fill="white" />
      <rect x="136" y="20" width="63" height="215" rx="20" fill="black" />
      <rect x="57" y="65" width="63" height="126" rx="20" fill="black" />
    </svg>
  );
}
