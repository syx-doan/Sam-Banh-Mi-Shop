// Device-local save: timers stay frozen while the page is closed.
const KEY = 'banhmi-progress-v6';
const fields = ['day','coins','upgrades','phase','sequence','bestStars','remaining','served','earned','missed','combo','bestCombo','selectedBread','selectedCustomer','selectedCustomerId','breads','baking','baked','inOven','heat','burnt','respawn','customers','result'];
export function saveProgress(game, storage) {
  try { storage ||= globalThis.localStorage; storage.setItem(KEY, JSON.stringify({ version: 6, state: Object.fromEntries(fields.map(key => [key, game[key]])) })); return true; } catch { return false; }
}
export function loadProgress(game, storage) {
  try {
    storage ||= globalThis.localStorage;
    const data = JSON.parse(storage.getItem(KEY));
    if (data?.version !== 6) return false;
    const s = data.state;
    const number = (v, max = 1e9) => Number.isFinite(v) && v >= 0 && v <= max;
    if (!s || !fields.every(k => Object.hasOwn(s,k)) || !['ready','playing','paused','ended'].includes(s.phase)) return false;
    if (!Number.isInteger(s.day) || s.day < 1 || !['coins','sequence','remaining','served','earned','missed','combo','bestCombo'].every(k => number(s[k]))) return false;
    if (!['patience','value','time'].every(k => Number.isInteger(s.upgrades?.[k]) && number(s.upgrades[k],3))) return false;
    if (!s.bestStars || typeof s.bestStars !== 'object' || !Object.values(s.bestStars).every(v => Number.isInteger(v) && number(v,3))) return false;
    if (!Number.isInteger(s.selectedBread) || !number(s.selectedBread,2) || !Number.isInteger(s.selectedCustomer) || s.selectedCustomer < -1 || s.selectedCustomer > 2) return false;
    if (!['breads','baking','baked','inOven','heat','burnt','respawn','customers'].every(k => Array.isArray(s[k]) && s[k].length === 3)) return false;
    if (!s.breads.every(b => Array.isArray(b) && b.length <= 6 && new Set(b).size === b.length && b.every(i => Number.isInteger(i) && number(i,5)))) return false;
    if (!['baking','heat','respawn'].every(k => s[k].every(v => number(v))) || !['baked','inOven','burnt'].every(k => s[k].every(v => typeof v === 'boolean'))) return false;
    if (!s.customers.every((c,i) => c === null || (number(c.id) && c.slot === i && typeof c.name === 'string' && c.name.length < 80 && ['patient','hurried','generous'].includes(c.personality) && Number.isInteger(c.recipe) && number(c.recipe,5) && number(c.patience) && c.patience > 0 && number(c.remaining)))) return false;
    if (s.selectedCustomer >= 0 && s.customers[s.selectedCustomer]?.id !== s.selectedCustomerId) return false;
    if (s.phase === 'ended' && (!s.result || typeof s.result.won !== 'boolean' || !number(s.result.stars,3))) return false;
    fields.forEach(key => { game[key] = s[key]; });
    if (game.phase === 'playing') game.phase = 'paused';
    return true;
  } catch { return false; }
}
