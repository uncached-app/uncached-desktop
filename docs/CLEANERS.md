# Cleaners

Todos os cleaners implementam:

```rust
pub trait Cleaner: Send + Sync {
    fn clean(&self, target_path: &Path) -> NukeResult<u64>;
}
```

O `CleanService` valida target registrado, canonicalização, escopo da sessão e confirmação antes de chamar essa trait.

## TrashCleaner

Modo padrão. Usa capacidades nativas de Recycle Bin/Trash via crate `trash`. Retorna bytes calculados antes da movimentação. Falhas de lixeira retornam `NukeError::Trash`; erros reconhecidos como item grande retornam `RecycleBinTooLarge`.

## PermanentCleaner

Modo destrutivo. Exige confirmação exata `Nuke` no backend. Revalida o diretório, remove atributos read-only e usa `remove_dir_all`. Caminhos Windows são normalizados para suporte a long paths.

Deleção paralela com Rayon não faz parte da implementação atual.

## Safety contract

- targets precisam vir de sessão de scan;
- target precisa continuar existindo e ser diretório real;
- target não pode ser raiz, diretório crítico ou estar fora da raiz escaneada;
- falhas de permissões não são descartadas durante preparação;
- eventos de início, sucesso e falha são emitidos pelo comando Tauri.
