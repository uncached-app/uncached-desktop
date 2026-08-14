import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Check, LoaderCircle, LockKeyhole } from "lucide-react";
import { openExternalUrl } from "../../utils/externalLink";

type LicenseInfo = {
  id: string;
  holder: string;
  plan: string;
  expiresAt: string | null;
  seats: number;
};

/**
 * An expired licence is still a purchase. Renewal arrives by email, so a paying
 * user can land here through no fault of their own — a message in spam, a card
 * that failed — and the screen has to say which of the two happened.
 */
type LicenseState = {
  license: LicenseInfo;
  expired: boolean;
  expiresInDays: number | null;
};

/** How early the renewal notice appears, in days. */
const RENEWAL_NOTICE_DAYS = 14;

/**
 * Activation, and nothing else.
 *
 * The key is verified natively — a signature check against a key compiled into
 * the app — so this screen never decides whether someone is Pro. It pastes,
 * reports what the native layer answered, and shows the licence back to its
 * holder so an activation is verifiable by eye.
 */
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
      // The native layer writes these for people, not for logs.
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
      <div className="rounded-2xl border border-forest-800 bg-forest-950 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-sage-300">
          <Check size={16} strokeWidth={2.5} aria-hidden="true" /> Uncached Pro
        </div>
        {renewing && (
          <p className="mt-3 rounded-xl border border-confidence-medium/30 bg-confidence-medium-surface px-3 py-2 text-xs leading-5 text-confidence-medium">
            Renews in {expiresInDays === 1 ? "1 day" : `${expiresInDays} days`}. The new key arrives
            by email — paste it here when it does.
          </p>
        )}
        <dl className="mt-4 grid gap-2 text-xs">
          <Row label="Licensed to" value={license.holder} />
          <Row label="Licence" value={license.id} />
          <Row label="Machines" value={license.seats === 1 ? "1" : String(license.seats)} />
          <Row
            label="Expires"
            value={license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : "Never"}
          />
        </dl>
        <button
          type="button"
          onClick={deactivate}
          disabled={busy}
          className="mt-5 rounded-xl bg-forest-800 px-4 py-2 text-xs font-medium text-mist-300 transition-colors hover:bg-forest-850 disabled:opacity-50"
        >
          Remove from this machine
        </button>
      </div>
    );
  }

  const lapsed = state?.expired ? state : null;

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-950 p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-mist-100">
        <LockKeyhole size={15} className="text-mist-500" aria-hidden="true" /> Uncached Free
      </div>
      {lapsed ? (
        <p className="mt-3 rounded-xl border border-coral-300/30 bg-forest-900 px-3 py-2 text-xs leading-5 text-coral-300">
          The licence for {lapsed.license.holder} expired on{" "}
          {new Date(lapsed.license.expiresAt ?? "").toLocaleDateString()}. If you renewed, the new
          key was emailed to you — paste it below.
        </p>
      ) : (
        <p className="mt-2 text-xs leading-5 text-mist-500">
          Cleanup is complete on Free, in every ecosystem. Pro adds the workspace: what changed since
          your last visit, what has been reclaimed over time, and maintenance that runs without you.
        </p>
      )}

      <label className="mt-4 block text-xs text-mist-300">
        Licence key
        <input
          value={key}
          onChange={(event) => setKey(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void activate();
          }}
          placeholder="Paste the key from your receipt"
          spellCheck={false}
          autoComplete="off"
          className="mt-2 w-full rounded-xl border border-forest-800 bg-forest-900 px-3 py-2.5 font-mono text-xs text-mist-100 outline-none transition-colors focus:border-sage-400"
        />
      </label>

      {error && (
        <p role="alert" className="mt-3 text-xs leading-5 text-coral-300">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={activate}
          disabled={busy || key.trim().length === 0}
          className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-sage-400 px-4 text-xs font-semibold text-forest-950 transition-colors hover:bg-sage-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy && <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />}
          Activate
        </button>
        <button
          type="button"
          onClick={() => openExternalUrl("https://uncached.app/pro")}
          className="text-xs font-medium text-mist-500 transition-colors hover:text-sage-300"
        >
          Get a licence
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-mist-500">{label}</dt>
      <dd className="truncate font-mono text-mist-100">{value}</dd>
    </div>
  );
}
