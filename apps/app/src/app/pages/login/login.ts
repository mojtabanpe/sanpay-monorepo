import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmLabelImports } from '@sanpay/ui/label';
import { HlmSeparatorImports } from '@sanpay/ui/separator';
import { AuthService } from '../../core/auth/auth.service';

interface Feature {
  icon: 'card' | 'qr' | 'store' | 'package';
  title: string;
  description: string;
}

@Component({
  selector: 'app-login',
  imports: [
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSeparatorImports,
  ],
  templateUrl: './login.html',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly features: Feature[] = [
    {
      icon: 'card',
      title: 'کارت رفاهی مجازی',
      description:
        'مانده اعتبار و تاریخ انقضا همیشه در دسترس؛ شارژ سالیانه و مناسبتی به‌صورت خودکار.',
    },
    {
      icon: 'qr',
      title: 'خرید با کد QR',
      description:
        'کد یک‌بارمصرف با اعتبار یک دقیقه بسازید؛ فروشنده اسکن می‌کند و مبلغ خودکار از اعتبار کسر می‌شود.',
    },
    {
      icon: 'store',
      title: 'فروشگاه‌های طرف قرارداد',
      description:
        'از آجیل و میوه تا عینک و لباس ورزشی؛ خرید فقط با اعتبار رفاهی، بدون کارت بانکی.',
    },
    {
      icon: 'package',
      title: 'توزیع ارزاق',
      description:
        'سهمیه ماهانه شیر و کیک و اقلام دوره‌ای (برنج، روغن و…) با ثبت تحویل از طریق اسکن QR.',
    },
  ];

  protected readonly storeCategories = [
    'آجیل و خشکبار',
    'میوه و تره‌بار',
    'گوشت و پروتئین',
    'عینک',
    'ابزارآلات',
    'لباس ورزشی',
  ];

  protected readonly steps = [
    {
      num: '۱',
      title: 'تولید کد یک‌بارمصرف',
      description: 'از داخل اپلیکیشن کد خرید بسازید؛ اعتبار کد فقط یک دقیقه است.',
    },
    {
      num: '۲',
      title: 'اسکن توسط فروشنده',
      description: 'فروشگاه طرف قرارداد کد شما را با پنل خود اسکن می‌کند.',
    },
    {
      num: '۳',
      title: 'کسر خودکار اعتبار',
      description: 'مبلغ خرید از اعتبار کسر و تراکنش بلافاصله در سامانه ثبت می‌شود.',
    },
  ];

  protected onSubmit(personnelCodeEl: HTMLInputElement, passwordEl: HTMLInputElement): void {
    const personnelCode = personnelCodeEl.value.trim();
    const password = passwordEl.value;
    if (!personnelCode || !password) return;
    this.auth.login(personnelCode, password);
    this.router.navigate(['/home']);
  }
}
