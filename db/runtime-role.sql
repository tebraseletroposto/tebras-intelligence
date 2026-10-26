-- Usuário de banco para a APLICAÇÃO em produção (privilégio mínimo).
-- As migrações rodam com o usuário dono do schema; a aplicação usa este usuário restrito,
-- que não pode alterar estrutura nem desabilitar triggers de auditoria.
-- Substitua a senha e execute como administrador do banco.

CREATE ROLE tebras_app LOGIN PASSWORD 'TROQUE-POR-UMA-SENHA-FORTE';
GRANT CONNECT ON DATABASE tebras_intelligence TO tebras_app;
GRANT USAGE ON SCHEMA public TO tebras_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tebras_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tebras_app;
-- A trilha de auditoria só aceita inserção e leitura:
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM tebras_app;
-- Novas tabelas criadas pelo dono (migrações) herdam os privilégios:
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tebras_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO tebras_app;
