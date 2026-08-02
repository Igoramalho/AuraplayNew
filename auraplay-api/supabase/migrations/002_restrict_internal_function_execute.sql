revoke all on function public.refresh_anime_availability_for_id(uuid)
from public, anon, authenticated;

grant execute on function public.refresh_anime_availability_for_id(uuid)
to service_role;

revoke all on function public.refresh_anime_availability()
from public, anon, authenticated;

revoke all on function public.refresh_anime_availability_from_source()
from public, anon, authenticated;

revoke all on function public.set_updated_at()
from public, anon, authenticated;
