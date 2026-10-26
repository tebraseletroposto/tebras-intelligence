"use client";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, type ButtonVariant } from "./button";

export function SubmitButton({ children, variant = "primary", pendingText = "Salvando…", className, name, value }: { children: React.ReactNode; variant?: ButtonVariant; pendingText?: string; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} aria-busy={pending} className={className} name={name} value={value}>
      {pending ? (<><Loader2 className="size-4 animate-spin" aria-hidden />{pendingText}</>) : children}
    </Button>
  );
}
