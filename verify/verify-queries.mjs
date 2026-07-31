import postgres from "postgres";
const sql = postgres("postgresql://postgres:postgres@127.0.0.1:55432/postgres");

const counts = await sql`
  select
    (select count(*) from funds) as funds,
    (select count(*) from fund_vehicles) as vehicles,
    (select count(*) from reporting_packages) as packages,
    (select count(*) from fund_reports) as reports,
    (select count(*) from fund_metrics) as metrics,
    (select count(*) from portfolio_companies) as companies,
    (select count(*) from portfolio_company_valuations) as valuations,
    (select count(*) from portfolio_company_developments) as developments,
    (select count(*) from gp_commentary) as commentary,
    (select count(*) from validation_flags) as flags
`;
console.log("row counts:", counts[0]);

// Generic multi-vehicle smoke check - whichever fund has more than one vehicle
// (main + co-invest), rather than hardcoding a fund name. Keeps this script
// working regardless of what seed-data.ts's fund is currently named, and
// keeps no real/confidential fund name in source (see README "Sample data note").
const multiVehicle = await sql`
  select f.name, fv.vehicle_name, fv.vehicle_type, fm.report_year, fm.report_quarter, fm.return_basis, fm.irr, fm.tvpi
  from fund_metrics fm
  join funds f on f.id = fm.fund_id
  join fund_vehicles fv on fv.id = fm.vehicle_id
  where f.id in (select fund_id from fund_vehicles group by fund_id having count(*) > 1)
  order by f.name, fm.report_year, fm.report_quarter, fv.vehicle_type, fm.return_basis
`;
console.log("multi-vehicle rows:", multiVehicle.length);
console.table(multiVehicle);

const flags = await sql`select field_name, severity, message from validation_flags`;
console.log("validation flags:", flags.length);
console.table(flags.map(f => ({ field: f.field_name, severity: f.severity })));

const concentration = await sql`
  select sector, count(*) as fund_count, sum(commitment_amount::numeric) as total_committed
  from funds group by sector order by total_committed desc
`;
console.log("sector concentration:");
console.table(concentration);

await sql.end();
