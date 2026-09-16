import fs from 'node:fs/promises';

function replaceOnce(source,from,to,label){
  const count=source.split(from).length-1;
  if(count!==1)throw new Error(`${label}: esperado 1 trecho, encontrado ${count}.`);
  return source.replace(from,to);
}

let checks=await fs.readFile('scripts/check-regressions.mjs','utf8');

checks=replaceOnce(
  checks,
  `const attemptIdempotencyMigration=await fs.readFile('supabase/migrations/20260916142500_harden_question_attempt_idempotency.sql','utf8');`,
  `const attemptIdempotencyMigration=await fs.readFile('supabase/migrations/20260916142500_harden_question_attempt_idempotency.sql','utf8');\nconst profilePrivilegeMigration=await fs.readFile('supabase/migrations/20260916181501_restore_column_scoped_student_profile_write.sql','utf8');`,
  'leitura da migration de privilégios'
);

const anchor=`requireMarker(app,"authenticated:'Conta conectada'",'Interface voltou a chamar mera autenticação de sincronização concluída');\nif(app.includes("authenticated:'Sincronizado'"))throw new Error('Conta autenticada não pode ser apresentada como sincronizada sem confirmação de gravação.');`;
checks=replaceOnce(
  checks,
  anchor,
  `${anchor}\n\n// Supabase: provisionamento do perfil usa grants por coluna, nunca escrita ampla na tabela.\nfor(const marker of [\n  'revoke insert, update on table public.student_profiles from authenticated;',\n  'grant insert (id, user_id, is_active) on table public.student_profiles to authenticated;',\n  'grant update (is_active, updated_at) on table public.student_profiles to authenticated;'\n]) requireMarker(profilePrivilegeMigration,marker,'Contrato de privilégios por coluna do perfil ausente');\nif(/grant\\s+(?:insert\\s*,\\s*update|update\\s*,\\s*insert)\\s+on\\s+table\\s+public\\.student_profiles\\s+to\\s+authenticated/i.test(profilePrivilegeMigration))throw new Error('Migration de perfil voltou a conceder escrita ampla na tabela.');`,
  'gate de privilégios do perfil'
);

await fs.writeFile('scripts/check-regressions.mjs',checks);
console.log('Gate de privilégios por coluna do perfil adicionado.');
