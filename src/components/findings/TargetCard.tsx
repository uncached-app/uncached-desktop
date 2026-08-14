import { useState } from "react";
import { Binary, Bird, Eye, Blocks, Box, Boxes, Check, Cloud, Code, Coffee, Component, Container, Copy, Cpu, Database, Droplet, Feather, Folder, Gamepad2, Hammer, Layers, LoaderCircle, LockKeyhole, Notebook, Package, RefreshCw, ShieldCheck, ShieldQuestion, Sigma, Smartphone, Sparkles, TriangleAlert } from "lucide-react";
import type { ConfidenceLevel, ScanTarget } from "../../types/scan";

// The level is decided in Rust and arrives as a reason code. The wording is
// presentation, so it lives here; an unknown code renders as itself rather
// than disappearing.
const CONFIDENCE_REASONS: Record<string, string> = {
  knownArtifact: "Recognized build artifact",
  projectManifest: "Sits inside a project with a manifest",
  lockfile: "The project has a lockfile, contents are reproducible",
  declaredDisposable: "Declared disposable by the project's .gitignore",
  versionControlled: "Tracked by Git, so it is not a build output",
  versionManagerPath: "Version manager directory, holds globally installed packages",
  systemPath: "Belongs to the operating system, not to a project",
  noProjectContext: "No project found around it",
  knownLocation: "Known cache location belonging to a specific tool",
  sharedCache: "Shared by every project: clearing it makes future installs slower",
  toolState: "Belongs to a tool rather than to a build",
};

const CONFIDENCE_PRESENTATION: Record<
  ConfidenceLevel,
  { label: string; className: string; textClassName: string; arrowClassName: string; icon: typeof ShieldCheck }
> = {
  high: {
    label: "High confidence",
    className: "border-confidence-high/25 bg-confidence-high-surface text-confidence-high",
    textClassName: "text-confidence-high",
    arrowClassName: "border-t-confidence-high-surface",
    icon: ShieldCheck,
  },
  medium: {
    label: "Medium confidence",
    className: "border-confidence-medium/30 bg-confidence-medium-surface text-confidence-medium",
    textClassName: "text-confidence-medium",
    arrowClassName: "border-t-confidence-medium-surface",
    icon: TriangleAlert,
  },
  review: {
    label: "Review",
    className: "border-confidence-review/25 bg-confidence-review-surface text-confidence-review",
    textClassName: "text-confidence-review",
    arrowClassName: "border-t-confidence-review-surface",
    icon: ShieldQuestion,
  },
};

// The badge names the ecosystem the artifact came from; the directory name
// beside it already says which artifact it is. Naming the category after the
// directory made the pair read "Gradle .gradle", which spends a badge to
// repeat the next word.
const CATEGORY_PRESENTATION: Record<string, { label: string; icon: typeof Package }> = {
  NodeModules: { label: "Node", icon: Package },
  NextJs: { label: "Node", icon: Package },
  Turbo: { label: "Node", icon: Package },
  NuxtCache: { label: "Node", icon: Package },
  SvelteKitCache: { label: "Node", icon: Package },
  ReactNative: { label: "React Native", icon: Smartphone },
  CargoTarget: { label: "Rust", icon: Box },
  PyCache: { label: "Python", icon: Layers },
  PixiEnv: { label: "Pixi", icon: Layers },
  JupyterCheckpoints: { label: "Jupyter", icon: Notebook },
  Gradle: { label: "JVM", icon: Coffee },
  GradleBuild: { label: "JVM", icon: Coffee },
  MavenTarget: { label: "JVM", icon: Coffee },
  SbtTarget: { label: "JVM", icon: Coffee },
  CMakeBuild: { label: "C/C++", icon: Cpu },
  ZigCache: { label: "Zig", icon: Binary },
  ElixirBuild: { label: "Elixir", icon: Droplet },
  HaskellBuild: { label: "Haskell", icon: Sigma },
  ComposerVendor: { label: "PHP", icon: Blocks },
  TerraformDir: { label: "Terraform", icon: Cloud },
  UnityLibrary: { label: "Unity", icon: Gamepad2 },
  UnrealIntermediate: { label: "Unreal", icon: Gamepad2 },
  GodotCache: { label: "Godot", icon: Gamepad2 },
  DotNetObj: { label: ".NET", icon: Boxes },
  Docker: { label: "Docker", icon: Container },
  XcodeDerivedData: { label: "Xcode", icon: Hammer },
  SwiftBuild: { label: "Swift", icon: Bird },
  CocoapodsPods: { label: "CocoaPods", icon: Component },
  DartTool: { label: "Dart", icon: Feather },
  FlutterBuild: { label: "Flutter", icon: Feather },
  // The three below only ever come from discovery, where the badge names the
  // kind of cache and the finding's own label names the tool that wrote it.
  PackageManagerCache: { label: "Package cache", icon: Database },
  AiToolCache: { label: "AI tool", icon: Sparkles },
  EditorCache: { label: "Editor", icon: Code },
};

