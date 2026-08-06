# Uncached Architecture

## Principles

1. Rust concentra regras, validação de caminhos e operações de filesystem.
2. React apresenta estado; não decide se um caminho é seguro para apagar.
3. Scanners e cleaners dependem de traits pequenos e testáveis.
4. Operações longas emitem eventos e não bloqueiam o comando IPC.

## Layers

```text
React / Vite
    |
Tauri commands + events
    |
ScanService / CleanService
    |              |
Scanner trait     Cleaner trait
    |              |
filesystem + models + errors
```

## Scan flow

1. Frontend chama `start_scan(path)`.
2. Backend canonicaliza a raiz e cria `scanId`.
3. Worker usa `DiskWalker` e scanners registrados.
4. Cada target encontrado recebe ID da sessão e é registrado no backend.
5. Eventos `scan:started`, `scan:target_found`, `scan:progress` e `scan:finished` atualizam a UI.

Walker poda subárvores quando scanner identifica target. Isso evita percorrer o conteúdo interno de `node_modules`, `target` e caches.

## Clean flow

1. Frontend envia `targetId`, modo e confirmação.
2. Backend recupera target da sessão; path enviado pelo frontend não é autoridade.
3. Backend canonicaliza novamente, rejeita links, raízes, diretórios críticos e targets fora da raiz da sessão.
4. `TrashCleaner` ou `PermanentCleaner` executa operação fora do executor assíncrono.
5. Eventos `clean:started`, `clean:success` ou `clean:failed` são emitidos.

Targets ficam em registro de memória. Reiniciar aplicativo invalida targets anteriores.

## Traits

`Scanner` define `category`, `matches`, `confirm_context` e `create_target`. O traversal pertence ao `ScanService`; scanners não percorrem árvores individualmente.

`Cleaner` recebe um path já autorizado e retorna `NukeResult<u64>`. A autorização não pertence ao cleaner, mas cleaners também mantêm validação defensiva.

## Platform safety

- `canonicalize_target` rejeita symlinks e diretórios que não sejam reais.
- `is_within_root` impede sair da raiz da sessão.
- raízes de volume e diretórios críticos são bloqueados.
- Windows usa prefixo `\\?\` para caminhos longos após canonicalização.
- atributos read-only são removidos com propagação de erros.
