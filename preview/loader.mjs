// Module loader — server/src/prisma/client.js importini stub'ga yo'naltiradi
// (faqat demo preview uchun; production ga ta'sir qilmaydi)
export async function resolve(specifier, context, next) {
  const resolved = await next(specifier, context);
  if (typeof resolved.url === 'string' && resolved.url.endsWith('/server/src/prisma/client.js')) {
    const stub = new URL('./stub-prisma.mjs', import.meta.url);
    return { url: stub.href, shortCircuit: true };
  }
  return resolved;
}
