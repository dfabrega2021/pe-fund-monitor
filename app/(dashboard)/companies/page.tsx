export const dynamic = "force-dynamic";

import { CompanyExplorer } from "@/components/dashboard/CompanyExplorer";
import { getAllPortfolioCompanies } from "@/lib/db/queries";

export default async function PortfolioCompanyListPage() {
  const companies = await getAllPortfolioCompanies();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Portfolio Companies</h1>
        <p className="mt-1 text-sm text-muted">
          Every underlying position across every fund in the book, as of each company&apos;s latest reported
          quarter.
        </p>
      </div>
      <CompanyExplorer companies={companies} />
    </div>
  );
}
