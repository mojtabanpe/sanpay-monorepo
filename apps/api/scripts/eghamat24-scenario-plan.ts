import {
  GrsClient,
  GrsReserveRequest,
  GrsRatePlan,
} from '../src/app/tourism/providers/eghamat24/grs.types';

export const TEST_SINGLE_ROOM_ID = 412661;
export const TEST_DOUBLE_ROOM_ID = 411102;
const normalize = (name: string) =>
  name.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\s‌]/g, '');

/** Resolve the current test catalog and validate every night before placing a hold. */
export async function prepareScenarioRequest(
  client: Pick<GrsClient, 'getPropertyDetails' | 'getAvailableRooms'>,
  request: GrsReserveRequest,
): Promise<GrsReserveRequest> {
  const detail = await client.getPropertyDetails(request.property_id);
  if (!detail) throw new Error('هتل تست در کاتالوگ فعلی پیدا نشد');
  const available = await client.getAvailableRooms(
    request.property_id,
    request.check_in,
    request.check_out,
  );
  const needed = new Map<string, number>();
  const rooms = request.rooms.map((room) => {
    const expectedName =
      room.room_type_id === TEST_DOUBLE_ROOM_ID ? 'دوتخته' : 'یکتخته';
    const type =
      detail.room_type?.find((type) => type.id === room.room_type_id) ??
      detail.room_type?.find((type) => normalize(type.name) === expectedName);
    if (!type || type.out_of_service)
      throw new Error(`اتاق ${expectedName} در هتل تست فعال نیست`);
    if (room.adult_count > type.capacity + type.extra_capacity)
      throw new Error(`ظرفیت اتاق ${expectedName} برای سناریو کافی نیست`);
    const plans =
      available.find((rate) => rate.room_type_id === type.id)?.rate_plans ?? [];
    const foreign = room.guest_country_id !== 222;
    const matchesNationality = (plan: GrsRatePlan) =>
      plan.nationality === 'both' ||
      (foreign
        ? plan.nationality === 'foreign' ||
          (!plan.nationality && plan.country_id == null)
        : plan.nationality === 'domestic' ||
          (!plan.nationality &&
            (plan.country_id == null || plan.country_id === 222)));
    const nights: string[] = [];
    for (
      let date = new Date(`${request.check_in}T00:00:00Z`);
      date.toISOString().slice(0, 10) < request.check_out;
      date.setUTCDate(date.getUTCDate() + 1)
    )
      nights.push(date.toISOString().slice(0, 10));
    let missingExtraRate = false;
    const plan = plans.find(
      (plan) =>
        matchesNationality(plan) &&
        nights.every((day) => {
          const price = plan.prices?.find((price) => price.day === day);
          if (
            price &&
            room.adult_count > type.capacity &&
            !(Number(price.extend_bed_grs_rate) > 0)
          ) {
            missingExtraRate = true;
            return false;
          }
          return (
            price &&
            !price.closed &&
            Number(price.inventory) >=
              (needed.get(`${type.id}:${plan.id}`) ?? 0) + room.count
          );
        }),
    );
    if (!plan && missingExtraRate)
      throw new Error(
        'نرخ تخت اضافه در هتل تست تنظیم نشده است؛ پشتیبانی اقامت۲۴ باید نرخ نفر اضافه را برای این پلن و تاریخ‌ها تنظیم کند',
      );
    if (!plan)
      throw new Error(
        `پلن ${foreign ? 'خارجی' : 'ایرانی'} با موجودی کامل برای اتاق ${expectedName} در این تاریخ‌ها وجود ندارد`,
      );
    needed.set(
      `${type.id}:${plan.id}`,
      (needed.get(`${type.id}:${plan.id}`) ?? 0) + room.count,
    );
    return { ...room, room_type_id: type.id, rate_plan_id: plan.id };
  });
  return { ...request, rooms };
}
