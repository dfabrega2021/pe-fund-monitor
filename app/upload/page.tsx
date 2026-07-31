"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// AI extraction calls Ollama on whatever machine is running `ollama serve` -
// on your own laptop, that's local and NDA-safe. On a hosted deployment (e.g.
// Vercel, for the public demo link), there is no reachable Ollama instance,
// so this page would otherwise just fail confusingly on submit. Set
// NEXT_PUBLIC_EXTRACTION_AVAILABLE=false in that deployment's env vars to
// show an explanation instead of a broken form. Defaults to available so
// local dev is unaffected.
const EXTRACTION_AVAILABLE = process.env.NEXT_PUBLIC_EXTRACTION_AVAILABLE !== "false";

type Fund = { id: string; name: string; strategy: string };
type FileResult = {
  filename: string;
  reportId: string;
  document_type: string | null;
  status: string;
  error?: string;
};

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

const NEW_FUND_VALUE = "__new__";

export default function UploadPage() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [fundId, setFundId] = useState("");
  const [year, setYear] = useState(currentYear);
  const [quarter, setQuarter] = useState(1);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<FileResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    index: number;
    total: number;
    filename: string;
    elapsedSec: number;
  } | null>(null);

  // New-fund inline form state
  const [showNewFund, setShowNewFund] = useState(false);
  const [creatingFund, setCreatingFund] = useState(false);
  const [newFund, setNewFund] = useState({
    name: "",
    gpName: "",
    strategy: "",
    assetClass: "private_equity",
    vintageYear: currentYear,
    commitmentAmount: "",
    sector: "",
    geographyFocus: "",
  });

  function loadFunds(selectId?: string) {
    return fetch("/api/funds")
      .then((r) => r.json())
      .then((data: Fund[]) => {
        setFunds(data);
        if (selectId) setFundId(selectId);
        else if (data[0] && !fundId) setFundId(data[0].id);
      });
  }

  useEffect(() => {
    loadFunds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFundSelect(value: string) {
    if (value === NEW_FUND_VALUE) {
      setShowNewFund(true);
    } else {
      setFundId(value);
    }
  }

  async function handleCreateFund(e: React.FormEvent) {
    e.preventDefault();
    setCreatingFund(true);
    setError(null);
    try {
      const res = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newFund),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create fund");
      await loadFunds(data.id);
      setShowNewFund(false);
      setNewFund({
        name: "",
        gpName: "",
        strategy: "",
        assetClass: "private_equity",
        vintageYear: currentYear,
        commitmentAmount: "",
        sector: "",
        geographyFocus: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingFund(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fundId || files.length === 0) return;
    setSubmitting(true);
    setResults([]);
    setError(null);
    setProgress({ index: 0, total: files.length, filename: files[0].name, elapsedSec: 0 });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress({ index: i, total: files.length, filename: file.name, elapsedSec: 0 });

      const timer = setInterval(() => {
        setProgress((prev) => (prev ? { ...prev, elapsedSec: prev.elapsedSec + 1 } : prev));
      }, 1000);

      const formData = new FormData();
      formData.append("fundId", fundId);
      formData.append("reportYear", String(year));
      formData.append("reportQuarter", String(quarter));
      formData.append("files", file);

      try {
        const res = await fetch("/api/reports/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        setResults((prev) => [...(prev ?? []), ...data.results]);
      } catch (err) {
        setResults((prev) => [
          ...(prev ?? []),
          {
            filename: file.name,
            reportId: "unknown",
            document_type: null,
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          },
        ]);
      } finally {
        clearInterval(timer);
      }
    }

    setProgress(null);
    setSubmitting(false);
  }

  if (!EXTRACTION_AVAILABLE) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="mb-1 text-xl font-semibold text-navy">Upload Quarterly Reports</h1>
        <div className="mt-6 rounded-lg border border-hairline bg-surface p-6 text-sm text-navy">
          <p className="mb-2 font-medium text-navy">Extraction is disabled on this hosted demo.</p>
          <p>
            AI extraction runs on a local, open-source vision model (Ollama) on the machine processing the
            documents - nothing about a real document ever leaves that machine, which is what makes it safe to
            use under NDA. A hosted server like this one has no access to that local model, so upload is
            disabled here rather than shown as a broken form. The dashboard below reflects data from documents
            already processed locally.
          </p>
          <Link href="/" className="mt-4 inline-block text-navy underline">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-1 text-xl font-semibold text-navy">Upload Quarterly Reports</h1>
      <p className="mb-6 text-sm text-muted">
        Upload one or more report PDFs for a fund + quarter. Each file is extracted and its data
        goes straight to the dashboard.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-hairline bg-card p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-navy">Fund</label>
          <select
            value={fundId}
            onChange={(e) => handleFundSelect(e.target.value)}
            className="w-full rounded-md border border-hairline px-3 py-2 text-sm"
          >
            {funds.length === 0 && <option value="">No funds yet - add one below</option>}
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.strategy})
              </option>
            ))}
            <option value={NEW_FUND_VALUE}>+ Add new fund...</option>
          </select>
        </div>

        {showNewFund && (
          <div className="space-y-3 rounded-md border border-hairline bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-navy">New fund</span>
              <button
                type="button"
                onClick={() => setShowNewFund(false)}
                className="text-xs text-muted hover:text-navy"
              >
                Cancel
              </button>
            </div>

            <input
              type="text"
              placeholder="Fund name (e.g. Harborview Energy Partners V)"
              value={newFund.name}
              onChange={(e) => setNewFund({ ...newFund, name: e.target.value })}
              className="w-full rounded-md border border-hairline px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="GP name (e.g. Harborview Capital Management)"
              value={newFund.gpName}
              onChange={(e) => setNewFund({ ...newFund, gpName: e.target.value })}
              className="w-full rounded-md border border-hairline px-3 py-2 text-sm"
            />
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Strategy (e.g. energy, buyout, credit)"
                value={newFund.strategy}
                onChange={(e) => setNewFund({ ...newFund, strategy: e.target.value })}
                className="w-full rounded-md border border-hairline px-3 py-2 text-sm"
              />
              <select
                value={newFund.assetClass}
                onChange={(e) => setNewFund({ ...newFund, assetClass: e.target.value })}
                className="w-full rounded-md border border-hairline px-3 py-2 text-sm"
              >
                <option value="private_equity">Private Equity</option>
                <option value="private_credit">Private Credit</option>
                <option value="real_assets">Real Assets</option>
              </select>
            </div>
            <div className="flex gap-3">
              <input
                type="number"
                placeholder="Vintage year"
                value={newFund.vintageYear}
                onChange={(e) => setNewFund({ ...newFund, vintageYear: Number(e.target.value) })}
                className="w-32 rounded-md border border-hairline px-3 py-2 text-sm"
              />
            </div>
            <input
              type="text"
              placeholder="Commitment amount (e.g. 250000000)"
              value={newFund.commitmentAmount}
              onChange={(e) => setNewFund({ ...newFund, commitmentAmount: e.target.value })}
              className="w-full rounded-md border border-hairline px-3 py-2 text-sm"
            />
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Sector (optional)"
                value={newFund.sector}
                onChange={(e) => setNewFund({ ...newFund, sector: e.target.value })}
                className="w-full rounded-md border border-hairline px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Geography (optional)"
                value={newFund.geographyFocus}
                onChange={(e) => setNewFund({ ...newFund, geographyFocus: e.target.value })}
                className="w-full rounded-md border border-hairline px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleCreateFund}
              disabled={creatingFund || !newFund.name || !newFund.gpName || !newFund.strategy || !newFund.commitmentAmount}
              className="w-full rounded-md bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-navy2 disabled:opacity-50"
            >
              {creatingFund ? "Creating..." : "Create fund"}
            </button>
          </div>
        )}

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-navy">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full rounded-md border border-hairline px-3 py-2 text-sm"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-navy">Quarter</label>
            <select
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
              className="w-full rounded-md border border-hairline px-3 py-2 text-sm"
            >
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  Q{q}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-navy">PDF files (batch)</label>
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            className="w-full rounded-md border border-hairline px-3 py-2 text-sm"
          />
          {files.length > 0 && (
            <ul className="mt-2 text-xs text-muted">
              {files.map((f) => (
                <li key={f.name}>{f.name}</li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || !fundId || files.length === 0}
          className="w-full rounded-md bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-navy2 disabled:opacity-50"
        >
          {submitting ? "Processing..." : "Upload & Process"}
        </button>
      </form>

      {progress && (
        <div className="mt-4 rounded-md border border-hairline bg-surface px-4 py-3 text-sm text-navy">
          <p>
            Processing file {progress.index + 1} of {progress.total}:{" "}
            <span className="font-medium">{progress.filename}</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            {progress.elapsedSec}s elapsed - local extraction can take a couple minutes per file, this is normal.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-negative bg-negative-light p-4 text-sm text-negative">
          {error}
        </div>
      )}

      {results && (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-medium text-navy">Results</h2>
          {results.map((r) => (
            <div
              key={r.filename}
              className={`rounded-md border p-3 text-sm ${
                r.status === "error" ? "border-negative bg-negative-light" : "border-hairline bg-card"
              }`}
            >
              <div className="font-medium text-navy">{r.filename}</div>
              <div className="text-muted">
                status: <span className="font-mono">{r.status}</span>
              </div>
              {r.error && <div className="mt-1 text-negative">{r.error}</div>}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
