/** Estado retornado pelas Server Actions para os formulários (useActionState). */
export type ActionState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Valores enviados, para repopular o formulário após erro. */
  values?: Record<string, unknown>;
  /** Dados extras (ex.: link de redefinição gerado) */
  data?: Record<string, string>;
  /** Carimbo da resposta: usado como `key` do formulário para remontá-lo com os valores enviados. */
  ts?: number;
};
export const initialActionState: ActionState = {};
