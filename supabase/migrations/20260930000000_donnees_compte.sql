-- La sauvegarde en ligne des données de chaque compte : engagements,
-- réglages, séances. Une ligne par compte et par magasin, le contenu tel que
-- l'app le range sur le téléphone.
--
-- Chacun ne voit, n'écrit et ne supprime que SES lignes (RLS). Supprimer le
-- compte supprime ses lignes (cascade).

create table if not exists public.donnees_compte (
  user_id uuid not null references auth.users (id) on delete cascade,
  magasin text not null check (magasin in ('vethos:donnees:v1', 'vethos:seances:v1')),
  contenu jsonb not null,
  -- L'heure de la modification, posée par l'appareil qui l'a faite : c'est elle
  -- qu'on compare pour garder la version la plus récente.
  maj timestamptz not null,
  primary key (user_id, magasin)
);

alter table public.donnees_compte enable row level security;

revoke all on public.donnees_compte from public, anon;
grant select, insert, update, delete on public.donnees_compte to authenticated;
grant all on public.donnees_compte to service_role;

drop policy if exists "lire les siennes" on public.donnees_compte;
drop policy if exists "ajouter les siennes" on public.donnees_compte;
drop policy if exists "modifier les siennes" on public.donnees_compte;
drop policy if exists "supprimer les siennes" on public.donnees_compte;

create policy "lire les siennes" on public.donnees_compte
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "ajouter les siennes" on public.donnees_compte
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "modifier les siennes" on public.donnees_compte
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "supprimer les siennes" on public.donnees_compte
  for delete to authenticated using ((select auth.uid()) = user_id);