const CUSTOM_CATEGORY_PREFIX = "Custom:";

function categoryPresentation(category: string) {
  const known = CATEGORY_PRESENTATION[category];
  if (known) return known;
  return {
    label: category.startsWith(CUSTOM_CATEGORY_PREFIX)
      ? category.slice(CUSTOM_CATEGORY_PREFIX.length)
      : category,
    icon: Folder,
  };
}

interface TargetCardProps {
  target: ScanTarget;
  isCleaning: boolean;
  selected: boolean;
  onToggle: (targetId: string) => void;
  onRefreshSize: (targetId: string) => void;
  proEnabled: boolean;
}

function confidenceReasons(target: ScanTarget): string[] {
  return target.confidence.signals.map((signal) => CONFIDENCE_REASONS[signal] ?? signal);
}

function ConfidenceBadge({ target, expanded, onToggle }: { target: ScanTarget; expanded: boolean; onToggle: () => void }) {
  const presentation = CONFIDENCE_PRESENTATION[target.confidence.level];
  const Icon = presentation.icon;

  return (
    <div className="group/confidence relative shrink-0">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        aria-expanded={expanded}
        // Icon only, so the name has to carry what the shape means.
        aria-label={`${presentation.label} for ${target.name}. Show what was detected`}
        className={`grid size-6 place-items-center rounded-md border leading-none transition-colors hover:border-sage-400/50 ${presentation.className}`}
      >
        <Icon size={13} aria-hidden="true" />
      </button>

      {/* Anchored right instead of centered: the badge sits at the card's edge,
          and a centered tooltip would hang outside it. Focus opens it too, so a
          keyboard reaches what the mouse gets. */}
      <span
        role="tooltip"
        className={`pointer-events-none absolute -top-8 right-0 z-10 flex scale-95 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 font-sans text-[11px] font-medium opacity-0 shadow-xl transition-all duration-200 group-hover/confidence:scale-100 group-hover/confidence:opacity-100 group-focus-within/confidence:scale-100 group-focus-within/confidence:opacity-100 ${presentation.className}`}
      >
        <Icon size={11} aria-hidden="true" />
        {presentation.label}
        <span className={`absolute -bottom-1 right-2.5 border-x-4 border-t-4 border-x-transparent ${presentation.arrowClassName}`} />
      </span>
    </div>
  );
}

