-- Les comptes testeurs : leur iPhone tient un journal de ce que Vethos demande
-- à iOS (blocage, rappels), pour diagnostiquer ce qui ne se voit que sur un
-- vrai appareil. Pour tous les autres comptes, le journal n'écrit rien.
--
-- Une ligne = un testeur. On l'ajoute depuis le tableau de bord (Table Editor),
-- jamais depuis l'app : chacun peut seulement LIRE sa propre ligne (RLS).

create table if not exists public.testeurs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ajoute_le timestamptz not null default now()
);

alter table public.testeurs enable row level security;

revoke all on public.testeurs from public, anon, authenticated;
grant select on public.testeurs to authenticated;
grant all on public.testeurs to service_role;

drop policy if exists "lire la sienne" on public.testeurs;
create policy "lire la sienne" on public.testeurs
  for select to authenticated using ((select auth.uid()) = user_id);
