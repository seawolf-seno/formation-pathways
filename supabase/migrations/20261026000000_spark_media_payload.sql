-- PR #72: media and skill keys also travel through at-home links. Preserve
-- token/consent/single-use guards and extend the bounded payload validator.
create or replace function private.spark_payload_ok(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; item jsonb; cap int; max_chars int;
begin
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 20000 then return false; end if;
  if exists (select 1 from jsonb_object_keys(p) x where x not in
    ('answers','picks','leanings','channels','genres','canTeach','growing','format','lab')) then return false; end if;
  foreach k in array array['answers','picks','leanings','channels','genres','canTeach','growing'] loop
    if not (p ? k) then continue; end if;
    if jsonb_typeof(p -> k) <> 'array' then return false; end if;
    cap := case k when 'answers' then 8 when 'picks' then 20 when 'leanings' then 10
      when 'channels' then 15 when 'genres' then 20 else 5 end;
    if jsonb_array_length(p -> k) > cap then return false; end if;
    if k in ('channels','genres','canTeach','growing') then
      max_chars := case k when 'channels' then 80 when 'genres' then 60 else 160 end;
      for item in select value from jsonb_array_elements(p -> k) loop
        if jsonb_typeof(item) <> 'string' or length(item #>> '{}') not between 1 and max_chars then return false; end if;
      end loop;
    end if;
  end loop;
  return true;
end $$;
revoke all on function private.spark_payload_ok(jsonb) from public, anon, authenticated;

-- Capability probe: no student data; the public page can wait for migration.
create function public.spark_media_ready() returns boolean
language sql immutable security invoker set search_path = '' as $$ select true $$;
revoke all on function public.spark_media_ready() from public;
grant execute on function public.spark_media_ready() to anon, authenticated;
