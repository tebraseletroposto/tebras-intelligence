"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { formDataToObject } from "@/lib/validation/common";
import { runAction } from "@/server/actions";
import { requireUser } from "@/server/auth/dal";
import * as roles from "@/server/services/roles";
import * as settings from "@/server/services/settings";
import * as users from "@/server/services/users";

export async function createUserAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const values = formDataToObject(fd);
  let id: string | undefined;
  const res = await runAction(async () => { id = (await users.createUser(ctx, { ...values, roleIds: values.roleIds ?? [] })).id; }, values);
  if (res.ok && id) redirect(`/admin/usuarios/${id}?criado=1`);
  return res;
}

export async function updateUserAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const values = formDataToObject(fd);
  const res = await runAction(async () => {
    await users.updateUser(ctx, id, { ...values, roleIds: values.roleIds ?? [] });
    return { ok: true, message: "Usuário atualizado." };
  }, values);
  revalidatePath(`/admin/usuarios/${id}`);
  return res;
}

export async function unlockUserAction(id: string) {
  const ctx = await requireUser();
  await users.unlockUser(ctx, id);
  revalidatePath(`/admin/usuarios/${id}`);
}

export async function resetLinkAction(id: string, _p: ActionState): Promise<ActionState> {
  const ctx = await requireUser();
  return runAction(async () => {
    const r = await users.generateResetLink(ctx, id);
    return { ok: true, message: "Link gerado. Ele é exibido somente agora: copie e envie ao usuário por um canal seguro.", data: { url: r.url, expiresAt: r.expiresAt.toISOString() } };
  });
}

export async function createRoleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const values = formDataToObject(fd);
  let id: string | undefined;
  const res = await runAction(async () => { id = (await roles.createRole(ctx, values)).id; }, values);
  if (res.ok && id) redirect(`/admin/perfis/${id}?salvo=1`);
  return res;
}

export async function updateRoleAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const values = formDataToObject(fd);
  const res = await runAction(async () => {
    await roles.updateRole(ctx, id, { ...values, permissions: values.permissions ?? [] });
    return { ok: true, message: "Perfil atualizado. As permissões valem a partir da próxima requisição dos usuários." };
  }, values);
  revalidatePath(`/admin/perfis/${id}`);
  return res;
}

export async function updateCompanyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const values = formDataToObject(fd);
  const res = await runAction(async () => {
    await settings.updateCompanySettings(ctx, values);
    return { ok: true, message: "Dados da empresa salvos." };
  }, values);
  revalidatePath("/admin/empresa");
  return res;
}
