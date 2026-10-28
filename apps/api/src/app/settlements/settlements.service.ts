import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash, randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { HotelBooking, Payment, Store } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  TomanClientService,
  TomanTransferItemInput,
} from './toman-client.service';

const IRAN_TIME_ZONE = 'Asia/Tehran';
const SUCCESS_STATUS = 6;
const FINAL_FAILURE_STATUSES = new Set([8, 9, 10, 11, 20, 30, 40, 41]);

type Group = {
  type: 'STORE' | 'HOTELYAR' | 'EGHAMAT24';
  key: string;
  storeId?: string;
  name: string;
  iban: string;
  amount: bigint;
  paymentIds: string[];
  bookingIds: string[];
};
type BeneficiaryType = Group['type'];

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly toman: TomanClientService,
    private readonly jwt: JwtService,
  ) {}

  /** هر روز ساعت ۰۲:۰۰ به وقت تهران؛ runKey جلوی اجرای دوباره در چند replica را می‌گیرد. */
  @Cron('0 2 * * *', { timeZone: IRAN_TIME_ZONE })
  async scheduledSettlement() {
    if (!this.enabled()) return;
    const types: BeneficiaryType[] = ['STORE'];
    const weekday = this.tehranWeekday();
    if (weekday === 0) types.push('HOTELYAR', 'EGHAMAT24');
    if (weekday === 2) types.push('EGHAMAT24');
    await this.runWithKey(this.tehranDateKey(), types);
  }

  /** وضعیت انتقال‌ها ناهمگام است؛ تا نهایی‌شدن هر ۱۵ دقیقه تطبیق می‌دهیم. */
  @Cron('*/15 * * * *')
  async scheduledReconciliation() {
    if (!this.enabled()) return;
    await this.reconcileOpenBatches();
  }

  async runNow() {
    return this.runWithKey(this.tehranDateKey(), [
      'STORE',
      'HOTELYAR',
      'EGHAMAT24',
    ]);
  }

  async stores() {
    return this.prisma.store.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async previewStore(storeId: string) {
    const snapshot = await this.storeSnapshot(this.prisma, storeId);
    const requestId = randomUUID();
    const previewToken = await this.jwt.signAsync(
      {
        purpose: 'store-settlement-preview',
        storeId,
        requestId,
        snapshot: snapshot.hash,
        environment: this.environmentHash(),
      },
      { expiresIn: '5m' },
    );
    return {
      storeId,
      storeName: snapshot.store.name,
      beneficiaryName: snapshot.group.name,
      destinationIban: snapshot.group.iban,
      paymentCount: snapshot.payments.length,
      totalAmount: Number(snapshot.group.amount),
      previewToken,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      mode: this.toman.isLive() ? 'live' : 'mock',
      apiUrl:
        process.env.TOMAN_API_URL ||
        'https://dbank-staging.qcluster.org/api/v1',
    };
  }

  /** A signed snapshot and serializable claim bind approval to exactly one store. */
  async runManual(storeId: string, previewToken: string) {
    let approval: {
      purpose: string;
      storeId: string;
      requestId: string;
      snapshot: string;
      environment: string;
    };
    try {
      approval = await this.jwt.verifyAsync(previewToken);
    } catch {
      throw new BadRequestException(
        'پیش‌نمایش معتبر نیست یا منقضی شده؛ دوباره پیش‌نمایش بگیرید.',
      );
    }
    if (
      approval.purpose !== 'store-settlement-preview' ||
      approval.storeId !== storeId ||
      !approval.requestId ||
      approval.environment !== this.environmentHash()
    ) {
      throw new BadRequestException(
        'پیش‌نمایش با فروشگاه یا تنظیمات فعلی مطابقت ندارد.',
      );
    }
    const runKey = `store-manual-${approval.requestId}`;
    let result: { id: string; created: boolean };
    try {
      result = await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.settlementBatch.findUnique({
            where: { runKey },
          });
          if (existing) return { id: existing.id, created: false };
          const snapshot = await this.storeSnapshot(tx, storeId);
          if (snapshot.hash !== approval.snapshot) {
            throw new ConflictException(
              'مبلغ یا حساب مقصد تغییر کرده است؛ دوباره پیش‌نمایش بگیرید.',
            );
          }
          const batch = await tx.settlementBatch.create({
            data: { runKey, totalAmount: snapshot.group.amount, itemCount: 1 },
          });
          const item = await tx.settlementItem.create({
            data: {
              batchId: batch.id,
              beneficiaryType: 'STORE',
              beneficiaryKey: storeId,
              storeId,
              beneficiaryName: snapshot.group.name,
              destinationIban: snapshot.group.iban,
              amount: snapshot.group.amount,
              trackerId: `sp-${randomUUID().replace(/-/g, '')}`,
            },
          });
          const claimed = await tx.payment.updateMany({
            where: {
              id: { in: snapshot.payments.map((payment) => payment.id) },
              storeId,
              settlementItemId: null,
              settledAt: null,
            },
            data: { settlementItemId: item.id },
          });
          if (claimed.count !== snapshot.payments.length) {
            throw new ConflictException(
              'این خریدها در حال تسویه هستند؛ فهرست را تازه کنید.',
            );
          }
          return { id: batch.id, created: true };
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      const existing = await this.prisma.settlementBatch.findUnique({
        where: { runKey },
      });
      if (existing) return this.one(existing.id);
      if (
        ['P2034', 'P2002'].includes((error as { code?: string }).code ?? '')
      ) {
        throw new ConflictException(
          'تسویهٔ هم‌زمان ثبت شد؛ فهرست را تازه کنید.',
        );
      }
      throw error;
    }
    // Replaying the same approval only reads its batch; it never sends again.
    if (result.created) {
      await this.submitBatch(result.id);
      await this.reconcileBatch(result.id);
    }
    return this.one(result.id);
  }

  private environmentHash() {
    return createHash('sha256')
      .update(
        JSON.stringify([
          process.env.TOMAN_MODE,
          process.env.TOMAN_API_URL,
          process.env.TOMAN_AUTH_URL,
          process.env.TOMAN_USERNAME,
          process.env.TOMAN_CLIENT_ID,
        ]),
      )
      .digest('hex');
  }

  private async storeSnapshot(
    db: Pick<PrismaService, 'store' | 'payment'>,
    storeId: string,
  ) {
    const store = await db.store.findFirst({
      where: { id: storeId, isActive: true, deletedAt: null },
    });
    if (!store) throw new BadRequestException('فروشگاه فعال پیدا نشد.');
    if (!this.validIban(store.settlementIban))
      throw new BadRequestException('شبای تسویهٔ فروشگاه معتبر نیست.');
    const payments = await db.payment.findMany({
      where: { storeId, settlementItemId: null, settledAt: null },
      orderBy: { id: 'asc' },
      include: { store: true },
    });
    if (!payments.length)
      throw new BadRequestException('این فروشگاه خرید تسویه‌نشده ندارد.');
    const group = this.groups(payments, [])[0];
    this.toSafeRial(group.amount);
    const hash = createHash('sha256')
      .update(
        JSON.stringify([
          storeId,
          group.name,
          group.iban,
          payments.map((payment) => [payment.id, payment.amount.toString()]),
        ]),
      )
      .digest('hex');
    return { store, payments, group, hash };
  }

  private async runWithKey(runKey: string, types: BeneficiaryType[]) {
    const batch = await this.prepareBatch(runKey, types);
    if (batch.itemCount === 0 || batch.status === 'COMPLETED')
      return this.one(batch.id);
    if (!batch.submittedAt) await this.submitBatch(batch.id);
    await this.reconcileBatch(batch.id);
    return this.one(batch.id);
  }

  async list() {
    const batches = await this.prisma.settlementBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    return batches.map((batch) => this.serialize(batch));
  }

  async one(id: string) {
    const batch = await this.prisma.settlementBatch.findUniqueOrThrow({
      where: { id },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    return this.serialize(batch);
  }

  async reconcileOpenBatches() {
    const batches = await this.prisma.settlementBatch.findMany({
      where: {
        OR: [
          { status: { in: ['SUBMITTED', 'PROCESSING'] } },
          {
            status: 'FAILED',
            submittedAt: null,
            tomanBatchUuid: { not: null },
          },
        ],
      },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        tomanBatchUuid: true,
      },
    });
    for (const batch of batches) {
      try {
        if (
          batch.status === 'FAILED' &&
          !batch.submittedAt &&
          batch.tomanBatchUuid
        ) {
          const remote = await this.toman.getBatch(batch.tomanBatchUuid);
          if (remote.status === 1) {
            await this.submitBatch(batch.id);
          } else if ([2, 3, 4].includes(remote.status)) {
            await this.prisma.settlementBatch.update({
              where: { id: batch.id },
              data: {
                status: 'SUBMITTED',
                submittedAt: new Date(),
                error: null,
              },
            });
          } else {
            continue;
          }
        }
        await this.reconcileBatch(batch.id);
      } catch (error) {
        this.logger.error(`Reconcile ${batch.id} failed`, error);
      }
    }
    return { checked: batches.length };
  }

  async reconcileBatch(batchId: string) {
    const batch = await this.prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { items: true },
    });
    if (!batch.tomanBatchUuid) return this.one(batchId);

    const remoteBatch = await this.toman.getBatch(batch.tomanBatchUuid);
    if (remoteBatch.status === -2 || remoteBatch.status === -3) {
      await this.prisma.settlementBatch.update({
        where: { id: batchId },
        data: {
          status: 'FAILED',
          error: `Toman batch status: ${remoteBatch.status}`,
        },
      });
      return this.one(batchId);
    }

    // An uncommitted batch must stay failed/building during a read-only inquiry.
    if (!batch.submittedAt && remoteBatch.status === 1)
      return this.one(batchId);

    for (const item of batch.items.filter(
      (row) => !['SUCCEEDED', 'FAILED'].includes(row.status),
    )) {
      try {
        const transfer = await this.toman.getTransfer(item.trackerId);
        if (transfer.status === SUCCESS_STATUS) {
          const settledAt = new Date();
          await this.prisma.$transaction([
            this.prisma.settlementItem.update({
              where: { id: item.id },
              data: {
                status: 'SUCCEEDED',
                tomanStatus: transfer.status,
                tomanTransferUuid: transfer.uuid,
                followUpCode: transfer.follow_up_code,
                receiptLink: transfer.receipt_link,
                settledAt,
                error: null,
              },
            }),
            this.prisma.payment.updateMany({
              where: { settlementItemId: item.id, settledAt: null },
              data: { settledAt },
            }),
            this.prisma.hotelBooking.updateMany({
              where: { settlementItemId: item.id, settledAt: null },
              data: { settledAt, settlementBatchId: batchId },
            }),
          ]);
        } else if (FINAL_FAILURE_STATUSES.has(transfer.status)) {
          await this.prisma.settlementItem.update({
            where: { id: item.id },
            data: {
              status: 'FAILED',
              tomanStatus: transfer.status,
              tomanTransferUuid: transfer.uuid,
              error: `Toman transfer status: ${transfer.status}`,
            },
          });
        } else {
          await this.prisma.settlementItem.update({
            where: { id: item.id },
            data: {
              status: transfer.status === 12 ? 'UNKNOWN' : 'PROCESSING',
              error: null,
              tomanStatus: transfer.status,
              tomanTransferUuid: transfer.uuid,
            },
          });
        }
      } catch (error) {
        this.logger.warn(
          `Transfer ${item.trackerId} is not queryable yet: ${this.message(error)}`,
        );
        await this.prisma.settlementItem.updateMany({
          where: { id: item.id, status: { notIn: ['SUCCEEDED', 'FAILED'] } },
          data: {
            error: 'استعلام وضعیت انتقال ناموفق بود؛ دوباره استعلام کنید.',
          },
        });
      }
    }
    await this.refreshBatchStatus(batchId);
    return this.one(batchId);
  }

  async retryFailedItem(itemId: string) {
    const previous = await this.prisma.settlementItem.findUnique({
      where: { id: itemId },
      include: {
        payments: { select: { id: true } },
        hotelBookings: { select: { id: true } },
      },
    });
    if (!previous || previous.status !== 'FAILED') {
      throw new BadRequestException(
        'فقط تسویهٔ ناموفق نهایی قابل تلاش مجدد است',
      );
    }

    const runKey = `retry-${previous.id}`;
    const existing = await this.prisma.settlementBatch.findUnique({
      where: { runKey },
    });
    if (existing) return this.one(existing.id);
    const batch = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.settlementBatch.create({
          data: { runKey, totalAmount: previous.amount, itemCount: 1 },
        });
        const id = randomUUID();
        const item = await tx.settlementItem.create({
          data: {
            id,
            batchId: created.id,
            beneficiaryType: previous.beneficiaryType,
            beneficiaryKey: previous.beneficiaryKey,
            storeId: previous.storeId,
            beneficiaryName: previous.beneficiaryName,
            destinationIban: previous.destinationIban,
            amount: previous.amount,
            trackerId: `sp-${id.replace(/-/g, '')}`,
            retryOfId: previous.id,
          },
        });
        if (previous.payments.length) {
          await tx.payment.updateMany({
            where: { id: { in: previous.payments.map((row) => row.id) } },
            data: { settlementItemId: item.id },
          });
        }
        if (previous.hotelBookings.length) {
          await tx.hotelBooking.updateMany({
            where: { id: { in: previous.hotelBookings.map((row) => row.id) } },
            data: { settlementItemId: item.id, settlementBatchId: created.id },
          });
        }
        return created;
      })
      .catch(async (error: unknown) => {
        if ((error as { code?: string }).code === 'P2002') {
          throw new ConflictException(
            'تلاش مجدد قبلاً ثبت شده است؛ فهرست را تازه کنید.',
          );
        }
        throw error;
      });
    await this.submitBatch(batch.id);
    await this.reconcileBatch(batch.id);
    return this.one(batch.id);
  }

  private async prepareBatch(runKey: string, types: BeneficiaryType[]) {
    const existing = await this.prisma.settlementBatch.findUnique({
      where: { runKey },
    });
    if (existing) return existing;

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const duplicate = await tx.settlementBatch.findUnique({
            where: { runKey },
          });
          if (duplicate) return duplicate;
          const payments = await tx.payment.findMany({
            where: types.includes('STORE')
              ? { settlementItemId: null }
              : { id: { in: [] } },
            include: { store: true },
            orderBy: { createdAt: 'asc' },
          });
          const providerTypes = [
            ...(types.includes('HOTELYAR') ? ['hy' as const] : []),
            ...(types.includes('EGHAMAT24') ? ['eg' as const] : []),
          ];
          const bookings = await tx.hotelBooking.findMany({
            where: {
              provider: { in: providerTypes },
              settlementItemId: null,
              payable: { gt: 0 },
              status: { in: ['CONFIRMED', 'CANCELED'] },
            },
            orderBy: { createdAt: 'asc' },
          });
          const groups = this.groups(payments, bookings);
          const batch = await tx.settlementBatch.create({ data: { runKey } });
          let total = 0n;
          for (const group of groups) {
            const id = randomUUID();
            const item = await tx.settlementItem.create({
              data: {
                id,
                batchId: batch.id,
                beneficiaryType: group.type,
                beneficiaryKey: group.key,
                storeId: group.storeId,
                beneficiaryName: group.name,
                destinationIban: group.iban,
                amount: group.amount,
                trackerId: `sp-${id.replace(/-/g, '')}`,
              },
            });
            if (group.paymentIds.length) {
              await tx.payment.updateMany({
                where: { id: { in: group.paymentIds }, settlementItemId: null },
                data: { settlementItemId: item.id },
              });
            }
            if (group.bookingIds.length) {
              await tx.hotelBooking.updateMany({
                where: { id: { in: group.bookingIds }, settlementItemId: null },
                data: {
                  settlementItemId: item.id,
                  settlementBatchId: batch.id,
                },
              });
            }
            total += group.amount;
          }
          return tx.settlementBatch.update({
            where: { id: batch.id },
            data: groups.length
              ? { totalAmount: total, itemCount: groups.length }
              : { status: 'COMPLETED', completedAt: new Date() },
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      const raced = await this.prisma.settlementBatch.findUnique({
        where: { runKey },
      });
      if (raced) return raced;
      throw error;
    }
  }

  private groups(
    payments: Array<Payment & { store: Store }>,
    bookings: HotelBooking[],
  ): Group[] {
    const map = new Map<string, Group>();
    for (const payment of payments) {
      const iban = this.validIban(payment.store.settlementIban);
      if (!iban) continue;
      const key = `STORE:${payment.storeId}`;
      const group: Group = map.get(key) ?? {
        type: 'STORE' as const,
        key: payment.storeId,
        storeId: payment.storeId,
        name: payment.store.settlementOwnerName || payment.store.name,
        iban,
        amount: 0n,
        paymentIds: [],
        bookingIds: [],
      };
      group.amount += payment.amount;
      group.paymentIds.push(payment.id);
      map.set(key, group);
    }
    for (const booking of bookings) {
      const isHotelyar = booking.provider === 'hy';
      const iban = this.validIban(
        process.env[
          isHotelyar ? 'TOMAN_HOTELYAR_IBAN' : 'TOMAN_EGHAMAT24_IBAN'
        ],
      );
      if (!iban) continue;
      const type = isHotelyar ? 'HOTELYAR' : 'EGHAMAT24';
      const key = `${type}:${booking.provider}`;
      const group: Group = map.get(key) ?? {
        type,
        key: booking.provider,
        name:
          process.env[
            isHotelyar ? 'TOMAN_HOTELYAR_NAME' : 'TOMAN_EGHAMAT24_NAME'
          ] || (isHotelyar ? 'هتل‌یار' : 'اقامت۲۴'),
        iban,
        amount: 0n,
        paymentIds: [],
        bookingIds: [],
      };
      group.amount += booking.payable;
      group.bookingIds.push(booking.id);
      map.set(key, group);
    }
    return [...map.values()];
  }

  private async submitBatch(batchId: string) {
    const batch = await this.prisma.settlementBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { items: true },
    });
    try {
      let tomanBatchUuid = batch.tomanBatchUuid;
      if (!tomanBatchUuid) {
        const created = await this.toman.createBatch(
          this.toSafeRial(batch.totalAmount),
          batch.itemCount,
        );
        tomanBatchUuid = created.uuid;
        await this.prisma.settlementBatch.update({
          where: { id: batchId },
          data: { tomanBatchUuid, error: null },
        });
      }
      const remoteItems = await this.toman.listBatchItems(tomanBatchUuid);
      const remoteByTracker = new Map(
        remoteItems.map((item) => [item.tracker_id, item]),
      );
      for (const item of batch.items.filter((row) => !row.tomanItemUuid)) {
        const remote = remoteByTracker.get(item.trackerId);
        if (remote?.uuid) {
          await this.prisma.settlementItem.update({
            where: { id: item.id },
            data: {
              tomanItemUuid: remote.uuid,
              status: 'SUBMITTED',
              submittedAt: new Date(),
            },
          });
        }
      }
      const pending = batch.items.filter(
        (item) => !item.tomanItemUuid && !remoteByTracker.has(item.trackerId),
      );
      for (let offset = 0; offset < pending.length; offset += 1_000) {
        const chunk = pending.slice(offset, offset + 1_000);
        const inputs: TomanTransferItemInput[] = chunk.map((item) => ({
          amount: this.toSafeRial(item.amount),
          iban_destination: item.destinationIban,
          tracker_id: item.trackerId,
          description: `تسویه صنعت‌پی ${batch.runKey}`,
          reason: 6,
        }));
        const added = await this.toman.addItems(tomanBatchUuid, inputs);
        for (const item of chunk) {
          const remote = added.find((row) => row.tracker_id === item.trackerId);
          if (!remote?.uuid)
            throw new Error(`Toman did not return item ${item.trackerId}`);
          await this.prisma.settlementItem.update({
            where: { id: item.id },
            data: {
              tomanItemUuid: remote.uuid,
              status: 'SUBMITTED',
              submittedAt: new Date(),
            },
          });
        }
      }
      await this.toman.commitBatch(tomanBatchUuid);
      await this.prisma.settlementBatch.update({
        where: { id: batchId },
        data: { status: 'SUBMITTED', submittedAt: new Date(), error: null },
      });
    } catch (error) {
      await this.prisma.settlementBatch.update({
        where: { id: batchId },
        data: { status: 'FAILED', error: this.message(error) },
      });
      throw error;
    }
  }

  private async refreshBatchStatus(batchId: string) {
    const items = await this.prisma.settlementItem.findMany({
      where: { batchId },
    });
    const succeeded = items.filter(
      (item) => item.status === 'SUCCEEDED',
    ).length;
    const failed = items.filter((item) => item.status === 'FAILED').length;
    const complete = succeeded + failed === items.length;
    await this.prisma.settlementBatch.update({
      where: { id: batchId },
      data: {
        status: complete
          ? failed === 0
            ? 'COMPLETED'
            : succeeded === 0
              ? 'FAILED'
              : 'PARTIAL_FAILED'
          : 'PROCESSING',
        completedAt: complete ? new Date() : null,
      },
    });
  }

  private toSafeRial(toman: bigint): number {
    const rial = toman * 10n;
    if (rial <= 0n || rial > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('مبلغ تسویه خارج از بازهٔ امن عددی است');
    }
    return Number(rial);
  }

  private validIban(value?: string | null): string | null {
    const normalized = value?.replace(/\s/g, '').toUpperCase();
    return normalized && /^IR\d{24}$/.test(normalized) ? normalized : null;
  }

  private enabled() {
    return process.env.TOMAN_SETTLEMENTS_ENABLED?.toLowerCase() === 'true';
  }

  private tehranDateKey() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: IRAN_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts();
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }

  private tehranWeekday(): number {
    const label = new Intl.DateTimeFormat('en-US', {
      timeZone: IRAN_TIME_ZONE,
      weekday: 'short',
    }).format(new Date());
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label);
  }

  private serialize<T>(value: T): T {
    return JSON.parse(
      JSON.stringify(value, (_key, item) =>
        typeof item === 'bigint' ? Number(item) : item,
      ),
    ) as T;
  }

  private message(error: unknown) {
    return error instanceof Error
      ? error.message.slice(0, 2_000)
      : String(error).slice(0, 2_000);
  }
}
