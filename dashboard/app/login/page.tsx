"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(data.error || "Login failed");
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6 selection:bg-[var(--clr-amber)] selection:text-white">
      {/* Immersive background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] h-[40%] w-[40%] rounded-full bg-[var(--clr-amber)] opacity-[0.03] blur-[120px]" />
        <div className="absolute top-[20%] -right-[5%] h-[35%] w-[35%] rounded-full bg-[var(--clr-purple)] opacity-[0.02] blur-[100px]" />
      </div>

      <div className="relative w-full max-w-[420px]">
        <div className="neu-raised-strong overflow-hidden rounded-[2rem] p-10">
          <header className="mb-10 text-center">
            <div className="neu-control mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl text-[var(--clr-amber)] shadow-lg shadow-[rgba(240,168,92,0.1)]">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--clr-amber)]">Command Center</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">WattWave Access</h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--clr-text-muted)]">Secure your energy grid by entering your master password.</p>
          </header>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--clr-text-dim)]">System Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="neu-pressed w-full rounded-2xl px-5 py-4 text-sm text-white outline-none ring-[var(--clr-amber)] transition-all focus:ring-1 focus:ring-opacity-30 placeholder:text-[var(--clr-text-dim)]"
              />
            </div>

            {error && (
              <div className="flex items-start gap-3 rounded-2xl bg-[var(--clr-red-500)]/5 p-4 border border-[var(--clr-red-500)]/10">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-[var(--clr-red-500)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs font-medium text-[var(--clr-red-500)] leading-normal">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="neu-control group relative w-full overflow-hidden rounded-2xl py-4 text-sm font-bold tracking-wide text-white transition-all active:scale-[0.98]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[var(--clr-amber)] to-[var(--clr-blue)] opacity-0 transition-opacity group-hover:opacity-[0.08]" />
              {loading ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  <span className="opacity-70 uppercase tracking-[0.1em] text-[10px]">Authorizing...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <span className="uppercase tracking-[0.1em] text-[10px]">Initialize Dashboard</span>
                  <svg className="h-4 w-4 opacity-50 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </div>
              )}
            </button>
          </form>

          <footer className="mt-12 text-center">
             <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--clr-text-dim)] opacity-40">
               Wattwave · Node Perimeter v1.0
             </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
