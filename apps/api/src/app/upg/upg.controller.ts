import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Request, Response } from 'express';
import { JwtPayload } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CardRefundService } from './card-refund.service';
import { GatewayRegistry } from './gateways/gateway.registry';
import { UpgService } from './upg.service';

class UpgLineDto {
  @IsUUID()
  allocationId!: string;

  /** تومان */
  @IsInt({ message: 'مبلغ باید عدد صحیح باشد' })
  @Min(0)
  amount!: number;
}

class UpgPayDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => UpgLineDto)
  lines!: UpgLineDto[];
}

class CardRefundDto {
  /** تومان */
  @IsInt({ message: 'مبلغ باید عدد صحیح باشد' })
  @Min(1, { message: 'مبلغ بازگشت باید بیشتر از صفر باشد' })
  amount!: number;
}

class MockTomanOutcomeDto {
  @IsIn(['success', 'failed'])
  outcome!: 'success' | 'failed';
}

/** صفحهٔ UPG در اپ کارمند */
@Controller('upg/intents')
@UseGuards(JwtAuthGuard)
export class UpgController {
  constructor(private readonly upg: UpgService) {}

  @Get(':id')
  view(
    @Req() request: Request & { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.upg.view(request.user.sub, id);
  }

  @Post(':id/pay')
  pay(
    @Req() request: Request & { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpgPayDto,
  ) {
    return this.upg.pay(request.user.sub, id, dto.lines);
  }

  @Post(':id/cancel')
  cancel(
    @Req() request: Request & { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.upg.cancel(request.user.sub, id);
  }
}

/**
 * «بازگشت پول» پروفایل — ماندهٔ پرداخت‌های کارتی قبلی به کارت برمی‌گردد.
 * کیف پول شخصی هرگز به‌عنوان کیف پول نشان داده نمی‌شود؛ فقط همین مانده.
 */
@Controller('upg/card-refunds')
@UseGuards(JwtAuthGuard)
export class UpgCardRefundController {
  constructor(private readonly refunds: CardRefundService) {}

  @Get()
  summary(@Req() request: Request & { user: JwtPayload }) {
    return this.refunds.summary(request.user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  request(
    @Req() request: Request & { user: JwtPayload },
    @Body() dto: CardRefundDto,
  ) {
    return this.refunds.request(request.user.sub, dto.amount);
  }
}

/**
 * بازگشت کاربر از درگاه — بدون JWT، چون مرورگر کاربر (نه سرور درگاه) با یک
 * POST فرم به این آدرس برمی‌گردد. بعد از verify با 303 به صفحهٔ نتیجهٔ اپ
 * هدایت می‌شود.
 */
@Controller('upg')
export class UpgCallbackController {
  constructor(
    private readonly upg: UpgService,
    private readonly gateways: GatewayRegistry,
  ) {}

  @Post('callback/:gateway')
  async callbackPost(
    @Param('gateway') gateway: string,
    @Body() body: Record<string, unknown>,
    @Res() response: Response,
  ) {
    response.redirect(303, await this.upg.handleCallback(gateway, body ?? {}));
  }

  /** بعضی درگاه‌ها کاربر را با GET برمی‌گردانند */
  @Get('callback/:gateway')
  async callbackGet(
    @Param('gateway') gateway: string,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    response.redirect(303, await this.upg.handleCallback(gateway, query ?? {}));
  }

  /**
   * صفحهٔ «بانک» شبیه‌ساز تومان (`TOMAN_IPG_MODE` ≠ live) — جای
   * `/payments/:uuid/redirect` تومان. فقط وقتی toman در UPG_GATEWAYS فعال است.
   */
  @Get('mock-toman/:uuid')
  mockTomanPage(@Param('uuid') uuid: string, @Res() response: Response) {
    const payment = this.mockToman()?.open(uuid);
    if (!payment) throw new NotFoundException();
    const form = (outcome: string, label: string, primary: boolean) => `
      <form method="post" action="${escapeHtml(`${this.upg.publicUrl}/api/upg/mock-toman/${encodeURIComponent(uuid)}`)}">
        <input type="hidden" name="outcome" value="${outcome}">
        <button class="${primary ? 'primary' : ''}">${label}</button>
      </form>`;
    response
      .type('html')
      .send(
        mockPage(
          'درگاه تومان (شبیه‌ساز)',
          'این صفحه جای بانک را می‌گیرد و پولی جابه‌جا نمی‌کند.',
          payment.amount,
          `${form('success', 'پرداخت موفق', true)}${form('failed', 'انصراف / پرداخت ناموفق', false)}`,
        ),
      );
  }

  /** مثل تومان: کاربر با POST فرم (x-www-form-urlencoded) به callback برمی‌گردد */
  @Post('mock-toman/:uuid')
  mockTomanComplete(
    @Param('uuid') uuid: string,
    @Body() dto: MockTomanOutcomeDto,
    @Res() response: Response,
  ) {
    const done = this.mockToman()?.complete(uuid, dto.outcome);
    if (!done) throw new NotFoundException();
    const fields = Object.entries(done.fields)
      .map(
        ([name, value]) =>
          `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
      )
      .join('');
    response.type('html').send(`<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>بازگشت به سن‌پی</title></head>
<body onload="document.forms[0].submit()">
<form method="post" action="${escapeHtml(done.callbackUrl)}">${fields}
<noscript><button>بازگشت به سن‌پی</button></noscript></form>
</body></html>`);
  }

  private mockToman() {
    const gateway = this.gateways.toman;
    return this.gateways.isEnabled(gateway.key) ? gateway.mock : null;
  }

  /** صفحهٔ درگاه آزمایشی — فقط وقتی mock در UPG_GATEWAYS فعال است */
  @Get('mock-gateway/:ref')
  mockGateway(
    @Param('ref') ref: string,
    @Query('tracker_id') trackerId: string,
    @Query('amount') amount: string,
    @Query('callback') callback: string,
    @Res() response: Response,
  ) {
    if (!this.gateways.isEnabled('mock') || !callback?.startsWith(`${this.upg.publicUrl}/`)) {
      throw new NotFoundException();
    }
    const field = (name: string, value: string) =>
      `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
    const form = (status: string, label: string, primary: boolean) => `
      <form method="post" action="${escapeHtml(callback)}">
        ${field('tracker_id', trackerId ?? '')}
        ${field('uuid', ref)}
        ${field('status', status)}
        <button class="${primary ? 'primary' : ''}">${label}</button>
      </form>`;
    response
      .type('html')
      .send(
        mockPage(
          'درگاه پرداخت آزمایشی',
          'این صفحه فقط برای توسعه است و پولی جابه‌جا نمی‌کند.',
          Number(amount) || 0,
          `${form('success', 'پرداخت موفق', true)}${form('failed', 'انصراف / پرداخت ناموفق', false)}`,
        ),
      );
  }
}

/** صفحهٔ «بانک» درگاه‌های آزمایشی */
function mockPage(
  title: string,
  note: string,
  amountRial: number,
  forms: string,
): string {
  const rial = new Intl.NumberFormat('fa-IR').format(amountRial);
  return `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; background: #F2F4F7; color: #111827;
         display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 16px; }
  main { background: #fff; border-radius: 22px; padding: 24px; width: 100%; max-width: 360px;
         box-shadow: 0 1px 2px rgba(0,0,0,.06); }
  h1 { font-size: 1.1rem; margin: 0 0 4px } p { color: #5E6470; font-size: .85rem; margin: 0 0 20px }
  strong { display: block; font-size: 1.4rem; margin-bottom: 20px }
  button { width: 100%; min-height: 44px; border-radius: 14px; border: 1px solid #D0D5DD;
           background: #fff; font: inherit; margin-top: 8px; cursor: pointer }
  .primary { background: #0E4C94; color: #fff; border-color: #0E4C94 }
</style></head>
<body><main>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(note)}</p>
  <strong>${rial} ریال</strong>
  ${forms}
</main></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
