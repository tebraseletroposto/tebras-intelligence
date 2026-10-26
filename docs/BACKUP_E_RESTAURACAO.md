# Backup e restauração

## Estratégia

| Camada | Como | Retenção sugerida |
| --- | --- | --- |
| Backup do provedor | Supabase Pro: backup diário automático (7 dias). PITR opcional (add-on pago) | 7 dias |
| Backup lógico próprio | `scripts/backup.sh` (pg_dump formato custom + SHA-256), agendado diariamente | 30 diários + 12 mensais |
| Cópia externa | Enviar os `.dump` para armazenamento de outro provedor (ex.: bucket com criptografia) | — |

O backup próprio garante independência do provedor e permite restaurar em qualquer PostgreSQL.
Arquivos de backup contêm dados pessoais: armazene-os criptografados e com acesso restrito.

## Gerar backup

```bash
DATABASE_URL="postgres://..." pnpm db:backup ./backups
# → backups/tebras_intelligence_AAAAMMDDTHHMMSSZ.dump  +  .sha256
```

Agendamento (exemplo cron, diário às 02:15):
```
15 2 * * * cd /opt/tebras-hub && DATABASE_URL=... bash scripts/backup.sh /var/backups/tebras >> /var/log/tebras-backup.log 2>&1
```

## Restaurar

> A restauração **substitui** os objetos do banco de destino. Prefira restaurar primeiro em um banco novo,
> conferir e só então redirecionar a aplicação.

```bash
TARGET_DATABASE_URL="postgres://.../tebras_intelligence_restaurado" pnpm db:restore backups/arquivo.dump
# Confirma o checksum e pede confirmação digitando SIM (ou --yes em automação)
```

Depois de restaurar: `pnpm db:migrate` (aplica migrações mais novas que o backup, se houver) e verificar `/api/health`.

## Teste de restauração (automatizado)

```bash
DATABASE_URL="postgres://.../tebras_intelligence" \
ADMIN_DATABASE_URL="postgres://.../postgres" \
bash scripts/backup-restore-test.sh
```

O script gera um backup, restaura em um banco temporário, compara a contagem de registros de todas as tabelas e
remove o banco temporário.

**Execuções registradas (22/10/2026, ambiente de desenvolvimento):**
- Banco de desenvolvimento: contagens idênticas em todas as 15 tabelas (incluindo 115 registros de auditoria).
- Banco de testes com dados (usuários, sessões, cadastros, auditoria): contagens idênticas; os triggers de
  auditoria não geraram registros duplicados durante a restauração (são criados após a carga de dados).

Recomenda-se repetir o teste **mensalmente** em produção (restaurando em banco temporário) e registrar o resultado.
