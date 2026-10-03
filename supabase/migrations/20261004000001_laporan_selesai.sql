-- Status selesai: user menandai laporan bulanannya rampung agar siap
-- direview. User boleh membolak-balik menunggu<->selesai; revision,
-- approved, dan catatan tetap hanya superadmin.

alter table public.monthly_reviews
  drop constraint if exists monthly_reviews_status_check;

alter table public.monthly_reviews
  add constraint monthly_reviews_status_check
  check (status in ('menunggu', 'selesai', 'revision', 'approved'));

create or replace function public.handle_monthly_reviews()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    NEW.updated_at = now();
    return NEW;
  end if;
  if not public.is_superadmin() then
    if TG_OP = 'UPDATE' then
      if NEW.catatan is distinct from OLD.catatan then
        raise exception 'Hanya superadmin yang boleh mengubah status/catatan.';
      end if;
      if NEW.status is distinct from OLD.status
        and not (OLD.status in ('menunggu', 'selesai')
          and NEW.status in ('menunggu', 'selesai')) then
        raise exception 'Hanya superadmin yang boleh mengubah status/catatan.';
      end if;
    end if;
    if TG_OP = 'INSERT' and (NEW.status <> 'menunggu' or NEW.catatan is not null) then
      raise exception 'Baris baru selalu berstatus menunggu tanpa catatan.';
    end if;
  end if;
  NEW.updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists trg_monthly_reviews on public.monthly_reviews;
create trigger trg_monthly_reviews
  before insert or update on public.monthly_reviews
  for each row execute function public.handle_monthly_reviews();
