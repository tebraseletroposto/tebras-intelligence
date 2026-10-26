import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "block w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-ink placeholder:text-zinc-400 shadow-xs focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-zinc-100 disabled:text-zinc-500 aria-[invalid=true]:border-red-500";

type FieldProps = { label: string; name: string; error?: string; hint?: ReactNode; required?: boolean; className?: string; id?: string };

/** ID único por campo (evita colisões quando há vários formulários na mesma página). */
function useFieldId(name: string, id?: string) {
  const auto = useId();
  return id ?? `${name.replace(/\W/g, "")}-${auto.replace(/:/g, "")}`;
}

export function Field({ label, id, error, hint, required, className, children }: Omit<FieldProps, "name"> & { id: string; children: ReactNode }) {
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-zinc-800">
        {label}
        {required && <span className="ml-0.5 text-brand" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-zinc-500">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-xs font-medium text-red-600" role="alert">{error}</p>}
    </div>
  );
}

export function TextInput({ label, name, error, hint, required, className, id, ...props }: FieldProps & Omit<ComponentProps<"input">, "name" | "id">) {
  const fid = useFieldId(name, id);
  return (
    <Field label={label} id={fid} error={error} hint={hint} required={required} className={className}>
      <input id={fid} name={name} required={required} aria-invalid={!!error} aria-describedby={error ? `${fid}-error` : undefined} className={cn(control, "h-10")} {...props} />
    </Field>
  );
}

export function TextArea({ label, name, error, hint, required, className, id, ...props }: FieldProps & Omit<ComponentProps<"textarea">, "name" | "id">) {
  const fid = useFieldId(name, id);
  return (
    <Field label={label} id={fid} error={error} hint={hint} required={required} className={className}>
      <textarea id={fid} aria-describedby={error ? `${fid}-error` : undefined} name={name} required={required} aria-invalid={!!error} rows={3} className={cn(control, "py-2")} {...props} />
    </Field>
  );
}

export function SelectInput({ label, name, error, hint, required, className, options, placeholder, id, ...props }: FieldProps & Omit<ComponentProps<"select">, "name" | "id"> & { options: Record<string, string> | [string, string][]; placeholder?: string }) {
  const entries = Array.isArray(options) ? options : Object.entries(options);
  const fid = useFieldId(name, id);
  return (
    <Field label={label} id={fid} error={error} hint={hint} required={required} className={className}>
      <select id={fid} aria-describedby={error ? `${fid}-error` : undefined} name={name} required={required} aria-invalid={!!error} className={cn(control, "h-10 pr-8")} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {entries.map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
      </select>
    </Field>
  );
}

export function Checkbox({ label, name, value = "on", defaultChecked, hint, disabled }: { label: string; name: string; value?: string; defaultChecked?: boolean; hint?: string; disabled?: boolean }) {
  const id = useFieldId(`${name}-${value}`);
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-sm text-zinc-800">
      <input id={id} type="checkbox" name={name} value={value} defaultChecked={defaultChecked} disabled={disabled} className="mt-0.5 size-4 rounded border-zinc-300 accent-brand" />
      <span>{label}{hint && <span className="block text-xs text-zinc-500">{hint}</span>}</span>
    </label>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-zinc-200 bg-white p-5">
      <legend className="sr-only">{title}</legend>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}
