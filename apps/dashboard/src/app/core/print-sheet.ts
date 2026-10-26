/**
 * چاپ فقط یک بخش از صفحه، با همهٔ صفحه‌هایش.
 *
 * عنصر موقتاً فرزند مستقیم `<body>` می‌شود و `styles.css` هنگام چاپ هر فرزند
 * دیگرِ body (کل اپ: نوار کناری، فیلترها، صفحه‌بندی) را پنهان می‌کند. با
 * `visibility` + `position: absolute` جدولِ بلند فقط تا یک صفحهٔ کاغذ چاپ
 * می‌شد؛ اینجا عنصر در جریان عادی صفحه است، پس مرورگر خودش آن را صفحه‌بندی
 * می‌کند. بعد از چاپ عنصر به جای اصلی‌اش برمی‌گردد.
 */
export function printSheet(element: HTMLElement): void {
  const parent = element.parentNode;
  const next = element.nextSibling;
  document.body.appendChild(element);
  const restore = () => {
    window.removeEventListener('afterprint', restore);
    parent?.insertBefore(element, next);
  };
  window.addEventListener('afterprint', restore);
  window.print();
}
