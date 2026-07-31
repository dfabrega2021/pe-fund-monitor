export const dynamic = "force-dynamic";

import { AlertsCenter } from "@/components/dashboard/AlertsCenter";
import { getOpenFlagsQueue } from "@/lib/db/queries";

export default async function AlertsCenterPage() {
  const flags = await getOpenFlagsQueue();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Alerts</h1>
        <p className="mt-1 text-sm text-muted">Every open issue across the book, ranked by severity and how long it&rsquo;s been open.</p>
      </div>
      <AlertsCenter flags={flags} />
    </div>
  );
}
