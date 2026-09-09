import type { InputHTMLAttributes } from "react";

export function Checkbox({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return <label className={["ui-checkbox", className].filter(Boolean).join(" ")}><input {...props} type="checkbox" /><span className="ui-checkbox-track" aria-hidden="true"><span className="ui-checkbox-thumb" /></span>{label ? <span className="ui-checkbox-label">{label}</span> : null}</label>;
}
