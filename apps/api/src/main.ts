/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { safeEndpoint, tomanLog } from './app/toman/toman-log';
import { tomanCredentialsFromEnv } from './app/toman/toman-oauth';
import { GatewayRegistry } from './app/upg/gateways/gateway.registry';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      'http://localhost:4200', // اپ کارمند
      'http://localhost:4300', // داشبورد مدیریت
      'http://localhost:4400', // پنل فروشگاه
    ],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 6500;
  await app.listen(port);
  tomanLog('configuration.corporate', {
    component: 'corporate',
    mode: process.env.TOMAN_MODE ?? 'mock',
    enabled: process.env.TOMAN_SETTLEMENTS_ENABLED?.toLowerCase() === 'true',
    apiUrl: safeEndpoint(
      process.env.TOMAN_API_URL || 'https://dbank-staging.qcluster.org/api/v1',
    ),
    authUrl: safeEndpoint(
      process.env.TOMAN_AUTH_URL || 'https://auth.qbitpay.org/oauth2/token/',
    ),
    credentialsConfigured: !!tomanCredentialsFromEnv('TOMAN_'),
  });
  tomanLog('configuration.ipg', {
    component: 'ipg',
    mode: process.env.TOMAN_IPG_MODE ?? 'mock',
    enabled: app.get(GatewayRegistry).isEnabled('toman'),
    apiUrl: safeEndpoint(
      process.env.TOMAN_IPG_URL || 'https://ipg-staging.toman.ir',
    ),
    authUrl: safeEndpoint(
      process.env.TOMAN_IPG_AUTH_URL ||
        'https://auth.qbitpay.org/oauth2/token/',
    ),
    credentialsConfigured: !!(
      tomanCredentialsFromEnv('TOMAN_IPG_') ?? tomanCredentialsFromEnv('TOMAN_')
    ),
  });
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
