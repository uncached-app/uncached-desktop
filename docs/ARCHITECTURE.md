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

### Candidate discovery and sizing

Discovery is candidate-directed: the shared traversal may invoke its callback for every directory it visits, but target discovery and target events emit only confirmed candidates. Terminal artifact subtrees are pruned immediately, so their contents are not traversed merely to discover the artifact. Provider implementations remain isolated behind `ProviderSet`; adding or changing a provider does not create a second traversal.

Target sizing starts when a candidate is registered. A bounded controller uses `available_parallelism().clamp(1, 8)` workers and a bounded channel, so sizing cannot create an unbounded queue. Each target is marked pending until its sizing job settles. `scan:finished` is emitted only after traversal has finished and every sizing job has settled; its `durationMs` covers this settling lifecycle.

Sizing errors are retained on the target and remain visible to Review. They settle the sizing job, so Review can open after all targets settle, but cleanup claims reject targets with `size_has_errors` (and pending targets) until a successful retry completes.

## Clean flow

1. Frontend envia `targetId`, modo e confirmação.
2. Backend recupera target da sessão; path enviado pelo frontend não é autoridade.
3. Backend canonicaliza novamente, rejeita links, raízes, diretórios críticos e targets fora da raiz da sessão.
4. `TrashCleaner` ou `PermanentCleaner` executa operação fora do executor assíncrono.
5. Eventos `clean:started`, `clean:success` ou `clean:failed` são emitidos.

Targets ficam em registro de memória. Reiniciar aplicativo invalida targets anteriores.

## Traits

`Scanner` define `category`, `matches` e `confirm_context`. O traversal pertence ao `ScanService`; scanners não percorrem árvores individualmente.

`Cleaner` recebe um path já autorizado e retorna `NukeResult<u64>`. A autorização não pertence ao cleaner, mas cleaners também mantêm validação defensiva.

## Platform safety

- `canonicalize_target` rejeita symlinks e diretórios que não sejam reais.
- `is_within_root` impede sair da raiz da sessão.
- raízes de volume e diretórios críticos são bloqueados.
- Windows usa prefixo `\\?\` para caminhos longos após canonicalização.
- atributos read-only são removidos com propagação de erros.
