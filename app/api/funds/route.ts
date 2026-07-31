import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { funds, fundVehicles, assetClassEnum } from "@/lib/db/schema";

const VALID_ASSET_CLASSES = assetClassEnum.enumValues;

export async function GET() {
  const rows = await db
    .select({ id: funds.id, name: funds.name, strategy: funds.strategy })
    .from(funds)
    .orderBy(funds.name);
  return NextResponse.json(rows);
}

// Lets the upload flow create a new fund inline instead of being limited to
// whatever was seeded - real usage means funds get added over time, not just
// at seed time.
export async function POST(request: Request) {
  const body = await request.json();
  const { name, gpName, strategy, assetClass, vintageYear, commitmentAmount, sector, geographyFocus, currency } = body;

  if (!name || !gpName || !strategy || !vintageYear || !commitmentAmount) {
    return NextResponse.json(
      { error: "name, gpName, strategy, vintageYear, and commitmentAmount are required." },
      { status: 400 }
    );
  }

  if (assetClass && !VALID_ASSET_CLASSES.includes(assetClass)) {
    return NextResponse.json(
      { error: `assetClass must be one of: ${VALID_ASSET_CLASSES.join(", ")}` },
      { status: 400 }
    );
  }

  const [fund] = await db
    .insert(funds)
    .values({
      name,
      gpName,
      strategy,
      assetClass: assetClass || "private_equity",
      vintageYear: Number(vintageYear),
      commitmentAmount: String(commitmentAmount),
      sector: sector || null,
      geographyFocus: geographyFocus || null,
      currency: currency || "USD",
    })
    .returning();

  // Every fund needs at least one vehicle for fund_metrics to attach to later
  // (see fund_vehicles in architecture.md Section 4) - default to a single
  // "main" vehicle matching the fund itself; multi-vehicle funds (main +
  // co-invest) can add more vehicles later once that UI exists.
  await db.insert(fundVehicles).values({
    fundId: fund.id,
    vehicleName: fund.name,
    vehicleType: "main",
    commitmentAmount: String(commitmentAmount),
  });

  return NextResponse.json({ id: fund.id, name: fund.name, strategy: fund.strategy });
}
