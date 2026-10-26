import "./env";
import { closeDb, getDb } from "../src/db/client";
import { seedDefaults } from "../src/db/seed-core";

seedDefaults(getDb())
  .then((r) => console.log(`Sincronizado: ${r.permissions} permissões e ${r.roles} perfis padrão.`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
