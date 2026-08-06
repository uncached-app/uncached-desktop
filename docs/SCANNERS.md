# Scanners

Scanner é plugin stateless e thread-safe que identifica diretórios descartáveis. O traversal é centralizado em `ScanService`.

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

`NextJs`, `.NET`, Docker e `.venv` estão representados no modelo de categorias, mas ainda não possuem scanner registrado.

## Adding scanner

1. Criar módulo em `src-tauri/src/scanner/`.
2. Implementar `Scanner` e confirmação contextual necessária.
3. Registrar em `get_default_scanners()`.
4. Adicionar testes para nomes e contexto.

Não é necessário alterar `ScanService` nem o frontend para categorias que já possam ser serializadas pelo modelo.
