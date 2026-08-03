import { AdminPaymentRow } from '@sanpay/models';

interface PaymentWithRelations {
  id: string;
  receiptNo: string;
  amount: bigint;
  createdAt: Date;
  employee: { id: string; firstName: string; lastName: string; personnelCode: string };
  store: { id: string; name: string; code: string };
  transactions: Array<{
    amount: bigint;
    allocation: { definition: { name: string; icon: string | null } };
  }>;
}

/** نمای یک پرداخت برای داشبورد — شامل تفکیک کیف‌پول‌ها */
export function toPaymentRow(payment: PaymentWithRelations): AdminPaymentRow {
  return {
    id: payment.id,
    receiptNo: payment.receiptNo,
    amount: Number(payment.amount),
    createdAt: payment.createdAt.toISOString(),
    employee: {
      id: payment.employee.id,
      name: `${payment.employee.firstName} ${payment.employee.lastName}`,
      personnelCode: payment.employee.personnelCode,
    },
    store: {
      id: payment.store.id,
      name: payment.store.name,
      code: payment.store.code,
    },
    lines: payment.transactions.map((t) => ({
      walletName: t.allocation.definition.name,
      icon: t.allocation.definition.icon,
      amount: Number(t.amount),
    })),
  };
}

/** include لازم برای `toPaymentRow` */
export const paymentRowInclude = {
  employee: true,
  store: true,
  transactions: { include: { allocation: { include: { definition: true } } } },
} as const;
