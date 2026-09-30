-- Les compteurs des plafonds du Coach. Une fonction Supabase repart de zéro à
-- chaque appel : sans cette table, aucun plafond ne tiendrait et la clé
-- DeepSeek serait à la merci de n'importe qui.
--
-- Fermée au public : RLS sans aucune règle, droits retirés à anon et
-- authenticated. Seule la fonction du Coach, avec la clé service_role, y touche.

create table if not exists public.coach_compteurs (
  cle text primary key,          -- « <période>|<compteur> », ex. « j2026-09-29|global »
  n integer not null default 0,
  expire timestamptz not null
);
create index if not exists coach_compteurs_expire on public.coach_compteurs (expire);

alter table public.coach_compteurs enable row level security;
revoke all on public.coach_compteurs from public, anon, authenticated;

-- Ajoute 1 à CHAQUE compteur, ou à aucun si l'un a déjà atteint son plafond.
-- Les lignes sont verrouillées dans l'ordre des clés : deux appels simultanés
-- ne peuvent ni dépasser un plafond ni se bloquer mutuellement.
create or replace function public.coach_prendre(cles text[], plafonds integer[], expirations timestamptz[])
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  i integer;
  courant integer;
begin
  if array_length(cles, 1) is null
     or array_length(cles, 1) <> array_length(plafonds, 1)
     or array_length(cles, 1) <> array_length(expirations, 1) then
    raise exception 'coach_prendre : tableaux de tailles différentes';
  end if;

  delete from coach_compteurs where expire < now();

  for i in select g from generate_subscripts(cles, 1) g order by cles[g] loop
    insert into coach_compteurs (cle, n, expire) values (cles[i], 0, expirations[i])
      on conflict (cle) do nothing;
    select n into courant from coach_compteurs where cle = cles[i] for update;
    if courant >= plafonds[i] then
      return false;
    end if;
  end loop;

  update coach_compteurs set n = n + 1 where cle = any (cles);
  return true;
end;
$$;

create or replace function public.coach_lire(cle_lue text)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce((select n from coach_compteurs where cle = cle_lue and expire >= now()), 0);
$$;

revoke all on function public.coach_prendre(text[], integer[], timestamptz[]) from public, anon, authenticated;
revoke all on function public.coach_lire(text) from public, anon, authenticated;
grant all on public.coach_compteurs to service_role;
grant execute on function public.coach_prendre(text[], integer[], timestamptz[]) to service_role;
grant execute on function public.coach_lire(text) to service_role;
