export const dynamic = "force-dynamic";

import { BookExplorer } from "@/components/dashboard/BookExplorer";
import { getFundOverviewRows } from "@/lib/db/queries";

export default async function FundsPage() {
  const funds = await getFundOverviewRows();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Funds</h1>
        <p className="mt-1 text-sm text-muted">
          Every fund in the book, filterable by asset class or sector. Click a fund for its full
          detail page - KPIs, vehicle comparison, allocation vs. target, trends, portfolio
          companies, and GP commentary history.
        </p>
      </div>

      {funds.length > 0 ? (
        <BookExplorer funds={funds} />
      ) : (
        <p className="rounded-lg border border-hairline bg-card px-4 py-6 text-sm text-muted shadow-sm">
          No funds yet.
        </p>
      )}
    </div>
  );
}
