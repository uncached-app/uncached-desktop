# Roadmap

Current release state: private early access for the free tier. Public download and Pro monetization follow completed product and licensing work.

## Phase 1: Core seguro

- [x] Traits `Scanner` e `Cleaner`
- [x] Walker com poda de subárvores
- [x] Sessão de scan com targets autorizados
- [x] Validação de raízes, escopo e links
- [x] Trash e permanent cleaner defensivos
- [x] Testes unitários de segurança, scanner base e contratos

## Phase 2: IPC e UX mínima

- [x] `start_scan` e `clean_target`
- [x] Eventos incrementais de scan e limpeza
- [x] Frontend mínimo para scan e Trash
- [x] Cancelamento de scan
- [x] Persistência de configurações
- [x] UI de confirmação para Permanent Nuke

## Phase 3: Scanners e performance

- [x] Next.js e Turborepo
- [ ] .NET, `.venv` e Docker
- [ ] Melhorar cálculo de tamanho com erros parciais explícitos
- [ ] Perfil de performance em árvores grandes
- [ ] Estratégia segura de deleção paralela

## Phase 4: Plataformas e comunidade

- [ ] Suporte macOS e Linux específico
- [ ] Documentação de scanners contribuídos
- [ ] Sistema de plugins após contrato estável
