import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  AlertCircle,
  Calendar,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Laptop,
  Loader2,
  Lock,
  Sparkles,
  User,
} from "lucide-react";
import { openExternalUrl } from "../../utils/externalLink";

type LicenseInfo = {
  id: string;
  holder: string;
  plan: string;
  expiresAt: string | null;
  seats: number;
};

type LicenseState = {
  license: LicenseInfo;
  expired: boolean;
  expiresInDays: number | null;
};

const RENEWAL_NOTICE_DAYS = 14;

export function LicenseSection({ onActivated }: { onActivated: () => void }) {
  const [state, setState] = useState<LicenseState | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    void invoke<LicenseState | null>("get_license").then(setState).catch(() => setState(null));
  }, []);

  async function activate() {
    if (!key.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const activated = await invoke<LicenseInfo>("activate_license", { key: key.trim() });
      setState({ license: activated, expired: false, expiresInDays: null });
      setKey("");
      onActivated();
    } catch (activationError) {
      setError(typeof activationError === "string" ? activationError : "Activation failed. Please check your key.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    setBusy(true);
    try {
      await invoke("deactivate_license");
      setState(null);
      onActivated();
    } finally {
      setBusy(false);
    }
  }

  function handleCopy(text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /* -------------------------------------------------------------------------- */
  /* PRO ACTIVE STATE                                                           */
  /* -------------------------------------------------------------------------- */
  if (state && !state.expired) {
    const { license, expiresInDays } = state;
    const renewing = expiresInDays !== null && expiresInDays <= RENEWAL_NOTICE_DAYS;

    return (
      <div className="space-y-6">
        {/* Pro Header Card */}
        <div className="relative overflow-hidden rounded-2xl border border-forest-800 bg-forest-950/80 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-xl border border-pro-200/30 bg-pro-surface text-pro-100 shadow-2xs">
                <Sparkles size={16} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-mist-100">Uncached Pro</h3>
                <p className="text-xs text-mist-500">All advanced workspace features unlocked</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sage-400/40 bg-sage-400/15 px-3 py-1 font-mono text-[10px] font-bold tracking-wider text-sage-300 uppercase">
              <Check size={11} strokeWidth={3} /> Active
            </span>
          </div>

          {renewing && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-confidence-medium/40 bg-confidence-medium-surface p-3 text-xs leading-5 text-confidence-medium">
              <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <span className="font-semibold">Licence renews in {expiresInDays === 1 ? "1 day" : `${expiresInDays} days`}.</span>{" "}
                Your receipt and updated key will arrive by email.
              </div>
            </div>
          )}

          {/* Key Details Grid */}
          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border border-forest-800 bg-forest-900/60 p-3">
              <User size={15} className="shrink-0 text-mist-500" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-mist-500">Licensed to</p>
                <p className="truncate text-xs font-semibold text-mist-100">{license.holder}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-forest-800 bg-forest-900/60 p-3">
              <Laptop size={15} className="shrink-0 text-mist-500" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-mist-500">Authorized seats</p>
                <p className="text-xs font-semibold text-mist-100">
                  {license.seats === 1 ? "1 machine" : `${license.seats} machines`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-forest-800 bg-forest-900/60 p-3">
              <Calendar size={15} className="shrink-0 text-mist-500" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-mist-500">Expiration</p>
                <p className="text-xs font-semibold text-mist-100">
                  {license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : "Lifetime / Perpetual"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-forest-800 bg-forest-900/60 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <KeyRound size={15} className="shrink-0 text-mist-500" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-mist-500">Licence Key</p>
                  <p className="truncate font-mono text-xs font-semibold text-mist-100">{license.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(license.id)}
                title="Copy Licence Key"
                className="grid size-7 shrink-0 place-items-center rounded-lg text-mist-500 transition-colors hover:bg-forest-800 hover:text-mist-100 cursor-pointer"
              >
                {copied ? <Check size={13} className="text-sage-300" /> : <Copy size={13} />}
              </button>
            </div>
          </div>
        </div>

        {/* Transfer / Deactivate */}
        <div className="flex items-center justify-between border-t border-forest-800 pt-4">
          <p className="text-xs text-mist-500">
            Need to move this licence to another device?
          </p>
          <button
            type="button"
            onClick={deactivate}
            disabled={busy}
            className="rounded-xl border border-forest-800 bg-forest-850 px-3.5 py-2 text-xs font-medium text-mist-400 transition-colors hover:border-coral-300/40 hover:bg-coral-300/10 hover:text-coral-300 disabled:opacity-50 cursor-pointer"
          >
            {busy ? "Deactivating..." : "Deactivate this machine"}
          </button>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* FREE / UNLICENSED STATE                                                    */
  /* -------------------------------------------------------------------------- */
  const lapsed = state?.expired ? state : null;

  return (
    <div className="space-y-6">
      {/* Free Plan / Upgrade Banner */}
      <div className="rounded-2xl border border-forest-800 bg-forest-950/60 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Lock size={15} className="text-mist-500" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-mist-100">Uncached Free</h3>
          </div>
          <span className="rounded-md border border-forest-800 bg-forest-900 px-2 py-0.5 font-mono text-[10px] font-medium text-mist-400">
            CURRENT PLAN
          </span>
        </div>

        {lapsed ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-coral-300/30 bg-coral-300/10 p-3 text-xs leading-5 text-coral-300">
            <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <span className="font-semibold">Licence expired on {new Date(lapsed.license.expiresAt ?? "").toLocaleDateString()}.</span>{" "}
              Paste your renewed licence key below to reactivate Pro.
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs leading-5 text-mist-400">
            Free cleans all supported ecosystem artifacts without limits. Upgrading to Pro unlocks automated background maintenance, interactive 2D workspace graph, duplicate package insights, and historical growth metrics.
          </p>
        )}

        {/* Feature Highlights Grid */}
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-xl border border-forest-800/80 bg-forest-900/40 px-3 py-2 text-xs text-mist-200">
            <span className="text-sage-300 font-bold">✓</span>
            <span>Interactive 2D Workspace Canvas</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-forest-800/80 bg-forest-900/40 px-3 py-2 text-xs text-mist-200">
            <span className="text-sage-300 font-bold">✓</span>
            <span>Automated Background Cleanups</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-forest-800/80 bg-forest-900/40 px-3 py-2 text-xs text-mist-200">
            <span className="text-sage-300 font-bold">✓</span>
            <span>Cross-Project Duplicate Detection</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-forest-800/80 bg-forest-900/40 px-3 py-2 text-xs text-mist-200">
            <span className="text-sage-300 font-bold">✓</span>
            <span>Historical Disk Delta Analytics</span>
          </div>
        </div>
      </div>

      {/* Activation Form */}
      <div className="space-y-3">
        <label className="block text-xs font-medium text-mist-200">
          <span>Enter Licence Key</span>
          <div className="relative mt-2">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-mist-500">
              <KeyRound size={14} aria-hidden="true" />
            </div>
            <input
              value={key}
              onChange={(event) => {
                setKey(event.currentTarget.value);
                if (error) setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void activate();
              }}
              placeholder="e.g. UNCACHED-PRO-XXXX-XXXX-XXXX"
              spellCheck={false}
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-forest-800 bg-forest-950 pl-10 pr-3.5 font-mono text-xs text-mist-100 shadow-2xs outline-none transition-all placeholder:text-mist-500/50 focus:border-sage-400 focus:ring-1 focus:ring-sage-400/40"
            />
          </div>
        </label>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-coral-300/30 bg-coral-300/10 px-3.5 py-2.5 text-xs text-coral-300 select-text">
            <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={activate}
            disabled={busy || key.trim().length === 0}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sage-400 px-5 text-xs font-bold text-forest-950 shadow-sm transition-all hover:bg-sage-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin text-forest-950" aria-hidden="true" />
            ) : (
              <Sparkles size={14} aria-hidden="true" />
            )}
            <span>{busy ? "Validating..." : "Activate Pro"}</span>
          </button>

          <button
            type="button"
            onClick={() => openExternalUrl("https://uncached.app/pro")}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-forest-800 bg-forest-850 px-4 text-xs font-medium text-mist-200 shadow-2xs transition-colors hover:border-forest-750 hover:bg-forest-800 hover:text-mist-100 cursor-pointer"
          >
            <span>Get a Licence</span>
            <ExternalLink size={12} className="text-mist-500" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
