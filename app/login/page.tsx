"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/login", {
      method: "POST",
      body: JSON.stringify({ password }),
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      router.push(params.get("redirect") || "/");
      router.refresh();
    } else {
      setError(true);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm rounded-lg border border-hairline bg-card p-8 shadow-sm"
    >
      <h1 className="mb-1 text-lg font-semibold text-navy">Portfolio Monitoring</h1>
      <p className="mb-6 text-sm text-muted">
        Internal prototype - enter the access password.
      </p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mb-3 w-full rounded-md border border-hairline px-3 py-2 text-sm"
        placeholder="Password"
        autoFocus
      />
      {error && <p className="mb-3 text-sm text-negative">Incorrect password.</p>}
      <button
        type="submit"
        className="w-full rounded-md bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-navy2"
      >
        Enter
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
