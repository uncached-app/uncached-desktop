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
| `ComposerVendor` | `vendor` | `composer.json`; no desktop, também `composer.lock` ou `.git`, e nunca abaixo da raiz de um plugin ou tema WordPress (ver nota) |
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

O desktop não registra o `ComposerVendor` do core: `composer()` em `src-tauri/src/scanner/mod.rs` o substitui por um `ProjectMarker::Custom` que, além de `composer.json`, exige `composer.lock` ou `.git` na raiz, e recusa qualquer raiz abaixo de `wp-content/{plugins,themes,mu-plugins,client-mu-plugins}/<extensão>/`. Bibliotecas empacotadas dentro de um plugin trazem `composer.json` próprio e nada que permita reinstalá-las.

Categorias de descoberta não vêm do walk do workspace: `KnownLocationScanner` as confirma contra um catálogo de caminhos sob o home, por plataforma. São `PackageManagerCache`, `AiToolCache`, `EditorCache`, `XcodeDerivedData` (DerivedData, device support, caches e os diretórios do simulador), `UnityLibrary` e `GodotCache` (caches das engines fora de qualquer projeto), `AndroidSdk` (system images e emuladores) e `Docker` (a imagem de disco do Docker Desktop, catalogada como `ReportOnly`).

### `LocationKind::ReportOnly`

Entrada do catálogo que o produto mede e **nunca remove**. Hoje: `Xcode/Archives` e `CoreSimulator/Devices` — normalmente os dois maiores diretórios que o Xcode possui, e nenhum dos dois é nosso para apagar. Um archive guarda os dSYMs que simbolicam crashes de uma release que já está com usuários; um device de simulador guarda o que foi instalado e configurado dentro dele. Também `ReportOnly`: os emuladores Android (`.android/avd`), que guardam o que foi instalado neles, e a imagem de disco do Docker, que contém todas as imagens, volumes e containers. No macOS, `probe_system()` reporta ainda os runtimes do simulador em `/System/Library/AssetsV2`, sempre como `ReportOnly`.

A garantia é estrutural, não visual: `KnownLocationScanner::entries()` filtra `ReportOnly`, então nenhum provider avaliza esses caminhos e a limpeza os recusa no mesmo portão que recusa um diretório mal identificado. O alvo carrega `cleanable: false` no wire para que a interface não ofereça um controle que o backend negaria — mas se a interface esquecer, a deleção continua impossível. Dois testes cobrem os dois lados (`the_provider_set_vouches_for_every_cleanable_location` e `no_provider_vouches_for_a_report_only_location`).

O caminho seguro de recuperar esse espaço é o comando da própria ferramenta — `xcrun simctl delete unavailable` remove exatamente os devices que o macOS órfãozou. Nomear a operação é a razão da entrada existir.

### O que deliberadamente não é reivindicado

Estas ausências são decisão, não lacuna, e seguem o Kondo:

- **Nenhum virtualenv de Python.** `venv`, `.venv`, `env` e `virtualenv` são nomes comuns e refazer um ambiente custa rede. Coberto por teste (`no_provider_claims_a_python_virtual_environment`).
- **`build`, `dist` e `*.egg-info` de Python.** `dist/` costuma guardar o artefato publicado.
- **`deps/` do Elixir.** Dependências buscadas custam rede; o output compilado (`_build`) não.
- **`.sbt/`.** No home ele guarda credenciais e plugins globais, não output de build.

## Registro

`get_default_providers()` registra **todos** os providers de workspace, sempre. Os cinco toggles que existiam foram removidos: uma regra de ignoração diz "nunca toque em nada com esse nome, em lugar nenhum", vale para as trinta categorias em vez de cinco, e vence contra o provider, a confiança e um agendamento. Um interruptor ao lado disso era duplicata mais fraca de um mecanismo que o usuário já tinha.

O que restou em Settings § Scanning cobre só o que o walk nunca alcança, em sete toggles: `detectPackageManagerCaches` (`PackageManagerCache`), `detectAiToolCaches` (`AiToolCache`), `detectEditorCaches` (`EditorCache`), `detectGameEngineCaches` (`UnityLibrary` e `GodotCache`), `detectAndroidSdk` (`AndroidSdk`), `detectContainerStorage` (`Docker`) e `detectXcodeData` (`XcodeDerivedData`, exibido só no macOS). Esses não têm equivalente em regra de ignoração — vivem sob caminhos que ninguém escolheu, pertencem a ferramentas e não a projetos, e cada um custa uma coisa diferente ao ser perdido. `discovery_categories()` traduz os toggles, e a filtragem acontece antes de qualquer medição: desligar uma categoria faz o scan trabalhar menos, não esconder resultado depois.

`detectXcodeData` controla só as entradas do catálogo de `XcodeDerivedData`; o `XcodeDerivedDataScanner` do walk continua registrado sempre, como os demais providers de workspace.

`ReactNative` é registrado **primeiro**, no core e no desktop. Ele reivindica caminhos dentro de `ios/` e `android/` que Gradle e CocoaPods reivindicariam pelo nome solto, e `classify` devolve o primeiro provider que confirmar.

## Plano

`plan_for_category()` em `commands/entitlements.rs` é a única definição da fronteira Free. Todo artefato de projeto é Free, em qualquer ecossistema. O que permanece Pro é o que não é artefato de projeto: os stores compartilhados por toda a máquina (`PackageManagerCache`, `AiToolCache`, `EditorCache`), onde esvaziar torna todo restore futuro mais lento em vez de recuperar output de build, e as categorias `Custom(_)`. `Docker` é Free: sua única entrada é `ReportOnly`, então não há limpeza a cobrar.

## Adding scanner

1. Se o provider é "marcador + lista de caminhos", adicionar uma função em `uncached-core/src/scanner/providers/ecosystems.rs` e incluí-la em `ecosystems::all()`.
2. Caso contrário, criar módulo em `providers/` e implementar `Scanner`.
3. Adicionar a categoria em `model.rs` (variante, `as_wire` e `from_wire`).
4. Adicionar a apresentação da categoria em `src/components/findings/categoryPresentation.ts`, senão a UI mostra o nome cru da categoria.
5. Adicionar testes de nome e de contexto — incluindo o gêmeo inválido, sem o marcador.

Provider confirmation must stay cheap and contextual. A name match alone is a candidate; `confirm_context` decides whether it is a confirmed target. Once confirmed, discovery registers it for bounded asynchronous sizing and stops descending into that terminal directory.
