"use client";
import { useRef, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./button";

/**
 * Formulário com confirmação obrigatória (ações críticas).
 * Usa <dialog> nativo para acessibilidade (foco preso e tecla Esc).
 */
export function ConfirmForm({
  action, children, title, message, confirmLabel = "Confirmar", variant = "danger", triggerVariant = "danger", triggerLabel, hidden,
}: {
  action: (fd: FormData) => void | Promise<void>;
  children?: ReactNode;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  variant?: ButtonVariant;
  triggerVariant?: ButtonVariant;
  triggerLabel: ReactNode;
  hidden?: Record<string, string>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button variant={triggerVariant} size="sm" onClick={() => ref.current?.showModal()}>{triggerLabel}</Button>
      <dialog ref={ref} className="m-auto w-[min(92vw,28rem)] rounded-lg p-0 shadow-xl backdrop:bg-black/50">
        <form action={async (fd) => { await action(fd); ref.current?.close(); }} className="space-y-4 p-5">
          {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <div className="text-sm text-zinc-600">{message}</div>
          {children}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => ref.current?.close()}>Cancelar</Button>
            <Button type="submit" variant={variant === "danger" ? "primary" : variant}>{confirmLabel}</Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
