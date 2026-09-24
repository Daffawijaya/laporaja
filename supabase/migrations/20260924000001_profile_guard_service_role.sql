-- LaporAja migration 000001
-- Scope: izinkan service role (kode server tepercaya seperti script seed)
-- mengubah role/bidang_id. Guard tetap berlaku penuh untuk JWT user biasa.
--
-- Cara pakai: tempel isi file ini sekali di Supabase Dashboard lalu SQL Editor.

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  if old.role is distinct from new.role
    or old.bidang_id is distinct from new.bidang_id then
    if not public.is_superadmin() then
      raise exception 'Hanya superadmin yang boleh mengubah role atau bidang.';
    end if;
  end if;
  return new;
end;
$$;
