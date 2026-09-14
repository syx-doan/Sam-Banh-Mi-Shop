import { ingredientLabel, recipeLabel, t } from './i18n.mjs';

export const INGREDIENTS = [
  { id: 'cucumber', name: 'Dưa leo', short: 'Dưa leo', color: '#559b44' },
  { id: 'pickles', name: 'Đồ chua', short: 'Đồ chua', color: '#e88742' },
  { id: 'herbs', name: 'Rau thơm', short: 'Rau thơm', color: '#4d8a3e' },
  { id: 'egg', name: 'Trứng', short: 'Trứng', color: '#eebd3f' },
  { id: 'pork', name: 'Thịt nướng', short: 'Thịt', color: '#ad613c' },
  { id: 'chili', name: 'Tương ớt', short: 'Tương ớt', color: '#cf5140' },
];
export const RECIPES = [
  { key: 'meat', name: 'Grilled pork', full: 'Grilled pork bánh mì', items: [0, 1, 2, 4], price: 25, unlockDay: 1 },
  { key: 'eggHerb', name: 'Egg & herbs', full: 'Egg & herb bánh mì', items: [0, 2, 3], price: 20, unlockDay: 1 },
  { key: 'spicyMeat', name: 'Spicy pork', full: 'Spicy pork bánh mì', items: [0, 1, 4, 5], price: 30, unlockDay: 1 },
  { key: 'eggPickles', name: 'Egg & pickles', full: 'Egg & pickles bánh mì', items: [0, 1, 3], price: 22, unlockDay: 2 },
  { key: 'herbMeat', name: 'Herb pork', full: 'Herb pork bánh mì', items: [0, 2, 4], price: 23, unlockDay: 2 },
  { key: 'special', name: 'Special', full: 'Special bánh mì', items: [0, 1, 2, 3, 4], price: 38, unlockDay: 3 },
];
export const UPGRADES = [
  { id: 'patience', name: 'Mái hiên mát mẻ', description: 'Khách chờ thêm 8 giây mỗi cấp.', baseCost: 80, max: 3, icon: 'sun' },
  { id: 'value', name: 'Bánh mì hảo hạng', description: 'Mỗi ổ bán được thêm 5 xu mỗi cấp.', baseCost: 100, max: 3, icon: 'bread' },
  { id: 'time', name: 'Quầy bếp gọn gàng', description: 'Mỗi ca có thêm 15 giây mỗi cấp.', baseCost: 120, max: 3, icon: 'clock' },
];
export const IDENTITIES = ['Minh', 'Mai', 'Chú Lộc', 'Linh', 'Anh Tâm', 'Nhi'];
const NAMES = [['Minh', 'Huy', 'Nam', 'Khoa', 'Bình', 'Tú'], ['Linh', 'Mai', 'An', 'Vy', 'Thảo', 'Nhi'], ['Anh Tâm', 'Anh Phúc', 'Anh Hải', 'Anh Sơn', 'Chú Ba', 'Chú Lộc']];

export const PERSONALITIES = ['patient', 'hurried', 'generous'];

