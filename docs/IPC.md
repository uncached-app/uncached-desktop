# IPC & Events

Contrato entre React e backend Tauri. Backend é autoridade para seleção e limpeza de targets.

## Commands

### `start_scan`

Request:

```json
{ "path": "C:\\Users\\User\\Projects" }
```

Response imediata:

```json
{ "scanId": "scan-1" }
```

O scan continua em worker. A raiz deve existir, ser diretório real e não ser link simbólico.

### `cancel_scan`

Cancela e invalida sessão de scan em andamento. Targets encontrados nessa sessão são
removidos e não podem ser limpos.

Request:

```json
{ "scanId": "scan-1" }
```

Response:

```json
{ "cancelled": true }
```

Cancelamento repetido ou de sessão finalizada retorna `cancelled: false`.

### `clean_target`

Limpa target registrado por uma sessão de scan. Não aceita caminho arbitrário.

Request:

```json
{
  "request": {
    "targetId": "scan-1-abc123",
    "mode": "Trash",
    "confirmation": null
  }
}
```

`mode` pode ser `Trash` ou `Permanent`. `Permanent` exige `confirmation: "Nuke"` no backend.

Response:

```json
{
  "success": true,
  "targetPath": "C:\\Users\\User\\Projects\\my-app\\node_modules",
  "freedBytes": 524288000,
  "modeUsed": "Trash",
  "message": null
}
```

### `get_settings`

Retorna configurações padrão atuais. Persistência ainda não está implementada.

## Events

Todos payloads usam `camelCase`.

### `scan:started`

```json
{ "scanId": "scan-1", "rootPath": "C:\\Users\\User\\Projects" }
```

### `scan:target_found`

```json
{
  "scanId": "scan-1",
  "target": {
    "id": "scan-1-abc123",
    "path": "C:\\Users\\User\\Projects\\my-app\\node_modules",
    "name": "node_modules",
    "category": "NodeModules",
    "sizeBytes": 524288000,
    "formattedSize": "500.00 MB",
    "lastModified": "2026-05-10T14:32:00Z"
  }
}
```

### `scan:progress`

```json
{
  "scanId": "scan-1",
  "directoriesScanned": 14200,
  "targetsFound": 8,
  "totalBytesFound": 4831838208
}
```

### `scan:finished`

```json
{
  "scanId": "scan-1",
  "totalTargets": 8,
  "totalBytesFound": 4831838208,
  "durationMs": 340
}
```

### `scan:cancelled`

```json
{
  "scanId": "scan-1",
  "totalTargets": 0,
  "totalBytesFound": 0
}
```

Esse evento substitui `scan:finished` quando scan é cancelado.

### `clean:started`

```json
{ "targetId": "scan-1-abc123", "mode": "Trash" }
```

### `clean:success`

```json
{ "targetId": "scan-1-abc123", "result": { "success": true } }
```

### `clean:failed`

```json
{ "targetId": "scan-1-abc123", "message": "Permission denied" }
```
