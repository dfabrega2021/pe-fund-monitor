import { DashboardNav } from "@/components/dashboard/DashboardNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DashboardNav />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </>
  );
}
