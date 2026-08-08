# Scanners

Scanner é plugin stateless e thread-safe que identifica diretórios descartáveis. O traversal é centralizado em `ScanService`.

Providers are modular and candidate-directed. `ProviderSet` owns registration and lookup; the shared walker asks providers about the current directory, returns a confirmed candidate, and prunes terminal artifacts before entering their contents. Providers must not perform independent tree traversals.

```rust
pub trait Scanner: Send + Sync {
    fn category(&self) -> Category;
    fn matches(&self, dir_name: &str) -> bool;
    fn confirm_context(&self, dir_path: &Path) -> bool;
    fn create_target(&self, dir_path: &Path) -> Option<ScanTarget>;
}
```

## Implementados

| Categoria | Nome | Confirmação |
| --- | --- | --- |
| `NodeModules` | `node_modules` | `package.json` no pai |
| `CargoTarget` | `target` | `Cargo.toml` no pai |
| `PyCache` | `__pycache__`, `.pytest_cache`, `.mypy_cache` | nome suficiente |
| `Gradle` | `.gradle` | nome suficiente |
| `NextJs` | `.next` | `package.json` no pai |
| `Turbo` | `.turbo` | `package.json` ou `turbo.json` no pai |

`get_default_scanners()` recebe `AppSettings` e registra condicionalmente: `NodeModules`, `CargoTarget`, `Gradle`, `NextJs` e `Turbo` dependem do toggle correspondente em Settings § Scanning. `PyCache` é sempre registrado e não tem toggle.

`.NET`, Docker e `.venv` estão representados no modelo de categorias, mas ainda não possuem scanner implementado.

## Adding scanner

1. Criar módulo em `src-tauri/src/scanner/`.
2. Implementar `Scanner` e confirmação contextual necessária.
3. Registrar em `get_default_scanners()`.
4. Adicionar testes para nomes e contexto.

Não é necessário alterar `ScanService` nem o frontend para categorias que já possam ser serializadas pelo modelo.

Provider confirmation must stay cheap and contextual. A name match alone is a candidate; `confirm_context` decides whether it is a confirmed target. Once confirmed, discovery registers it for bounded asynchronous sizing and stops descending into that terminal directory.
