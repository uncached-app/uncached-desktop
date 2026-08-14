# Scanners

`uncached_core::Scanner` é trait de plugin stateless e thread-safe que identifica diretórios descartáveis. O traversal é centralizado em `ScanService`.

Providers are modular and candidate-directed. `ProviderSet` owns registration and lookup; the shared walker asks providers about the current directory, returns a confirmed candidate, and prunes terminal artifacts before entering their contents. Providers must not perform independent tree traversals.

```rust
pub trait Scanner: Send + Sync {
    fn category(&self) -> Category;
    fn matches(&self, dir_name: &str) -> bool;
    fn confirm_context(&self, dir_path: &Path) -> bool;
}
```

## Duas formas de escrever um provider

A maioria dos providers não implementa o trait à mão. `ProjectScanner` descreve um tipo de projeto de forma declarativa — o marcador que identifica a raiz e os caminhos que um build regenera:

```rust
ProjectScanner::new(
    Category::SbtTarget,
    &["target", "project/target"],
    ProjectMarker::AnyFile(&["build.sbt"]),
)
```

Os artefatos são **relativos à raiz do projeto**, não nomes soltos. É isso que permite reivindicar `ios/Pods` sem reivindicar todo `Pods` que existir na máquina. `project_root()` sobe um nível por segmento e exige que cada um bata; se a sequência não bater, não há projeto e nada é reivindicado.

Implementar o trait diretamente continua sendo o caminho para providers com lógica própria — `NodeModulesScanner` recusa `node_modules` aninhado e caminhos de tooling, e `KnownLocationScanner` confirma por catálogo de caminhos absolutos.

## Implementados

Marcador é sempre um arquivo **diretamente ao lado** do diretório reivindicado, salvo indicação contrária.

