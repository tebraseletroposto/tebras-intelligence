"use server";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/server/actions";
import { requireUser } from "@/server/auth/dal";
import { changeOwnPassword } from "@/server/auth/service";

export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const newPassword = String(fd.get("newPassword") ?? "");
  if (newPassword !== String(fd.get("confirmPassword") ?? "")) return { ok: false, fieldErrors: { confirmPassword: "As senhas não conferem." } };
  const res = await runAction(() => changeOwnPassword(user, String(fd.get("currentPassword") ?? ""), newPassword, { ip: user.ip, userAgent: user.userAgent }));
  if (res.ok) redirect("/?senha=alterada");
  return res;
}
