"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { formDataToObject } from "@/lib/validation/common";
import { runAction } from "@/server/actions";
import { requireUser } from "@/server/auth/dal";
import { importIbgeState, importOcmStations, importOsmStations, runSourceTest, saveStation } from "@/server/intel/sources";
import { activateIndexVersion, removeMembership, saveIndexConfig, saveOrganization, setMembership } from "@/server/intel/orgs";
import { deleteProperty, saveProperty } from "@/server/intel/properties";
import { ORG_COOKIE, loadScope } from "@/server/intel/scope";
import { addRevenue, createStudy, removeRevenue, shareStudy, snapshotForecast, updateStudyMeta, updateStudySection, type StudySection } from "@/server/intel/studies";

export async function selectOrgAction(fd: FormData) {
  const ctx = await requireUser();
  const org = String(fd.get("org") ?? "");
  const scope = await loadScope(ctx, org);
  // Somente organizações do escopo do usuário são aceitas
  if (scope.currentOrgId === org) (await cookies()).set(ORG_COOKIE, org, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90 });
  revalidatePath("/inteligencia", "layout");
}

export async function savePropertyAction(id: string | null, _p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const values = formDataToObject(fd);
  let newId: string | undefined;
  const res = await runAction(async () => { newId = (await saveProperty(ctx, id, values)).id; return { ok: true, message: "Imóvel salvo." }; }, values);
  if (res.ok && newId) redirect(`/inteligencia/imoveis/${newId}?feito=salvo`);
  return res;
}

export async function deletePropertyAction(id: string) {
  const ctx = await requireUser();
  await deleteProperty(ctx, id);
  redirect("/inteligencia/imoveis?feito=excluido");
}

export async function createStudyAction(propertyId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const values = formDataToObject(fd);
  let id: string | undefined;
  const res = await runAction(async () => { id = (await createStudy(ctx, propertyId, values)).id; }, values);
  if (res.ok && id) redirect(`/inteligencia/estudos/${id}`);
  return res;
}

export async function saveStudySectionAction(id: string, section: StudySection, _p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const raw = String(fd.get("json") ?? "null");
  const res = await runAction(async () => {
    let data: unknown;
    try { data = JSON.parse(raw); } catch { return { ok: false, message: "Dados inválidos." }; }
    await updateStudySection(ctx, id, section, data);
    return { ok: true, message: "Seção salva e resultados recalculados." };
  });
  revalidatePath(`/inteligencia/estudos/${id}`);
  return res;
}

export async function saveStudyMetaAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const values = formDataToObject(fd);
  const res = await runAction(async () => { await updateStudyMeta(ctx, id, values); return { ok: true, message: "Estudo atualizado." }; }, values);
  revalidatePath(`/inteligencia/estudos/${id}`);
  return res;
}

export async function addRevenueAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const values = formDataToObject(fd);
  const res = await runAction(async () => { await addRevenue(ctx, id, values); return { ok: true, message: "Receita adicionada." }; }, values);
  revalidatePath(`/inteligencia/estudos/${id}`);
  return res;
}

export async function removeRevenueAction(id: string, revenueId: string) {
  const ctx = await requireUser();
  await removeRevenue(ctx, id, revenueId);
  revalidatePath(`/inteligencia/estudos/${id}`);
}

export async function snapshotAction(id: string) {
  const ctx = await requireUser();
  await snapshotForecast(ctx, id);
  revalidatePath(`/inteligencia/estudos/${id}`);
}

export async function shareStudyAction(id: string, fd: FormData) {
  const ctx = await requireUser();
  await shareStudy(ctx, id, String(fd.get("org")), fd.get("op") !== "remover");
  revalidatePath(`/inteligencia/estudos/${id}`);
}

export async function saveStationAction(id: string | null, _p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const values = formDataToObject(fd);
  let newId: string | undefined;
  const res = await runAction(async () => { newId = (await saveStation(ctx, id, values)).id; return { ok: true, message: "Carregador salvo com histórico da alteração." }; }, values);
  if (res.ok && newId) redirect(`/inteligencia/concorrencia/${newId}?feito=salvo`);
  return res;
}

export async function sourceTestAction(key: string): Promise<ActionState> {
  const ctx = await requireUser();
  const res = await runAction(async () => { const r = await runSourceTest(ctx, key); return { ok: r.ok, message: r.detail }; });
  revalidatePath("/inteligencia/fontes");
  return res;
}

export async function ibgeImportAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const uf = String(fd.get("uf") ?? "");
  const res = await runAction(async () => {
    const r = await importIbgeState(ctx, uf);
    return { ok: true, message: `${r.municipalities} municípios importados; ${r.withPopulation} com população do Censo 2022.${r.populationError ? ` População indisponível: ${r.populationError}` : ""}` };
  });
  revalidatePath("/inteligencia/fontes");
  return res;
}

export async function osmImportAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const values = formDataToObject(fd);
  const res = await runAction(async () => { const r = await importOsmStations(ctx, values); return { ok: true, message: `${r.found} estações encontradas: ${r.inserted} novas, ${r.updated} atualizadas, ${r.skipped} confirmadas preservadas.` }; }, values);
  revalidatePath("/inteligencia/fontes");
  return res;
}

export async function ocmImportAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const values = formDataToObject(fd);
  const res = await runAction(async () => { const r = await importOcmStations(ctx, values); return { ok: true, message: `${r.found} pontos: ${r.inserted} novos, ${r.updated} atualizados.` }; }, values);
  revalidatePath("/inteligencia/fontes");
  return res;
}

export async function saveOrgAction(id: string | null, _p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const values = { ...formDataToObject(fd), regions: fd.getAll("regions") };
  let newId: string | undefined;
  const res = await runAction(async () => { newId = (await saveOrganization(ctx, id, values)).id; return { ok: true, message: "Organização salva." }; }, values);
  if (res.ok && !id && newId) redirect(`/inteligencia/franquias/${newId}`);
  revalidatePath("/inteligencia/franquias");
  return res;
}

export async function memberAction(orgId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const values = formDataToObject(fd);
  const res = await runAction(async () => { await setMembership(ctx, orgId, values); return { ok: true, message: "Vínculo salvo." }; }, values);
  revalidatePath(`/inteligencia/franquias/${orgId}`);
  return res;
}

export async function removeMemberAction(orgId: string, userId: string) {
  const ctx = await requireUser();
  await removeMembership(ctx, orgId, userId);
  revalidatePath(`/inteligencia/franquias/${orgId}`);
}

export async function saveIndexConfigAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const values = formDataToObject(fd);
  const res = await runAction(async () => { await saveIndexConfig(ctx, values); return { ok: true, message: "Nova versão do índice ativada." }; }, values);
  revalidatePath("/inteligencia/configuracoes");
  return res;
}

export async function activateIndexAction(id: string) {
  const ctx = await requireUser();
  await activateIndexVersion(ctx, id);
  revalidatePath("/inteligencia/configuracoes");
}
