import type { Request } from 'express';

export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface SessionInfo {
  userAgent: string | null;
  ipAddress: string | null;
}

export function sessionInfo(request: Request): SessionInfo {
  return {
    userAgent: request.get('user-agent')?.slice(0, 512) || null,
    ipAddress: request.ip?.slice(0, 64) || null,
  };
}

/** User-Agent یک نام توصیفی است، شناسهٔ سخت‌افزار یا اطلاعات تأییدشده نیست. */
export function deviceLabel(agent: string | null): string {
  if (!agent) return 'دستگاه ناشناس';
  const os = /iPhone|iPad|iPod/.test(agent)
    ? 'iOS'
    : /Android/.test(agent)
      ? 'Android'
      : /Windows/.test(agent)
        ? 'Windows'
        : /Macintosh|Mac OS X/.test(agent)
          ? 'macOS'
          : /Linux/.test(agent)
            ? 'Linux'
            : 'سیستم‌عامل ناشناس';
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /OPR\//.test(agent)
      ? 'Opera'
      : /Firefox\/|FxiOS\//.test(agent)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(agent)
          ? 'Chrome'
          : /Safari\//.test(agent)
            ? 'Safari'
            : 'مرورگر ناشناس';
  return `${browser} · ${os}`;
}