export class Game {
  constructor(random = Math.random) {
    this.random = random;
    this.day = 1;
    this.coins = 0;
    this.upgrades = { patience: 0, value: 0, time: 0 };
    this.phase = 'ready';
    this.sequence = 0;
    this.bestStars = {};
    this.prepare();
  }
  get goal() { return Math.min(18, 5 + this.day); }
  get coinGoal() { return this.goal * 25; }
  get objectives() { return [this.served >= this.goal, this.earned >= this.coinGoal, this.missed <= 1]; }
  get stars() { return this.objectives[0] ? 1 + Number(this.objectives[1]) + Number(this.objectives[2]) : 0; }
  heatState(i) { return this.burnt[i] ? 'burnt' : this.baking[i] > 0 ? 'raw' : this.inOven[i] ? 'golden' : this.baked[i] ? 'safe' : 'fresh'; }
  resetHeat(i) { this.baking[i] = 0; this.baked[i] = false; this.inOven[i] = false; this.heat[i] = 0; this.burnt[i] = false; }
  takeOut(i = this.selectedBread) {
    if (!this.active || !Number.isInteger(i) || i < 0 || i > 2 || !this.inOven[i] || this.baking[i] > 0) return { ok: false, reason: t('ui.bakingNow') };
    this.inOven[i] = false;
    return { ok: true, bread: i };
  }
  get duration() { return 120 + this.upgrades.time * 15; }
  get multiplier() { return this.combo >= 6 ? 2 : this.combo >= 3 ? 1.5 : 1; }
  get active() { return this.phase === 'playing'; }
  prepare() {
    this.remaining = this.duration;
    this.served = 0; this.earned = 0; this.missed = 0; this.combo = 0; this.bestCombo = 0;
    this.selectedBread = 0; this.selectedCustomer = 0;
    this.breads = [[], [], []];
    this.baking = [0, 0, 0];
    this.inOven = [false, false, false]; this.heat = [0, 0, 0]; this.burnt = [false, false, false];
    this.baked = [false, false, false];
    this.respawn = [0, 0, 0];
    this.customers = [null, null, null];
    for (let i = 0; i < 3; i++) this.customers[i] = this.newCustomer(i, this.day === 1 ? i : undefined);
    this.selectedCustomerId = this.customers[0].id;
    this.result = null;
  }
  newCustomer(slot, recipeIndex) {
    const available = RECIPES.map((item, index) => ({ item, index })).filter(({ item }) => item.unlockDay <= this.day);
    const recipe = recipeIndex ?? available[Math.floor(this.random() * available.length)].index;
    const personality = PERSONALITIES[Math.floor(this.random() * PERSONALITIES.length)];
    const patience = (personality === 'patient' ? 16 : personality === 'hurried' ? -12 : 0) + Math.max(27, 58 - (this.day - 1) * 3) + this.upgrades.patience * 8;
    const occupied = new Set((this.customers || []).filter(Boolean).map(c => c.variant));
    const availableLooks = [0,1,2,3,4,5].filter(i => !occupied.has(i));
    const variant = availableLooks[Math.floor(this.random() * availableLooks.length)];
    return { id: ++this.sequence, slot, personality, name: IDENTITIES[variant], variant, recipe, patience, remaining: patience };
  }
  start() {
    if (this.phase !== 'ready') return { ok: false, reason: t('ui.shiftStarted') };
    this.phase = 'playing';
    return { ok: true };
  }
  pause() { if (this.active) { this.phase = 'paused'; return true; } return false; }
  resume() { if (this.phase === 'paused') { this.phase = 'playing'; return true; } return false; }
  selectBread(i) { if (!Number.isInteger(i) || i < 0 || i > 2) return false; this.selectedBread = i; return true; }
  selectCustomer(i) {
    if (!Number.isInteger(i) || i < 0 || i > 2 || !this.customers[i]) return false;
    this.selectedCustomer = i;
    this.selectedCustomerId = this.customers[i].id;
    return true;
  }
  clearCustomerSelection() { this.selectedCustomer = -1; this.selectedCustomerId = null; }
  addIngredient(i) {
    if (!this.active) return { ok: false, reason: t('ui.noOpen') };
    if (!Number.isInteger(i) || !INGREDIENTS[i]) return { ok: false, reason: t('ui.invalidIngredient') };
    if (this.burnt[this.selectedBread]) return { ok: false, reason: t('ui.burntBread') };
    if (this.inOven[this.selectedBread]) return { ok: false, reason: t('ui.bakingNow') };
    const bread = this.breads[this.selectedBread];
    if (bread.includes(i)) return { ok: false, reason: t('ui.duplicateIngredient', { name: ingredientLabel(INGREDIENTS[i].id).toLowerCase() }) };
    bread.push(i); this.resetHeat(this.selectedBread);
    return { ok: true, ingredient: i, bread: this.selectedBread };
  }
  removeIngredient(i) {
    if (!this.active || this.inOven[this.selectedBread] || this.burnt[this.selectedBread]) return false;
    const bread = this.breads[this.selectedBread];
    const index = bread.indexOf(i);
    if (index === -1) return false;
    bread.splice(index, 1); this.resetHeat(this.selectedBread); return true;
  }
  discard() {
    if (!this.active || this.baking[this.selectedBread] > 0 || !this.breads[this.selectedBread].length) return false;
    this.breads[this.selectedBread] = []; this.resetHeat(this.selectedBread); return true;
  }
  bake(i = this.selectedBread) {
    if (!this.active) return { ok: false, reason: t('ui.noOpen') };
    if (!Number.isInteger(i) || i < 0 || i > 2) return { ok: false, reason: t('ui.invalidBread') };
    if (!this.breads[i].length) return { ok: false, reason: t('ui.bakeNeedBread') };
    if (this.baking[i] > 0) return { ok: false, reason: t('ui.bakingNow') };
    if (this.burnt[i]) return { ok: false, reason: t('ui.burntBread') };
    if (this.baked[i]) return { ok: false, reason: t('ui.alreadyBaked') };
    this.inOven[i] = true; this.heat[i] = 0;
    this.baking[i] = 4;
    this.baked[i] = false;
    return { ok: true, bread: i, seconds: this.baking[i] };
  }
  serve(expectedCustomerId = this.selectedCustomerId) {
    if (!this.active) return { ok: false, reason: t('ui.notActive') };
    const customer = this.customers[this.selectedCustomer];
    if (!customer || customer.id !== expectedCustomerId || customer.id !== this.selectedCustomerId) return { ok: false, reason: t('ui.chooseOrder') };
    const recipe = RECIPES[customer.recipe];
    const bread = this.breads[this.selectedBread];
    if (this.baking[this.selectedBread] > 0) return { ok: false, reason: t('ui.bakingNow') };
    if (this.burnt[this.selectedBread]) return { ok: false, reason: t('ui.burntBread') };
    if (!this.baked[this.selectedBread]) return { ok: false, reason: t('ui.bakeFirst') };
    const missing = recipe.items.filter(i => !bread.includes(i));
    const extra = bread.filter(i => !recipe.items.includes(i));
    if (missing.length || extra.length) {
      this.combo = 0;
      return { ok: false, missing, extra, reason: extra.length ? t('ui.removeExtra', { items: extra.map(i => ingredientLabel(INGREDIENTS[i].id).toLowerCase()).join(', ') }) : t('ui.missing', { items: missing.map(i => ingredientLabel(INGREDIENTS[i].id).toLowerCase()).join(', ') }) };
    }
    this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
    const tip = customer.remaining / customer.patience > 0.6 ? (customer.personality === 'generous' ? 12 : customer.personality === 'hurried' ? 8 : 5) : (customer.personality === 'generous' ? 4 : 0);
    const coins = Math.round((recipe.price + this.upgrades.value * 5 + tip) * this.multiplier);
    this.coins += coins; this.earned += coins; this.served++;
    this.breads[this.selectedBread] = []; this.resetHeat(this.selectedBread);
    this.customers[this.selectedCustomer] = null;
    this.respawn[this.selectedCustomer] = 1.8;
    this.clearCustomerSelection();
    return { ok: true, coins, tip, multiplier: this.multiplier, customer: customer.slot, customerId: customer.id, name: customer.name, goalReached: this.served === this.goal };
  }
  tick(seconds) {
    if (!this.active || !Number.isFinite(seconds) || seconds <= 0) return [];
    const dt = Math.min(seconds, this.remaining);
    this.remaining = Math.max(0, this.remaining - dt);
    const events = [];
    for (let i = 0; i < 3; i++) {
      if (!this.inOven[i] || this.burnt[i]) continue;
      const before = this.heat[i];
      this.heat[i] += dt;
      this.baking[i] = Math.max(0, 4 - this.heat[i]);
      if (before < 4 && this.heat[i] >= 4) { this.baked[i] = true; events.push({ type: 'baked', slot: i }); }
      if (before < 14 && this.heat[i] >= 14) { this.baked[i] = false; this.burnt[i] = true; events.push({ type: 'burnt', slot: i }); }
    }
    for (let i = 0; i < 3; i++) {
      const customer = this.customers[i];
      if (customer) {
        customer.remaining = Math.max(0, customer.remaining - dt);
        if (customer.remaining === 0) {
          this.missed++; this.combo = 0;
          this.customers[i] = null; this.respawn[i] = 2.5;
          events.push({ type: 'left', slot: i, customerId: customer.id, name: customer.name });
          if (i === this.selectedCustomer) this.clearCustomerSelection();
        }
      } else {
        this.respawn[i] = Math.max(0, this.respawn[i] - dt);
        if (this.respawn[i] === 0 && this.remaining > 0) { this.customers[i] = this.newCustomer(i); events.push({ type: 'arrived', slot: i }); }
      }
    }
    if (this.remaining === 0) { this.finish(); events.push({ type: 'finished', result: this.result }); }
    return events;
  }
  finish() {
    if (this.phase === 'ended') return this.result;
    const won = this.served >= this.goal;
    const stars = this.stars;
    this.bestStars[this.day] = Math.max(this.bestStars[this.day] || 0, stars);
    const bonus = won ? 30 + this.day * 10 : 0;
    this.coins += bonus;
    this.result = { won, stars, served: this.served, goal: this.goal, earned: this.earned, bonus, missed: this.missed, bestCombo: this.bestCombo };
    this.phase = 'ended';
    return this.result;
  }
  nextDay(replay = false) {
    if (this.phase !== 'ended') return false;
    if (this.result.won && !replay) this.day++;
    this.phase = 'ready'; this.prepare(); return true;
  }
  unlockedRecipes(day = this.day) { return RECIPES.filter(recipe => recipe.unlockDay <= day); }
  upgradeCost(id) {
    const item = UPGRADES.find(u => u.id === id);
    if (!item) return null;
    return item.baseCost * (this.upgrades[id] + 1);
  }
  buyUpgrade(id) {
    const item = UPGRADES.find(u => u.id === id);
    if (!item) return { ok: false, reason: t('ui.invalidUpgrade') };
    if (this.upgrades[id] >= item.max) return { ok: false, reason: t('ui.maxUpgrade') };
    const cost = this.upgradeCost(id);
    if (this.coins < cost) return { ok: false, reason: t('ui.needCoins', { coins: cost - this.coins }) };
    this.coins -= cost; this.upgrades[id]++;
    if (id === 'time' && this.phase !== 'ended') this.remaining += 15;
    if (id === 'patience') this.customers.forEach(c => { if (c) { c.remaining += 8; c.patience += 8; } });
    return { ok: true, cost, level: this.upgrades[id] };
  }
  snapshot() {
    return { phase: this.phase, day: this.day, coins: this.coins, remaining: Math.ceil(this.remaining), goal: this.goal, served: this.served, earned: this.earned, missed: this.missed, combo: this.combo, selectedBread: this.selectedBread, selectedCustomer: this.selectedCustomer, selectedCustomerId: this.selectedCustomerId, breads: this.breads.map(b => b.map(i => INGREDIENTS[i].id)), baking: [...this.baking], baked: [...this.baked], heatStates: this.breads.map((_, i) => this.heatState(i)), objectives: this.objectives, stars: this.stars, bestStars: { ...this.bestStars }, customers: this.customers.map(c => c ? { id: c.id, slot: c.slot, name: c.name, variant: c.variant, personality: c.personality, recipe: recipeLabel(RECIPES[c.recipe], true), ingredients: RECIPES[c.recipe].items.map(i => INGREDIENTS[i].id), remaining: Math.ceil(c.remaining) } : null), upgrades: { ...this.upgrades } };
  }
}
