import { db } from "../db";
import { aiSummaries } from "../db/schema";
import {
  getFundById,
  getFundKpis,
  getFundTrendData,
  getFundPortfolioCompanies,
  getFundGpCommentary,
  getLatestReportId,
  type TrendPoint,
  type PortfolioCompanyRow,
  type GpCommentaryData,
  type FundKpi,
} from "../db/queries";
import { generateNarrative } from "./providers/ollama";
import { formatCurrency, formatMultiple, formatPercent } from "../format";

// Turns already-extracted, already-structured fund data into a short
// analytical narrative - what's happening with this fund and why, not just
// another table of numbers. This directly answers the brief's core ask
// ("entender que esta pasando... no solo la foto puntual de cada periodo").
//
// Deliberately a *text-only* call to the local model - no page images, no
// JSON-schema-constrained output. The inputs are numbers and GP commentary
// already pulled out of the documents by extractReport(), so the prompt here
// is tiny (a few hundred tokens at most, regardless of how long the source
// PDFs were) and a free-text narrative is what's actually useful, not another
// structured shape. Same local Ollama instance as extraction - nothing about
// this leaves the machine either.

export type FundSummaryResult = { text: string; model: string };

export async function generateFundSummary(fundId: string): Promise<FundSummaryResult | null> {
  const fund = await getFundById(fundId);
  if (!fund) return null;

  const [kpisData, trend, portfolio, commentary] = await Promise.all([
    getFundKpis(fundId),
    getFundTrendData(fundId),
    getFundPortfolioCompanies(fundId),
    getFundGpCommentary(fundId),
  ]);

  if (trend.length === 0) {
    return null; // nothing reported yet for this fund - nothing to summarize
  }

  const prompt = buildPrompt(fund, kpisData.kpis, trend, portfolio.companies, commentary);
  const { text, model } = await generateNarrative(prompt);

  const reportId = await getLatestReportId(fundId);
  if (reportId) {
    await db.insert(aiSummaries).values({
      reportId,
      generatedText: text,
      modelUsed: model,
    });
  }

  return { text, model };
}

function buildPrompt(
  fund: { name: string; strategy: string; vintageYear: number; commitmentAmount: string; currency: string },
  kpis: FundKpi[],
  trend: TrendPoint[],
  companies: PortfolioCompanyRow[],
  commentary: GpCommentaryData | null
): string {
  const trendLines = trend
    .map(
      (t) =>
        `${t.period}: NAV (net, main) ${formatCurrency(t.netNav)}, TVPI (net, main) ${formatMultiple(t.netTvpi)}`
    )
    .join("\n");

  const kpiLines = kpis
    .map(
      (k) =>
        `${k.label}: NAV ${formatCurrency(k.nav)}, TVPI ${formatMultiple(k.tvpi)}, DPI ${formatMultiple(
          k.dpi
        )}, RVPI ${formatMultiple(k.rvpi)}, IRR ${formatPercent(k.irr)}, QoQ NAV change ${
          k.qoqNavChangePct != null ? `${k.qoqNavChangePct.toFixed(1)}%` : "n/a"
        }`
    )
    .join("\n");

  const companyLines = companies
    .slice(0, 8) // largest holdings by NAV contribution - keeps the prompt small on funds with many positions
    .map(
      (c) =>
        `- ${c.companyName} (${c.sector ?? "sector n/a"}, ${c.status}): valuation ${formatCurrency(
          c.valuation
        )}, QoQ change ${c.qoqChangePct != null ? `${c.qoqChangePct.toFixed(1)}%` : "n/a"}, MOIC ${
          c.grossMoic != null ? formatMultiple(c.grossMoic) : "at cost"
        }`
    )
    .join("\n");

  const notableChanges = commentary?.gpStatedNotableChanges?.length
    ? commentary.gpStatedNotableChanges.map((c) => `- ${c}`).join("\n")
    : "None stated by the GP this period.";

  return `You are a portfolio analyst writing a short internal note for a family office CIO about one private
equity fund position. Base your note only on the data below - do not invent figures or events not present here.

FUND: ${fund.name} (${fund.strategy}, vintage ${fund.vintageYear}, committed ${formatCurrency(
    Number(fund.commitmentAmount),
    fund.currency
  )})

PERFORMANCE TREND BY QUARTER:
${trendLines}

LATEST QUARTER KPIs BY VEHICLE/BASIS:
${kpiLines}

LARGEST PORTFOLIO COMPANY POSITIONS (latest quarter):
${companyLines || "No portfolio company data available yet."}

GP-STATED NOTABLE CHANGES THIS PERIOD:
${notableChanges}

Write a concise investment summary (150-250 words, plain prose, no headers or bullet points) covering: how the
fund has performed quarter over quarter, what appears to be driving that trend (tie it to specific portfolio
companies or GP-stated changes where the data supports it), and anything that stands out or would warrant a
closer look at the next investment committee review. Professional tone, in English.`;
}
