// Each generated sheet has 16 complete sandwiches. Ingredient bit order matches engine.mjs.
export function breadMask(ingredients) {
  return ingredients.reduce((mask, ingredient) => {
    if (!Number.isInteger(ingredient) || ingredient < 0 || ingredient > 5) throw new TypeError('Invalid ingredient');
    return mask | (1 << ingredient);
  }, 0);
}

export function breadSprite(ingredients) {
  const mask = breadMask(ingredients);
  return {
    mask,
    sheet: Math.floor(mask / 16) * 16,
    column: mask % 4,
    row: Math.floor((mask % 16) / 4),
    url: `./assets/bread-${Math.floor(mask / 16) * 16}.webp`,
  };
}

export function customerMood(customer) {
  if (!customer || customer.remaining <= 0) return 2;
  const ratio = customer.remaining / customer.patience;
  return ratio < 0.25 ? 2 : ratio < 0.55 ? 1 : 0;
}
