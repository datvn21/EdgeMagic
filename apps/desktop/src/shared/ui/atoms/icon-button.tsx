import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button } from "./button.js";

export function IconButton({ label, children, ...buttonProps }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return <Button {...buttonProps} className={["icon-button", buttonProps.className].filter(Boolean).join(" ")} aria-label={label}>{children}</Button>;
}
