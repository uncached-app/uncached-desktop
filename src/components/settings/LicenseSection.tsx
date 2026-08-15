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

export function LicenseSection({
  onActivated,
  proEnabled = false,
}: {
  onActivated: () => void;
  proEnabled?: boolean;
}) {
  const [state, setState] = useState<LicenseState | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    void invoke<LicenseState | null>("get_license").then(setState).catch(() => setState(null));
  }, []);

  const effectiveState: LicenseState | null =
    state ??
    (proEnabled
      ? {
          license: {
            id: "DEV-PRO-LOCAL-BUILD",
            holder: "Developer (Debug Mode)",
            plan: "Pro",
            expiresAt: null,
            seats: 1,
          },
          expired: false,
          expiresInDays: null,
        }
      : null);

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
  if (effectiveState && !effectiveState.expired) {
    const { license, expiresInDays } = effectiveState;
    const renewing = expiresInDays !== null && expiresInDays <= RENEWAL_NOTICE_DAYS;

    return (
      <div className="space-y-5">
        {/* Pro Header Card */}
        <div className="rounded-2xl border border-pro-200/30 bg-pro-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="grid size-8 place-items-center rounded-xl bg-forest-950 text-pro-100 border border-pro-200/20">
                <Sparkles size={15} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-mist-100">Uncached Pro</h3>
                <p className="text-xs text-mist-500">All features active on this machine</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sage-300/40 bg-forest-950 px-2.5 py-1 font-mono text-[10px] font-bold text-sage-300 uppercase">
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
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-2.5 rounded-xl border border-forest-800 bg-forest-950 p-3">
              <User size={14} className="shrink-0 text-mist-500" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-mist-500">Licensed to</p>
                <p className="truncate text-xs font-semibold text-mist-100">{license.holder}</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-forest-800 bg-forest-950 p-3">
              <Laptop size={14} className="shrink-0 text-mist-500" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-mist-500">Authorized seats</p>
                <p className="text-xs font-semibold text-mist-100">
                  {license.seats === 1 ? "1 machine" : `${license.seats} machines`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-forest-800 bg-forest-950 p-3">
              <Calendar size={14} className="shrink-0 text-mist-500" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-mist-500">Expiration</p>
                <p className="text-xs font-semibold text-mist-100">
                  {license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : "Lifetime / Perpetual"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2.5 rounded-xl border border-forest-800 bg-forest-950 p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <KeyRound size={14} className="shrink-0 text-mist-500" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-mist-500">Licence Key</p>
                  <p className="truncate font-mono text-xs font-semibold text-mist-100">{license.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(license.id)}
                title="Copy Licence Key"
                className="grid size-7 shrink-0 place-items-center rounded-lg border border-forest-800 bg-forest-900 text-mist-500 transition-colors hover:bg-forest-850 hover:text-mist-100 cursor-pointer"
              >
                {copied ? <Check size={13} className="text-sage-300" /> : <Copy size={13} />}
              </button>
            </div>
          </div>
        </div>

        {/* Transfer / Deactivate */}
        <div className="flex items-center justify-between border-t border-forest-800 pt-4">
          <p className="text-xs text-mist-500">
            Moving to another machine?
          </p>
          <button
            type="button"
            onClick={deactivate}
            disabled={busy}
            className="rounded-xl border border-forest-800 bg-forest-850 px-3.5 py-2 text-xs font-medium text-mist-300 transition-colors hover:border-coral-300/40 hover:bg-coral-300/10 hover:text-coral-300 disabled:opacity-50 cursor-pointer"
          >
            {busy ? "Deactivating..." : "Remove licence from this machine"}
          </button>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* FREE / UNLICENSED STATE                                                    */
  /* -------------------------------------------------------------------------- */
  const lapsed = effectiveState?.expired ? effectiveState : null;

  return (
    <div className="space-y-5">
      {/* Free Plan / Info Section */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Lock size={15} className="text-mist-500" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-mist-100">Uncached Free</h3>
          </div>
          <span className="rounded-md border border-forest-800 bg-forest-950 px-2 py-0.5 font-mono text-[10px] font-medium text-mist-500">
            CURRENT PLAN
          </span>
        </div>

        {lapsed ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-coral-300/30 bg-coral-surface p-3 text-xs leading-5 text-coral-300">
            <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <span className="font-semibold">Licence expired on {new Date(lapsed.license.expiresAt ?? "").toLocaleDateString()}.</span>{" "}
              Paste your renewed licence key below to reactivate Pro.
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs leading-5 text-mist-500">
            Free cleans all supported ecosystem artifacts without limits. Pro unlocks automated background maintenance, interactive 2D workspace graph, cross-project duplicate detection, and historical disk reclamation tracking.
          </p>
        )}
      </div>

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-2.5 rounded-xl border border-forest-800 bg-forest-950 px-3.5 py-2.5 text-xs text-mist-300">
          <span className="font-bold text-sage-300">✓</span>
          <span>Interactive 2D Workspace Map</span>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-forest-800 bg-forest-950 px-3.5 py-2.5 text-xs text-mist-300">
          <span className="font-bold text-sage-300">✓</span>
          <span>Automated Background Cleanups</span>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-forest-800 bg-forest-950 px-3.5 py-2.5 text-xs text-mist-300">
          <span className="font-bold text-sage-300">✓</span>
          <span>Cross-Project Duplicate Insights</span>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-forest-800 bg-forest-950 px-3.5 py-2.5 text-xs text-mist-300">
          <span className="font-bold text-sage-300">✓</span>
          <span>Lifetime Reclaimed Analytics</span>
        </div>
      </div>

      {/* Activation Form */}
      <div className="border-t border-forest-800 pt-4 space-y-3">
        <label className="block text-xs font-medium text-mist-300">
          <span>Licence key</span>
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
              placeholder="Paste the key from your receipt"
              spellCheck={false}
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-forest-800 bg-forest-950 pl-10 pr-3.5 font-mono text-xs text-mist-100 outline-none transition-colors placeholder:text-mist-500 focus:border-sage-400"
            />
          </div>
        </label>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-coral-300/30 bg-coral-surface px-3.5 py-2.5 text-xs text-coral-300 select-text">
            <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={activate}
            disabled={busy || key.trim().length === 0}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sage-400 px-5 text-xs font-semibold text-forest-950 shadow-xs transition-all hover:bg-sage-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
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
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-forest-800 bg-forest-850 px-4 text-xs font-medium text-mist-300 transition-colors hover:border-forest-750 hover:bg-forest-800 hover:text-mist-100 cursor-pointer"
          >
            <span>Get a licence</span>
            <ExternalLink size={12} className="text-mist-500" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
