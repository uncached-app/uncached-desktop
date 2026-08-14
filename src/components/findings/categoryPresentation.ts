import {
  Binary,
  Bird,
  Blocks,
  Box,
  Boxes,
  Cloud,
  Code,
  Coffee,
  Component,
  Container,
  Cpu,
  Database,
  Droplet,
  Feather,
  Folder,
  Gamepad2,
  Hammer,
  Layers,
  Notebook,
  Package,
  Sigma,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

// The badge names the ecosystem the artifact came from; the directory name
// beside it already says which artifact it is. Naming the category after the
// directory made the pair read "Gradle .gradle", which spends a badge to
// repeat the next word.
export const CATEGORY_PRESENTATION: Record<string, { label: string; icon: LucideIcon }> = {
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

export function categoryPresentation(category: string): { label: string; icon: LucideIcon } {
  const known = CATEGORY_PRESENTATION[category];
  if (known) return known;
  return {
    label: category.startsWith(CUSTOM_CATEGORY_PREFIX)
      ? category.slice(CUSTOM_CATEGORY_PREFIX.length)
      : category,
    icon: Folder,
  };
}
