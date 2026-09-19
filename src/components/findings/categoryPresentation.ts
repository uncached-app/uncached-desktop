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

export const CATEGORY_PRESENTATION: Record<string, { label: string; icon: LucideIcon }> = {
  NodeModules: { label: "node_modules", icon: Package },
  NextJs: { label: "Next.js", icon: Package },
  Turbo: { label: "Turborepo", icon: Package },
  NuxtCache: { label: "Nuxt", icon: Package },
  SvelteKitCache: { label: "SvelteKit", icon: Package },
  ReactNative: { label: "React Native", icon: Smartphone },
  CargoTarget: { label: "Rust (Cargo)", icon: Box },
  PyCache: { label: "Python", icon: Layers },
  PixiEnv: { label: "Pixi", icon: Layers },
  JupyterCheckpoints: { label: "Jupyter", icon: Notebook },
  Gradle: { label: "Gradle (.gradle)", icon: Coffee },
  GradleBuild: { label: "Gradle (build)", icon: Coffee },
  MavenTarget: { label: "Maven", icon: Coffee },
  SbtTarget: { label: "Sbt", icon: Coffee },
  CMakeBuild: { label: "C/C++", icon: Cpu },
  ZigCache: { label: "Zig", icon: Binary },
  ElixirBuild: { label: "Elixir", icon: Droplet },
  HaskellBuild: { label: "Haskell", icon: Sigma },
  ComposerVendor: { label: "PHP (Composer)", icon: Blocks },
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
  PackageManagerCache: { label: "Package cache", icon: Database },
  AiToolCache: { label: "AI tool cache", icon: Sparkles },
  EditorCache: { label: "Editor cache", icon: Code },
  AndroidSdk: { label: "Android SDK", icon: Smartphone },
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
