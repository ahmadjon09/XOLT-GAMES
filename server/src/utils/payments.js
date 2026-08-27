// To'lov logikasi: guruh oylik to'lovi + BIR MARTALIK chegirma
// effectiveFee = monthlyFee * (1 - discount/100)
// Chegirma endi o'quvchiga emas, AYRAN TO'LOVGA bog'lanadi (Payment.discount)
// Agar to'langan summa effectiveFee'ga yetsa -> paid (to'liq)
// Agar 0 dan katta lekin yetmasa -> partial (chala)
// Aks holda -> unpaid

export function effectiveFee(monthlyFee, discount) {
  const fee = Number(monthlyFee) || 0;
  const disc = Math.min(100, Math.max(0, Number(discount) || 0));
  return Math.round(fee * (1 - disc / 100));
}

// Statusni hisoblash: server tomonidan normalize qilinadi
export function normalizeStatus(amount, effective) {
  const amt = Number(amount) || 0;
  const eff = Number(effective) || 0;
  if (eff <= 0) return amt > 0 ? 'paid' : 'unpaid';
  if (amt >= eff) return 'paid';
  if (amt > 0) return 'partial';
  return 'unpaid';
}

// Frontendga yuboriladigan to'lov obyekti
// discount — shu to'lovga qo'llangan BIR MARTALIK chegirma foizi
export function paymentView(p, group) {
  const monthlyFee = Number(group?.monthlyFee) || 0;
  const discount = Math.min(100, Math.max(0, Number(p?.discount) || 0));
  const effective = effectiveFee(monthlyFee, discount);
  const amount = Number(p?.amount) || 0;
  return {
    id: p.id,
    userId: p.userId,
    groupId: p.groupId,
    month: p.month,
    amount,
    status: p.status,
    discount,
    note: p.note,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
    monthlyFee,
    effectiveFee: effective,
    remaining: p.status === 'paid' ? 0 : Math.max(0, effective - amount),
    paidPercent: effective > 0 ? Math.min(100, Math.round((amount / effective) * 100)) : 0,
  };
}
