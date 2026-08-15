import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Check, LoaderCircle, LockKeyhole, Sparkles } from "lucide-react";
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

  useEffect(() => {
    if (!isTauri()) return;
    void invoke<LicenseState | null>("get_license").then(setState).catch(() => setState(null));
  }, []);

  async function activate() {
    if (!key.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const activated = await invoke<LicenseInfo>("activate_license", { key });
      setState({ license: activated, expired: false, expiresInDays: null });
      setKey("");
      onActivated();
    } catch (activationError) {
      setError(typeof activationError === "string" ? activationError : "Activation failed.");
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

  if (state && !state.expired) {
    const { license, expiresInDays } = state;
    const renewing = expiresInDays !== null && expiresInDays <= RENEWAL_NOTICE_DAYS;

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-sage-300">
            <Check size={16} strokeWidth={2.5} aria-hidden="true" />
            <span className="text-sm text-mist-100 font-bold">Uncached Pro Active</span>
          </div>
          <span className="rounded-md border border-sage-400/40 bg-sage-400/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-sage-300">
            LICENSED
          </span>
        </div>

        {renewing && (
          <p className="rounded-xl border border-confidence-medium/30 bg-confidence-medium-surface px-3 py-2 text-xs leading-5 text-confidence-medium">
            Renews in {expiresInDays === 1 ? "1 day" : `${expiresInDays} days`}. The new key arrives
            by email — paste it here when it does.
          </p>
        )}

        <div className="divide-y divide-forest-800 border-y border-forest-800">
          <Row label="Licensed to" value={license.holder} />
          <Row label="Licence ID" value={license.id} />
          <Row label="Machines" value={license.seats === 1 ? "1 seat" : `${license.seats} seats`} />
          <Row
            label="Expiration"
            value={license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : "Never (Perpetual)"}
          />
        </div>

        <button
          type="button"
          onClick={deactivate}
          disabled={busy}
          className="rounded-xl border border-forest-800 bg-forest-850 px-3.5 py-2 text-xs font-medium text-mist-300 transition-colors hover:border-coral-300/40 hover:bg-coral-300/10 hover:text-coral-300 disabled:opacity-50 cursor-pointer"
        >
          Remove licence from this machine
        </button>
      </div>
    );
  }

  const lapsed = state?.expired ? state : null;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-mist-100">
          <LockKeyhole size={15} className="text-mist-500" aria-hidden="true" />
          <span>Uncached Free Plan</span>
        </div>
        {lapsed ? (
          <p className="mt-2 rounded-xl border border-coral-300/30 bg-forest-950 px-3.5 py-2 text-xs leading-5 text-coral-300">
            The licence for {lapsed.license.holder} expired on{" "}
            {new Date(lapsed.license.expiresAt ?? "").toLocaleDateString()}. If you renewed, paste the new
            key below.
          </p>
        ) : (
          <p className="mt-1 text-xs leading-5 text-mist-500">
            Cleanup is complete on Free, across all supported ecosystems. Pro unlocks the interactive workspace
            canvas, delta tracking since last visit, duplicate package insights, and unattended background maintenance.
          </p>
        )}
      </div>

      <div className="border-t border-forest-800 pt-4">
        <label className="block text-xs font-medium text-mist-300">
          <span>Licence key</span>
          <input
            value={key}
            onChange={(event) => setKey(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void activate();
            }}
            placeholder="Paste your licence key from your receipt"
            spellCheck={false}
            autoComplete="off"
            className="mt-2 h-9 w-full rounded-xl border border-forest-800 bg-forest-950 px-3.5 font-mono text-xs text-mist-100 outline-none transition-colors focus:border-sage-400/60 placeholder:text-mist-500/60 shadow-2xs"
          />
        </label>

        {error && (
          <p role="alert" className="mt-2.5 text-xs leading-5 text-coral-300 select-text">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={activate}
            disabled={busy || key.trim().length === 0}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-sage-400 px-4 text-xs font-semibold text-forest-950 shadow-xs transition-all hover:bg-sage-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            {busy ? (
              <LoaderCircle size={13} className="animate-spin text-forest-950" aria-hidden="true" />
            ) : (
              <Sparkles size={13} aria-hidden="true" />
            )}
            <span>Activate Pro</span>
          </button>
          <button
            type="button"
            onClick={() => openExternalUrl("https://uncached.app/pro")}
            className="text-xs font-medium text-mist-500 transition-colors hover:text-sage-300 cursor-pointer"
          >
            Get a licence →
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-xs">
      <dt className="font-medium text-mist-500">{label}</dt>
      <dd className="truncate font-mono font-medium text-mist-100">{value}</dd>
    </div>
  );
}
