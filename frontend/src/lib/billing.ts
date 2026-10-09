import type { Plan } from '@/api/types';

export function formatPrice(price: Plan['price']): string {
    const amount = price.amountMinor / 100;
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: price.currency,
        maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
}

export function sortByPrice(plans: Plan[]): Plan[] {
    return [...plans].sort((a, b) => a.price.amountMinor - b.price.amountMinor);
}
