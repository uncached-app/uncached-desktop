# Nuke Modules

Desktop cleaner para artefatos descartáveis de projetos, construído com Tauri 2, Rust e React.

## Status

Core seguro implementado para `node_modules`, Rust `target`, caches Python e `.gradle`. O backend registra targets encontrados em sessões de scan e rejeita limpeza por caminho arbitrário.

## Desenvolvimento

```bash
pnpm install
pnpm tauri dev
```

Verificações:

```bash
cd src-tauri
cargo fmt --check
cargo test
cd ..
pnpm build
```

Consulte [`docs/IPC.md`](docs/IPC.md) para comandos e eventos e [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) para limites de segurança.
