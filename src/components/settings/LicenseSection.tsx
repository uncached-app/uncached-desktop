import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  AlertCircle,
  Calendar,
  Check,
  Copy,
  ExternalLink,
  Hash,
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

/** What Pro adds. Free reclaims every artifact of every project, always. */
const PRO_FEATURES = [
  "Interactive 2D workspace map",
  "Automated background cleanups",
  "Cross-project duplicate insights",
  "Lifetime reclaimed analytics",
];

/**
 * A key is `<payload>.<signature>`, both base64url.
 *
 * Checked here only to warn, never to block: this is a guess about a format the
 * backend owns, and a stricter guess than the verifier would refuse keys the
 * app would have accepted. It exists for the one failure that is otherwise
 * silent until activation — half a key, from a paste that clipped.
 */
function looksLikeKey(value: string) {
  const parts = value.split(".");
  return parts.length === 2 && parts.every((part) => part.length > 20);
}

export function LicenseSection({
  onActivated,
  proEnabled = false,
}: {
  onActivated: () => void;
  proEnabled?: boolean;
}) {
  const [state, setState] = useState<LicenseState | null>(null);
  // Distinct from "no licence": they are the same empty state and different
  // facts, and rendering Free while the answer is still coming meant a paying
  // user was told they were on the free plan every time settings opened.
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"id" | "key" | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  useEffect(() => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    void invoke<LicenseState | null>("get_license")
      .then(setState)
      .catch(() => setState(null))
      .finally(() => setLoading(false));
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
      setConfirmingRemoval(false);
      onActivated();
    } finally {
      setBusy(false);
    }
  }

  function copy(text: string, what: "id" | "key") {
    void navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  /** Hands back the key this machine is running on, so removal is reversible. */
  async function copyStoredKey() {
    const stored = await invoke<string | null>("stored_license_key").catch(() => null);
    if (stored) copy(stored, "key");
  }

  /* -------------------------------------------------------------------------- */
  /* STILL READING                                                              */
  /* -------------------------------------------------------------------------- */
  if (loading) {
    return (
      <div className="flex items-center gap-2.5 text-xs text-mist-500" aria-live="polite">
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        <span>Reading your licence...</span>
      </div>
    );
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
              <div className="grid size-8 place-items-center rounded-xl border border-pro-200/20 bg-forest-950 text-pro-100">
                <Sparkles size={15} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-mist-100">Uncached Pro</h3>
                <p className="text-xs text-mist-500">All features active on this machine</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sage-300/40 bg-forest-950 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-sage-300">
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

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Detail icon={User} label="Licensed to" value={license.holder} />
            <Detail
              icon={Laptop}
              label="Authorized seats"
              value={license.seats === 1 ? "1 machine" : `${license.seats} machines`}
            />
            <Detail
              icon={Calendar}
              label="Expiration"
              value={license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : "Perpetual"}
            />
            {/* The order reference, and labelled as one.

                This card used to say "Licence Key" over the same value, beside
                a Copy button. It is not the key — it is the short id to quote
                in a support request — so somebody moving to a second machine
                copied it, pasted it, and was told their licence was not issued
                by Uncached. The key itself is offered below, next to the button
                that makes needing it urgent. */}
            <Detail
              icon={Hash}
              label="Reference"
              value={license.id}
              mono
              action={{
                title: "Copy reference, for a support request",
                done: copied === "id",
                onClick: () => copy(license.id, "id"),
              }}
            />
          </div>
        </div>

        {/* Transfer / Deactivate */}
        <div className="border-t border-forest-800 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-mist-300">Moving to another machine?</p>
              <p className="mt-0.5 text-xs text-mist-500">
                Take your key with you before removing it here.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copyStoredKey}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-forest-800 bg-forest-850 px-3.5 text-xs font-medium text-mist-300 transition-colors hover:border-forest-750 hover:bg-forest-800 hover:text-mist-100"
              >
                {copied === "key" ? (
                  <>
                    <Check size={13} className="text-sage-300" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <KeyRound size={13} aria-hidden="true" />
                    <span>Copy licence key</span>
                  </>
                )}
              </button>

              {/* Two presses, because the first one is not recoverable from
                  inside the app: the key came by email, and this was the last
                  copy of it the machine held. */}
              {confirmingRemoval ? (
                <>
                  <button
                    type="button"
                    onClick={deactivate}
                    disabled={busy}
                    className="inline-flex h-9 cursor-pointer items-center rounded-xl border border-coral-300/40 bg-coral-300/10 px-3.5 text-xs font-semibold text-coral-300 transition-colors hover:bg-coral-300/20 disabled:opacity-50"
                  >
                    {busy ? "Removing..." : "Yes, remove it"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRemoval(false)}
                    disabled={busy}
                    className="inline-flex h-9 cursor-pointer items-center rounded-xl px-2.5 text-xs font-medium text-mist-500 transition-colors hover:text-mist-100 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingRemoval(true)}
                  disabled={busy}
                  className="inline-flex h-9 cursor-pointer items-center rounded-xl border border-forest-800 bg-forest-850 px-3.5 text-xs font-medium text-mist-300 transition-colors hover:border-coral-300/40 hover:bg-coral-300/10 hover:text-coral-300 disabled:opacity-50"
                >
                  Remove from this machine
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* EXPIRED, OR NEVER LICENSED                                                 */
  /* -------------------------------------------------------------------------- */
  const lapsed = effectiveState?.expired ? effectiveState : null;

  return (
    <div className="space-y-5">
      {/* An expired licence leads with itself, not with "Uncached Free".

          Renewal arrives by email, so a paying customer reaches this screen
          through no fault of their own — a message in spam, a card that
          failed. Greeting them as a free user would be both wrong and the
          worst moment this product has. */}
      {lapsed ? (
        <div className="rounded-2xl border border-coral-300/30 bg-coral-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="grid size-8 place-items-center rounded-xl border border-coral-300/20 bg-forest-950 text-coral-300">
                <AlertCircle size={15} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-mist-100">Licence expired</h3>
                <p className="text-xs text-mist-500">
                  {lapsed.license.holder} ·{" "}
                  {new Date(lapsed.license.expiresAt ?? "").toLocaleDateString()}
                </p>
              </div>
            </div>
            <span className="rounded-full border border-coral-300/40 bg-forest-950 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-coral-300">
              Lapsed
            </span>
          </div>
          <p className="mt-4 text-xs leading-5 text-mist-300">
            Pro features are locked until it is renewed. Everything Free does is untouched — no
            project and nothing on disk is affected by this.
          </p>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lock size={15} className="text-mist-500" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-mist-100">Uncached Free</h3>
            </div>
            <span className="rounded-md border border-forest-800 bg-forest-950 px-2 py-0.5 font-mono text-[10px] font-medium uppercase text-mist-500">
              Current plan
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-mist-500">
            Free reclaims every artifact of every project, with no limits. Pro adds the readings
            that span the whole workspace:
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PRO_FEATURES.map((feature) => (
          <div
            key={feature}
            className="flex items-center gap-2.5 rounded-xl border border-forest-800 bg-forest-950 px-3.5 py-2.5 text-xs text-mist-300"
          >
            <Check size={13} strokeWidth={3} className="shrink-0 text-sage-300" aria-hidden="true" />
            <span>{feature}</span>
          </div>
        ))}
      </div>

      {/* Activation Form */}
      <div className="space-y-3 border-t border-forest-800 pt-4">
        <label className="block">
          <span className="text-xs font-medium text-mist-300">
            {lapsed ? "Renewed licence key" : "Licence key"}
          </span>
          {/* A field, not a line.

              The key is a signed token a few hundred characters long, so a
              single-line input showed a moving window onto the middle of it —
              which is exactly where a paste that clipped looks identical to one
              that did not. Three wrapped rows show the whole thing. */}
          <textarea
            value={key}
            onChange={(event) => {
              // Every whitespace character, not just the ends: a key copied out
              // of an email arrives with the line breaks the mail client wrapped
              // it at, and those were reaching the verifier as part of the
              // payload. The failure it produced — "not issued by Uncached" —
              // pointed at the key rather than at the paste.
              setKey(event.currentTarget.value.replace(/\s+/g, ""));
              if (error) setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              void activate();
            }}
            rows={3}
            placeholder="Paste the key from your receipt"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            className={`mt-2 block w-full resize-none rounded-xl border bg-forest-950 p-3.5 font-mono text-[11px] leading-5 break-all text-mist-100 outline-none transition-colors placeholder:text-mist-500 ${
              error ? "border-coral-300/50" : "border-forest-800 focus:border-sage-400"
            }`}
          />
        </label>

        <div className="flex min-h-4 items-start gap-2 text-xs" aria-live="polite">
          {error ? (
            <span className="flex items-start gap-2 text-coral-300 select-text">
              <AlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </span>
          ) : (
            key.length > 0 &&
            !looksLikeKey(key) && (
              <span className="flex items-start gap-2 text-mist-500">
                <AlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
                <span>This looks like part of a key. Paste the whole line from your receipt.</span>
              </span>
            )
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={activate}
            disabled={busy || key.trim().length === 0}
            className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-sage-400 px-5 text-xs font-semibold text-forest-950 shadow-xs transition-all hover:bg-sage-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin text-forest-950" aria-hidden="true" />
            ) : (
              <Sparkles size={14} aria-hidden="true" />
            )}
            <span>{busy ? "Validating..." : lapsed ? "Reactivate Pro" : "Activate Pro"}</span>
          </button>

          <button
            type="button"
            onClick={() => openExternalUrl("https://uncached.app/pro")}
            className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-forest-800 bg-forest-850 px-4 text-xs font-medium text-mist-300 transition-colors hover:border-forest-750 hover:bg-forest-800 hover:text-mist-100"
          >
            <span>{lapsed ? "Renew licence" : "Get a licence"}</span>
            <ExternalLink size={12} className="text-mist-500" aria-hidden="true" />
          </button>
        </div>

        <p className="text-[11px] leading-5 text-mist-500">
          Activation is offline. The key carries its own signature, so nothing is sent anywhere and
          it keeps working without a connection.
        </p>
      </div>
    </div>
  );
}

/** One fact about the licence, and optionally a way to copy it. */
function Detail({
  icon: Icon,
  label,
  value,
  mono = false,
  action,
}: {
  icon: typeof User;
  label: string;
  value: string;
  mono?: boolean;
  action?: { title: string; done: boolean; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between gap-2.5 rounded-xl border border-forest-800 bg-forest-950 p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon size={14} className="shrink-0 text-mist-500" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-mist-500">{label}</p>
          <p className={`truncate text-xs font-semibold text-mist-100 ${mono ? "font-mono" : ""}`}>
            {value}
          </p>
        </div>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          title={action.title}
          aria-label={action.title}
          className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg border border-forest-800 bg-forest-900 text-mist-500 transition-colors hover:bg-forest-850 hover:text-mist-100"
        >
          {action.done ? <Check size={13} className="text-sage-300" /> : <Copy size={13} />}
        </button>
      )}
    </div>
  );
}