// Rendered across the whole card rather than inside the column holding the
// badge: the reasons are sentences, and the size column is too narrow for them.
function ConfidenceReasons({ target }: { target: ScanTarget }) {
  const presentation = CONFIDENCE_PRESENTATION[target.confidence.level];

  return (
    <div className="border-t border-forest-800 pt-2.5 sm:col-span-2">
      <p className={`text-[11px] font-medium ${presentation.textClassName}`}>{presentation.label}</p>
      <ul className="mt-1.5 space-y-1">
        {confidenceReasons(target).map((reason) => (
          <li key={reason} className="flex items-start gap-2 text-[11px] leading-5 text-mist-500">
            <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-mist-500" />
            {reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TargetCard({ target, isCleaning, selected, onToggle, onRefreshSize, proEnabled }: TargetCardProps) {
  const [copiedPath, setCopiedPath] = useState(false);
  const [confidenceOpen, setConfidenceOpen] = useState(false);
  const proLocked = target.plan === "pro" && !proEnabled;
  // Reported, never removed. The backend refuses it because no provider vouches
  // for it; the card leaves the checkbox out so the refusal is never reached.
  const reportOnly = target.cleanable === false;
  const disabled = isCleaning || target.sizePending || target.sizeHasErrors || proLocked || reportOnly;
  const category = categoryPresentation(target.category);
  const CategoryIcon = category.icon;

  async function handleCopyPath(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(target.path);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch (err) {
      console.error("Failed to copy path", err);
    }
  }

  return (
    <article
      onClick={() => {
        if (!disabled) onToggle(target.id);
      }}
      /* A locked card sits on the canvas colour instead of the raised one, so
         it reads as recessed rather than merely greyed: the actionable cards
         lift off the page and the locked ones stay in it. The border carries
         the Pro tint so the reason is legible before reading any label. */
      className={`group grid select-none gap-3 rounded-2xl border p-4 transition-all duration-200 sm:grid-cols-[1fr_auto] sm:items-center ${
        proLocked
          ? "cursor-not-allowed border-pro-200/25 bg-forest-950 text-mist-500"
          : disabled
          ? "cursor-not-allowed border-forest-800 bg-forest-900 text-mist-500"
          : selected
          ? "cursor-pointer border-sage-400 bg-forest-900"
          : "cursor-pointer border-forest-800 bg-forest-900 hover:border-sage-400"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3.5">
        {reportOnly ? (
          <span
            aria-hidden="true"
            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border border-forest-800 text-mist-500"
          >
            <Eye size={12} />
          </span>
        ) : (
        <div
          role="checkbox"
          aria-checked={selected}
          aria-disabled={disabled}
          aria-label={`Select ${target.name}`}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => {
            if ((e.key === " " || e.key === "Enter") && !disabled) {
              e.preventDefault();
              onToggle(target.id);
            }
          }}
          className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-all ${
            selected
              ? "border-sage-400 bg-sage-400 text-forest-950"
              : disabled
              ? "border-forest-800 bg-forest-900 text-transparent"
              : "border-forest-700 bg-forest-950 text-transparent group-hover:border-sage-400"
          }`}
        >
          <Check size={13} strokeWidth={3} aria-hidden="true" />
        </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-forest-800 bg-forest-800 px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide text-sage-300">
              <CategoryIcon size={12} className="text-sage-300" aria-hidden="true" />
              {category.label}
            </span>
            {/* A discovered cache is named by the tool that wrote it. Its
                directory is called `store`, `_cacache` or `Cache`, which would
                leave the user guessing which tool each row belongs to. */}
            <span className="text-xs font-medium text-mist-500">{target.label ?? target.name}</span>
            {proLocked && (
              <span className="inline-flex items-center gap-1 rounded-md border border-pro-200/30 bg-pro-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pro-100">
                <LockKeyhole size={10} aria-hidden="true" /> Pro
              </span>
            )}
          </div>

          <div className="group/path relative mt-1.5">
            <p
              onClick={handleCopyPath}
              className="truncate font-mono text-xs leading-5 text-mist-500 cursor-pointer transition-colors hover:text-mist-300"
              title={target.path}
            >
              {target.path}
            </p>

            {/* Centered Tooltip over path text */}
            <span
              className={`pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 flex items-center gap-1.5 whitespace-nowrap rounded-md border border-forest-800 bg-forest-850 px-2 py-0.5 font-sans text-[11px] font-medium shadow-xl transition-all duration-200 ${
                copiedPath
                  ? "scale-100 opacity-100 border-sage-400/50 text-sage-300"
                  : "scale-95 opacity-0 text-mist-100 group-hover/path:scale-100 group-hover/path:opacity-100"
              }`}
            >
              {copiedPath ? (
                <>
                  <Check size={11} className="text-sage-300" strokeWidth={2.5} aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy size={11} className="text-mist-500" aria-hidden="true" />
                  <span>Copy</span>
                </>
              )}
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-forest-800" />
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pl-8 sm:gap-4 sm:pl-0">
        <div className="text-right">
          {reportOnly ? (
            <div className="flex flex-col items-end gap-0.5">
              <strong className="block text-lg font-semibold text-mist-300">{target.formattedSize}</strong>
              <span className="text-[10px] font-medium text-mist-500">reported, not removed</span>
            </div>
          ) : proLocked ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-pro-100">
              <LockKeyhole size={14} aria-hidden="true" /> Unlock to clean
            </span>
          ) : target.sizePending ? (
            <span className="inline-flex items-center gap-2 text-sm text-mist-500">
              <LoaderCircle size={16} className="animate-spin text-sage-400" aria-hidden="true" /> Loading size
            </span>
          ) : target.sizeHasErrors ? (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-medium text-amber-300">Size unavailable</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRefreshSize(target.id);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-forest-800 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-forest-850"
                aria-label={`Size failed for ${target.name}. Retry measurement`}
              >
                <RefreshCw size={13} aria-hidden="true" /> Retry
              </button>
            </div>
          ) : (
            <strong className={`block text-lg font-semibold ${selected ? "text-mist-100" : "text-mist-300"}`}>
              {target.formattedSize}
            </strong>
          )}
        </div>

        <ConfidenceBadge target={target} expanded={confidenceOpen} onToggle={() => setConfidenceOpen((open) => !open)} />
      </div>

      {confidenceOpen && <ConfidenceReasons target={target} />}
    </article>
  );
}


