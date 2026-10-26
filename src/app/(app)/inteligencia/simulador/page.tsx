import Link from "next/link";
import { Alert } from "@/components/ui/misc";
import { DEFAULT_SCENARIO_ASSUMPTIONS, type DemandAssumptions } from "@/lib/intel/demand";
import { CHARGER_CATEGORIES, DEFAULT_SITE } from "@/lib/intel/infrastructure";
import type { StudyChargers, StudyFinance, StudySite } from "@/lib/intel/study-schema";
import { requirePagePermission } from "@/server/auth/dal";
import { getStudy } from "@/server/intel/studies";
import { ConfigComparator } from "./comparator";

export const metadata = { title: "Simulador de infraestrutura" };

export default async function SimulatorPage({ searchParams }: { searchParams: Promise<{ estudo?: string }> }) {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const { estudo } = await searchParams;
  let initial = { assumptions: { ...DEFAULT_SCENARIO_ASSUMPTIONS.base, bevFleet: null, phevFleet: null, competitors: null, externalDailyKwh: null } as DemandAssumptions, site: { ...DEFAULT_SITE }, costs: {} as Record<string, { unit: number | null; install: number | null }>, energyCost: null as number | null, fixedMonthly: null as number | null, pctCosts: 0 };
  let source = "premissas genéricas (sem estudo selecionado)";
  let error: string | null = null;
  if (estudo) {
    try {
      const s = await getStudy(ctx, estudo);
      const fin = s.study.finance as StudyFinance;
      const fixedKnown = fin.fixedCosts.every((c) => c.monthly !== null);
      initial = {
        assumptions: s.scenarios[s.selected].assumptions, site: s.study.site as StudySite,
        costs: Object.fromEntries(CHARGER_CATEGORIES.map((c) => { const l = (s.study.chargers as StudyChargers).find((x) => x.powerKw === c.powerKw && x.current === c.current); return [c.key, { unit: l?.unitCost ?? null, install: l?.installCost ?? null }]; })),
        energyCost: fin.energyCostPerKwh || null, fixedMonthly: fixedKnown ? fin.fixedCosts.reduce((a, c) => a + (c.monthly ?? 0), 0) + fin.demandChargeMonthly : null,
        pctCosts: fin.revenueTaxRate + fin.paymentFeeRate + fin.platformFeeRate + fin.partnerCommissionRate,
      };
      source = `estudo “${s.study.name}” (${s.property.name}), cenário ${s.selected}`;
    } catch { error = "Estudo não encontrado ou sem acesso."; }
  }
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Simulador de infraestrutura — comparador de configurações</h1>
        <p className="text-sm text-zinc-600">Compare combinações de carregadores (7, 22 kW AC; 30, 60, 80, 120 kW DC). Categorias de simulação, não confirmação de equipamento disponível ou compatível. O dimensionamento detalhado de cada terreno fica no <Link href="/inteligencia/analise" className="text-brand">estudo</Link>.</p></div>
      {error && <Alert kind="error">{error}</Alert>}
      <ConfigComparator initial={initial} source={source} />
    </div>
  );
}
