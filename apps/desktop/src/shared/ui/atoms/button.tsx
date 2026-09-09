import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({ variant = "secondary", size = "md", children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md"; children: ReactNode }) {
  return <button {...props} type={props.type ?? "button"} className={["ui-button", `ui-button-${variant}`, `ui-button-${size}`, className].filter(Boolean).join(" ")}>{children}</button>;
}