| Categoria | Diretórios | Confirmação |
| --- | --- | --- |
| `NodeModules` | `node_modules`, `.angular` | `package.json` |
| `NextJs` | `.next` | `package.json` |
| `Turbo` | `.turbo` | `package.json` ou `turbo.json` |
| `NuxtCache` | `.nuxt` | `package.json` |
| `SvelteKitCache` | `.svelte-kit` | `package.json` |
| `ReactNative` | `.expo`, `.metro`, `android/build`, `android/.gradle`, `ios/build`, `ios/DerivedData`, `ios/Pods` | `package.json` + diretório `ios/` ou `android/` |
| `CargoTarget` | `target`, `.xwin-cache` | `Cargo.toml` |
| `PyCache` | `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, `.tox`, `.nox`, `__pypackages__` | nome suficiente |
| `PixiEnv` | `.pixi` | `pixi.toml` |
| `JupyterCheckpoints` | `.ipynb_checkpoints` | qualquer `*.ipynb` |
| `Gradle` | `.gradle` | nome suficiente |
| `GradleBuild` | `build` | `build.gradle[.kts]` ou `settings.gradle[.kts]` |
| `MavenTarget` | `target` | `pom.xml` |
| `SbtTarget` | `target`, `project/target` | `build.sbt` |
| `CMakeBuild` | `build`, `cmake-build-debug`, `cmake-build-release` | `CMakeLists.txt` |
| `ZigCache` | `zig-cache`, `.zig-cache`, `zig-out` | `build.zig` |
| `ElixirBuild` | `_build`, `.elixir-tools`, `.elixir_ls`, `.lexical` | `mix.exs` |
| `HaskellBuild` | `.stack-work`, `dist-newstyle` | `stack.yaml` ou `cabal.project` |
| `ComposerVendor` | `vendor` | `composer.json` |
| `TerraformDir` | `.terraform` | `.terraform.lock.hcl` |
| `UnityLibrary` | `Library`, `Temp`, `Obj`, `Logs`, `MemoryCaptures`, `Build`, `Builds` | `Assembly-CSharp.csproj` |
| `UnrealIntermediate` | `Binaries`, `Build`, `Saved`, `DerivedDataCache`, `Intermediate` | qualquer `*.uproject` |
| `GodotCache` | `.godot` | `project.godot` |
| `DotNetObj` | `bin`, `obj` | `*.csproj`, `*.fsproj`, `*.vbproj` ou `*.sln` |
| `XcodeDerivedData` | `DerivedData`, `build` | `*.xcodeproj` ou `*.xcworkspace` |
| `SwiftBuild` | `.build`, `.swiftpm` | `Package.swift` |
| `CocoapodsPods` | `Pods` | `Podfile` |
| `DartTool` | `.dart_tool` | `pubspec.yaml` |
| `FlutterBuild` | `build`, `linux/flutter/ephemeral`, `windows/flutter/ephemeral` | `pubspec.yaml` |

Categorias de descoberta — `PackageManagerCache`, `AiToolCache`, `EditorCache` — não vêm do walk do workspace: `KnownLocationScanner` as confirma contra um catálogo de caminhos sob o home. `Docker` está no modelo e não tem scanner.

### `LocationKind::ReportOnly`

Entrada do catálogo que o produto mede e **nunca remove**. Hoje: `Xcode/Archives` e `CoreSimulator/Devices` — normalmente os dois maiores diretórios que o Xcode possui, e nenhum dos dois é nosso para apagar. Um archive guarda os dSYMs que simbolicam crashes de uma release que já está com usuários; um device de simulador guarda o que foi instalado e configurado dentro dele.

A garantia é estrutural, não visual: `KnownLocationScanner::entries()` filtra `ReportOnly`, então nenhum provider avaliza esses caminhos e a limpeza os recusa no mesmo portão que recusa um diretório mal identificado. O alvo carrega `cleanable: false` no wire para que a interface não ofereça um controle que o backend negaria — mas se a interface esquecer, a deleção continua impossível. Dois testes cobrem os dois lados (`the_provider_set_vouches_for_every_cleanable_location` e `no_provider_vouches_for_a_report_only_location`).

O caminho seguro de recuperar esse espaço é o comando da própria ferramenta — `xcrun simctl delete unavailable` remove exatamente os devices que o macOS órfãozou. Nomear a operação é a razão da entrada existir.

### O que deliberadamente não é reivindicado

Estas ausências são decisão, não lacuna, e seguem o Kondo:

- **Nenhum virtualenv de Python.** `venv`, `.venv`, `env` e `virtualenv` são nomes comuns e refazer um ambiente custa rede. Coberto por teste (`no_provider_claims_a_python_virtual_environment`).
- **`build`, `dist` e `*.egg-info` de Python.** `dist/` costuma guardar o artefato publicado.
- **`deps/` do Elixir.** Dependências buscadas custam rede; o output compilado (`_build`) não.
- **`.sbt/`.** No home ele guarda credenciais e plugins globais, não output de build.

## Registro

`get_default_providers()` recebe `AppSettings`. `NodeModules`, `CargoTarget`, `Gradle`, `NextJs` e `Turbo` dependem do toggle correspondente em Settings § Scanning. Todo o resto é registrado incondicionalmente: cada um exige o arquivo-marcador do seu ecossistema, então numa máquina sem aquele ecossistema não casa com nada e não custa nada. Um toggle por provider só se justifica quando existir razão para desligar um.

`ReactNative` é registrado **primeiro**, no core e no desktop. Ele reivindica caminhos dentro de `ios/` e `android/` que Gradle e CocoaPods reivindicariam pelo nome solto, e `classify` devolve o primeiro provider que confirmar.

## Plano

`plan_for_category()` em `commands/entitlements.rs` é a única definição da fronteira Free. Todo artefato de projeto é Free, em qualquer ecossistema. O que permanece Pro é o que não é artefato de projeto: os stores compartilhados por toda a máquina (`PackageManagerCache`, `AiToolCache`, `EditorCache`, `Docker`), onde esvaziar torna todo restore futuro mais lento em vez de recuperar output de build.

## Adding scanner

1. Se o provider é "marcador + lista de caminhos", adicionar uma função em `uncached-core/src/scanner/providers/ecosystems.rs` e incluí-la em `ecosystems::all()`.
2. Caso contrário, criar módulo em `providers/` e implementar `Scanner`.
3. Adicionar a categoria em `model.rs` (variante, `as_wire` e `from_wire`).
4. Adicionar a apresentação da categoria em `TargetCard.tsx`, senão a UI mostra o nome cru da categoria.
5. Adicionar testes de nome e de contexto — incluindo o gêmeo inválido, sem o marcador.

Provider confirmation must stay cheap and contextual. A name match alone is a candidate; `confirm_context` decides whether it is a confirmed target. Once confirmed, discovery registers it for bounded asynchronous sizing and stops descending into that terminal directory.
