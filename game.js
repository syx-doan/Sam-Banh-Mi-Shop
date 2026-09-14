import { icon } from './icons.mjs';
import { Game, INGREDIENTS, RECIPES, UPGRADES, IDENTITIES } from './engine.mjs';
import { breadMask, breadSprite, customerMood } from './bread-art.mjs';
import { installPointerControls } from './pointer-controls.mjs';
import { getLanguage, ingredientLabel, moodLabel, recipeLabel, setLanguage, t, upgradeLabel } from './i18n.mjs';

import { saveProgress, loadProgress } from './progress.mjs';

const $ = id => document.getElementById(id);
const game = new Game();
const restored = loadProgress(game);
if (restored) {
  const used = new Set();
  game.customers.forEach(c => {
    if (!c) return;
    if (!Number.isInteger(c.variant) || c.variant < 0 || c.variant > 5 || used.has(c.variant)) c.variant = [0,1,2,3,4,5].find(i => !used.has(i));
    used.add(c.variant); c.name = IDENTITIES[c.variant];
  });
}
const CUSTOMER_KEYS = ['Q', 'W', 'E'];
const BREAD_KEYS = ['A', 'S', 'D'];
const food = (i, className = '') => `<span class="food food-${i} ${className}" aria-hidden="true"></span>`;
const safe = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatTime = value => { const t = Math.ceil(Math.max(0, value)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
const customerViews = [];
const breadViews = [];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let pointerControls;

function applyBreadSprite(element, ingredients, burnt = false) {
  if (burnt) { element.dataset.mask = 'burnt'; element.style.backgroundImage = "url('./assets/bread-burnt.webp')"; element.style.backgroundPosition = 'center'; element.style.backgroundSize = 'contain'; return; }
  element.style.backgroundSize = '400% 400%';
  const sprite = breadSprite(ingredients);
  if (element.dataset.mask === String(sprite.mask)) return;
  element.dataset.mask = String(sprite.mask);
  element.style.backgroundImage = `url('${sprite.url}')`;
  element.style.backgroundPosition = `${sprite.column * 100 / 3}% ${sprite.row * 100 / 3}%`;
}

function animateElement(element, keyframes, options, finished) {
  if (!element || reducedMotion() || typeof element.animate !== 'function') { finished?.(); return; }
  const animation = element.animate(keyframes, options);
  if (finished) animation.finished.then(finished, finished);
}

function pulseBread(index) {
  const view = breadViews[index];
  if (view) animateElement(view.art, [{ scale: '1' }, { scale: '1.08', offset: .4 }, { scale: '1' }], { duration: 290, easing: 'ease-out' });
}

function flySprite(ingredients, fromRect, toRect, ingredient = null) {
  if (!fromRect || !toRect || reducedMotion()) return;
  const ghost = document.createElement('span');
  ghost.className = 'flight-sprite ' + (ingredient === null ? 'bread-sprite' : `food food-${ingredient}`);
  if (ingredient === null) applyBreadSprite(ghost, ingredients);
  const size = ingredient === null ? Math.min(fromRect.width, 138) : 42;
  const startX = fromRect.left + fromRect.width / 2 - size / 2;
  const startY = fromRect.top + fromRect.height / 2 - size / 2;
  const dx = toRect.left + toRect.width / 2 - size / 2 - startX;
  const dy = toRect.top + toRect.height / 2 - size / 2 - startY;
  Object.assign(ghost.style, { left: `${startX}px`, top: `${startY}px`, width: `${size}px`, height: `${size}px` });
  document.body.append(ghost);
  animateElement(ghost, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx * .45}px,${dy * .5 - 38}px) scale(1.15)`, opacity: 1, offset: .5 }, { transform: `translate(${dx}px,${dy}px) scale(.58)`, opacity: .3 }], { duration: ingredient === null ? 570 : 340, easing: 'cubic-bezier(.2,.7,.4,1)' }, () => ghost.remove());
}

function showCustomerMood(view, mood) {
  if (view.mood === mood) return;
  view.mood = mood;
  const next = 1 - view.front;
  view.frames[next].style.backgroundPosition = `${view.variant * 20}% ${mood * 100 / 3}%`;
  view.frames[next].style.opacity = '1';
  view.frames[view.front].style.opacity = '0';
  view.front = next;
  view.root.dataset.mood = String(mood);
  view.moodLabel.textContent = moodLabel(mood);
}

function updateMood(view, customer) {
  const angry = view.root.classList.contains('is-angry') && game.remaining > view.angryUntil;
  if (!angry && view.root.classList.contains('is-angry')) { view.root.classList.remove('is-angry'); view.emote.hidden = true; }
  showCustomerMood(view, angry ? 2 : customerMood(customer));
}
function wrongOrderReaction(slot) {
  const view = customerViews[slot], customer = game.customers[slot];
  if (!view || !customer || view.id !== customer.id) return;
  view.angryUntil = game.remaining - (customer.personality === 'hurried' ? 4 : 2.5);
  view.root.classList.add('is-angry');
  view.emote.textContent = t('ui.wrong' + (customer.personality === 'hurried' ? 'Hurried' : customer.personality === 'patient' ? 'Patient' : 'Order'));
  view.emote.hidden = false;
  showCustomerMood(view, 2);
  animateElement(view.figure, [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px) rotate(-4deg)' }, { transform: 'translateX(6px) rotate(4deg)' }, { transform: 'translateX(0)' }], { duration: customer.personality === 'hurried' ? 500 : 350 });
}

function customerFeedback(slot, customerId, happy) {
  const view = customerViews[slot];
  if (!view || view.id !== customerId) return;
  clearTimeout(view.exitTimer);
  view.exiting = true; view.angryUntil = 0; view.root.classList.remove('is-angry');
  view.root.dataset.status = happy ? 'thanking' : 'leaving';
  view.card.disabled = true; view.person.disabled = true;
  view.emote.textContent = happy ? t('ui.chatHappy') : t('ui.chatLeaving');
  view.emote.hidden = false;
  showCustomerMood(view, happy ? 3 : 2);
  if (happy) {
    animateElement(view.figure, [{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(-10px) rotate(-3deg)', offset: .3 }, { transform: 'translateY(0) rotate(3deg)', offset: .6 }, { transform: 'translateY(0) rotate(0)' }], { duration: 650, easing: 'ease-in-out' });
    for (let i = 0; i < 3; i++) {
      const heart = document.createElement('span'); heart.className = 'customer-heart'; heart.innerHTML = icon('heart'); heart.style.left = `${27 + i * 20}%`; heart.style.animationDelay = `${i * 100}ms`;
      view.root.append(heart); setTimeout(() => heart.remove(), 1400);
    }
  }
  view.exitTimer = setTimeout(() => {
    if (view.id !== customerId) return;
    view.exiting = false; view.root.dataset.status = 'empty'; view.emote.hidden = true;
  }, happy ? 1450 : 1100);
}

let muted = false;
try { muted = localStorage.getItem('banhmi-sound') === 'off'; } catch { /* Sound remains available when browser storage is blocked. */ }
let audioContext;
function tone(kind = 'tap') {
  if (muted) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioContext ||= new AudioContext();
    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
    const notes = kind === 'ready' ? [1318.51, 2093] : kind === 'serve' ? [523.25, 659.25, 783.99] : kind === 'start' ? [392, 523.25, 659.25, 783.99] : kind === 'bake' ? [329.63, 392, 523.25, 659.25] : kind === 'music' ? [261.63, 329.63, 392, 523.25] : kind === 'error' ? [196, 164.81] : kind === 'upgrade' ? [523.25, 783.99, 1046.5] : [420 + Math.random() * 130];
    const volume = kind === 'music' ? 0.024 : 0.075;
    notes.forEach((frequency, i) => {
      const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain();
      const now = audioContext.currentTime + i * 0.085;
      oscillator.type = kind === 'error' ? 'triangle' : 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(volume, now + 0.012); gain.gain.exponentialRampToValueAtTime(0.001, now + (kind === 'music' ? 0.55 : kind === 'ready' ? 0.7 : 0.17));
      oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(now); oscillator.stop(now + (kind === 'music' ? 0.58 : kind === 'ready' ? 0.75 : 0.2));
    });
  } catch { /* Audio is optional; gameplay never depends on it. */ }
}
function vibrate(pattern = 15) { if (navigator.vibrate) navigator.vibrate(pattern); }
function toggleSound() {
  muted = !muted;
  try { localStorage.setItem('banhmi-sound', muted ? 'off' : 'on'); } catch { /* Device preference only. */ }
  renderSound(); if (!muted) { tone(); startMusic(); } else stopMusic();
}
function renderSound() { $('sound-button').innerHTML = icon(muted ? 'mute' : 'sound'); $('sound-button').setAttribute('aria-label', muted ? t('ui.unmute') : t('ui.mute')); $('sound-button').title = muted ? t('ui.unmute') : t('ui.mute'); }
let musicTimer = null;
function startMusic() {
  if (musicTimer || muted) return;
  musicTimer = setInterval(() => { if (game.active && document.visibilityState !== 'hidden') tone('music'); }, 4200);
}
function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

let toastTimeout;
function toast(message, error = false, duration = 2900) {
  clearTimeout(toastTimeout); const el = $('toast');
  el.textContent = message; el.className = 'toast show' + (error ? ' error' : '');
  toastTimeout = setTimeout(() => { el.className = 'toast'; }, duration);
}
function coinPop(amount, slot) {
  const el = document.createElement('span'); el.className = 'coin-pop';
  el.textContent = t('ui.coinPop', { amount }); el.style.left = (slot * 30 + 11) + '%';
  $('celebration').append(el); setTimeout(() => el.remove(), 1400);
}
function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#f4c65c', '#76ad68', '#fff2bb', '#e79166'];
  for (let i = 0; i < 28; i++) {
    const el = document.createElement('i'); el.className = 'confetti';
    el.style.left = Math.random() * 100 + '%'; el.style.background = colors[i % colors.length]; el.style.animationDelay = Math.random() * 0.7 + 's';
    $('celebration').append(el); setTimeout(() => el.remove(), 3000);
  }
}

function initializeCustomerViews() {
  if (customerViews.length) return;
  for (let slot = 0; slot < 3; slot++) {
    const root = document.createElement('div');
    root.className = 'customer'; root.dataset.customerSlot = String(slot);
    root.innerHTML = `<div class="customer-live"><button class="order-card" data-customer="${slot}"><span class="order-hotkey" aria-hidden="true">${CUSTOMER_KEYS[slot]}</span><span class="order-top"><span class="order-food bread-sprite" aria-hidden="true"></span><span class="order-title"><span class="order-recipe-name"></span><span class="order-price"></span></span></span><span class="order-ingredients">${INGREDIENTS.map((item, i) => `<span class="order-ingredient" data-item="${i}" title="${safe(ingredientLabel(item.id))}">${food(i)}</span>`).join('')}</span><span class="patience-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span class="patience-fill" id="patience-${slot}"></span></span></button><button class="customer-person" data-customer="${slot}"><span class="avatar-figure"><span class="avatar-frame" aria-hidden="true"></span><span class="avatar-frame" aria-hidden="true"></span></span><span class="customer-name"><span class="customer-display-name"></span><span class="mood-label"></span><span class="personality-label"></span></span></button><span class="customer-emote" hidden></span></div><div class="customer-empty"><strong>${icon('clock')}</strong>${t('ui.waiting')}</div>`;
    $('customers').append(root);
    const find = selector => root.querySelector(selector);
    customerViews.push({ slot, id: null, root, live: find('.customer-live'), card: find('.order-card'), person: find('.customer-person'), figure: find('.avatar-figure'), frames: [...root.querySelectorAll('.avatar-frame')], front: 0, mood: -1, moodLabel: find('.mood-label'), name: find('.customer-display-name'), emote: find('.customer-emote'), title: find('.order-recipe-name'), price: find('.order-price'), art: find('.order-food'), items: [...root.querySelectorAll('.order-ingredient')], patience: find('.patience-fill'), exiting: false, exitTimer: null });
  }
}
function renderCustomers() {
  initializeCustomerViews();
  const added = game.breads[game.selectedBread];
  customerViews.forEach((view, slot) => {
    const customer = game.customers[slot];
    const selected = !!customer && game.selectedCustomer === slot && game.selectedCustomerId === customer.id;
    view.card.classList.toggle('selected', selected);
    view.person.classList.toggle('selected', selected);
    view.root.classList.toggle('is-selected', selected);
    view.card.setAttribute('aria-pressed', String(selected));
    view.person.setAttribute('aria-pressed', String(selected));
    if (!customer) {
      if (!view.exiting) view.root.dataset.status = 'empty';
      view.card.disabled = true; view.person.disabled = true;
      return;
    }
    const recipe = RECIPES[customer.recipe];
    if (view.id !== customer.id) {
      const hadPreviousCustomer = view.id !== null;
      clearTimeout(view.exitTimer); view.exiting = false; view.id = customer.id;
      view.root.dataset.customerId = String(customer.id);
      view.variant = customer.variant ?? slot;
      view.mood = -1;
      view.root.dataset.variant = String(view.variant);
      view.card.dataset.customerId = String(customer.id);
      view.person.dataset.customerId = String(customer.id);
      view.root.dataset.status = 'waiting'; view.emote.hidden = true;
      view.card.disabled = false; view.person.disabled = false;
      view.title.textContent = recipeLabel(recipe);
      view.name.textContent = customer.name;
      view.root.querySelector('.personality-label').innerHTML = `${icon(({ patient: 'coffee', hurried: 'bolt', generous: 'gift' })[customer.personality])}<span>${t('ui.' + customer.personality)}</span>`;
      view.root.querySelector('.personality-label').title = t('ui.' + customer.personality + 'Hint');
      view.angryUntil = 0; view.root.classList.remove('is-angry');
      view.card.setAttribute('aria-label', t('ui.customerAria', { name: customer.name, recipe: recipeLabel(recipe, true), ingredients: recipe.items.map(i => ingredientLabel(INGREDIENTS[i].id)).join(', '), key: CUSTOMER_KEYS[slot] }));
      view.person.setAttribute('aria-label', t('ui.selectCustomerAria', { name: customer.name, key: CUSTOMER_KEYS[slot] }));
      applyBreadSprite(view.art, recipe.items);
      view.items.forEach((item, i) => { item.hidden = !recipe.items.includes(i); item.title = ingredientLabel(INGREDIENTS[i].id); });
      view.patience.parentElement.setAttribute('aria-label', `${t('ui.waiting')}: ${customer.name}`);
      if (hadPreviousCustomer) animateElement(view.live, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 380, easing: 'ease-out' });
    }
    view.price.textContent = t('ui.price', { price: recipe.price + game.upgrades.value * 5 });
    view.items.forEach((item, i) => item.classList.toggle('added', selected && added.includes(i)));
    updateMood(view, customer);
  });
}
function renderIngredients() {
  $('ingredients').innerHTML = INGREDIENTS.map((ingredient, i) => { const name = ingredientLabel(ingredient.id); return `<button class="ingredient-button" id="ingredient-${i}" data-ingredient="${i}" aria-label="${safe(t('ui.ingredientAria', { name, key: i + 1 }))}"><span class="ingredient-key" aria-hidden="true">${i + 1}</span><span class="ingredient-check" aria-hidden="true">${icon('check')}</span>${food(i)}<span class="ingredient-name">${safe(name)}</span></button>`; }).join('');
}
function updateIngredients() {
  INGREDIENTS.forEach((_, i) => { const button = $('ingredient-' + i); const added = game.breads[game.selectedBread].includes(i); button.classList.toggle('is-added', added); button.setAttribute('aria-pressed', String(added)); });
}
function initializeBreadViews() {
  if (breadViews.length) return;
  for (let slot = 0; slot < 3; slot++) {
    const root = document.createElement('div');
    root.className = 'bread-slot'; root.dataset.bread = String(slot);
    root.innerHTML = `<button class="bread-select" data-select-bread="${slot}"><span class="bread-label">${t('ui.breadSlot', { slot: slot + 1 })} <kbd>${BREAD_KEYS[slot]}</kbd></span><span class="selected-pill">${t('ui.selected')}</span><span class="bread-art bread-sprite" aria-hidden="true"></span></button><div class="bread-chips"><span class="empty-bread-caption">${t('ui.emptyBread')}</span>${INGREDIENTS.map((item, i) => { const name = ingredientLabel(item.id); return `<button class="bread-chip" data-remove="${i}" data-from-bread="${slot}" aria-label="${safe(t('ui.removeIngredient', { name, slot: slot + 1 }))}" title="${safe(name)}">${food(i)}<span class="chip-remove-mark" aria-hidden="true">${icon('close')}</span></button>`; }).join('')}</div><div class="bread-actions"><button class="bake-button" data-bake-slot="${slot}" disabled><span class="bake-flame" aria-hidden="true">${icon('flame')}</span><span class="bake-label">${t('ui.bake')}</span><span class="bake-progress" aria-hidden="true"></span></button></div>`;
    $('bread-slots').append(root);
    breadViews.push({ root, button: root.querySelector('.bread-select'), art: root.querySelector('.bread-art'), pill: root.querySelector('.selected-pill'), empty: root.querySelector('.empty-bread-caption'), chips: [...root.querySelectorAll('.bread-chip')], bake: root.querySelector('.bake-button'), bakeLabel: root.querySelector('.bake-label'), bakeProgress: root.querySelector('.bake-progress'), mask: null });
  }
}
function renderHeat(view, slot) {
  const state = game.heatState(slot);
  view.root.dataset.heat = state;
  view.root.dataset.baking = String(state === 'raw');
  view.bakeLabel.textContent = state === 'raw' ? t('ui.rawBread', { seconds: Math.ceil(game.baking[slot]) }) : state === 'golden' ? t('ui.goldenBread', { seconds: Math.max(0, Math.ceil(14 - game.heat[slot])) }) : state === 'safe' ? t('ui.safeBread') : state === 'burnt' ? t('ui.burntBread') : t('ui.bake');
  view.bake.disabled = !game.active || !game.breads[slot].length || state === 'raw' || state === 'safe' || state === 'burnt';
  view.bake.setAttribute('aria-label', `${t('ui.breadSlot', { slot: slot + 1 })}: ${view.bakeLabel.textContent}`);
  view.bake.classList.toggle('is-baked', game.baked[slot]);
  view.root.querySelector('.bake-flame').innerHTML = icon(({ raw: 'clock', golden: 'bell', safe: 'check', burnt: 'warning', fresh: 'flame' })[state]);
  view.bakeProgress.style.width = state === 'raw' ? `${game.heat[slot] / 4 * 100}%` : state === 'golden' ? `${(14-game.heat[slot]) * 10}%` : '0%';
}
function objectivesMarkup() {
  return `<div class="daily-goals"><strong>${t('ui.dailyGoals')}</strong>${[t('ui.starOrders', { goal: game.goal }), t('ui.starCoins', { goal: game.coinGoal }), t('ui.starPatience')].map((label,i) => `<div class="daily-goal ${game.objectives[i] ? 'met' : ''}"><span>${icon(game.objectives[i] ? 'check' : 'circle')} ${label}</span><b>${[game.served,game.earned,game.missed][i]}</b></div>`).join('')}<small>${t('ui.starRule')}</small><div>${t('ui.bestStars', { stars: game.bestStars[game.day] || 0 })}</div></div>`;
}
function renderBreads() {
  initializeBreadViews();
  game.breads.forEach((bread, slot) => {
    const view = breadViews[slot]; const selected = game.selectedBread === slot;
    view.root.classList.toggle('selected', selected);
    view.button.setAttribute('aria-pressed', String(selected));
    const contents = bread.length ? t('ui.hasContents', { contents: bread.map(i => ingredientLabel(INGREDIENTS[i].id)).join(', ') }) : t('ui.emptyContents');
    view.button.setAttribute('aria-label', t('ui.breadAria', { slot: slot + 1, contents, key: BREAD_KEYS[slot] }));
    view.pill.hidden = !selected;
    view.empty.hidden = bread.length !== 0;
    view.chips.forEach((chip, i) => { chip.hidden = !bread.includes(i); });
    const baking = game.baking[slot] > 0;
    view.root.dataset.baking = String(baking);
    renderHeat(view, slot);
    applyBreadSprite(view.art, bread, game.burnt[slot]);
    view.mask = breadMask(bread);
  });
  $('worktop-hint').textContent = `${t('ui.breadSlot', { slot: game.selectedBread + 1 })} · ${game.breads[game.selectedBread].length} ${t('ui.ingredientsLegend').toLowerCase()}`;
}
function renderRecipe() {
  const customer = game.customers[game.selectedCustomer];
  const bread = game.breads[game.selectedBread];
  $('recipe-key').textContent = CUSTOMER_KEYS[game.selectedCustomer] || '—';
  $('serve-label').textContent = customer ? t('ui.readyFor', { name: customer.name }) : t('ui.serve');
  $('serve-button').setAttribute('aria-label', customer ? t('ui.readyFor', { name: customer.name }) : t('ui.selectCustomer'));
  if (!customer) {
    $('recipe-name').textContent = t('ui.selectCustomer'); $('recipe-owner').textContent = t('ui.selectCustomerHint'); $('recipe-list').innerHTML = ''; $('recipe-tip').textContent = t('ui.noCustomer'); $('recipe-tip').className = 'recipe-tip';
    $('serve-hint').textContent = t('ui.tapCustomer'); $('serve-button').classList.remove('ready-to-serve'); return;
  }
  const recipe = RECIPES[customer.recipe];
  $('recipe-name').textContent = recipeLabel(recipe, true); $('recipe-owner').textContent = t('ui.forCustomer', { name: customer.name, price: recipe.price + game.upgrades.value * 5 });
  $('recipe-list').innerHTML = recipe.items.map(i => `<div class="recipe-item ${bread.includes(i) ? 'done' : ''}">${food(i)}<span>${safe(ingredientLabel(INGREDIENTS[i].id))}</span><span class="check" aria-label="${bread.includes(i) ? t('ui.added') : t('ui.missingStatus')}">${icon('check')}</span></div>`).join('');
  const correct = bread.length === recipe.items.length && recipe.items.every(i => bread.includes(i));
  const baked = game.baked[game.selectedBread];
  $('recipe-tip').textContent = game.baking[game.selectedBread] > 0 ? t('ui.bakingHint') : correct && !baked ? t('ui.bakeFirst') : correct ? t('ui.correctOrder', { name: customer.name }) : t('ui.removeHint');
  $('recipe-tip').className = 'recipe-tip' + (correct && baked ? ' ready' : '');
  const count = recipe.items.filter(i => bread.includes(i)).length;
  $('serve-hint').textContent = correct && baked ? t('ui.servedHint') : correct ? t('ui.bakeFirst') : t('ui.progress', { count, total: recipe.items.length });
  $('serve-button').classList.toggle('ready-to-serve', correct && baked);
}
function renderStats() {
  $('daily-objectives').innerHTML = objectivesMarkup();
  $('mobile-goals').innerHTML = `${[0,1,2].map(i => icon('star', i < game.stars ? 'filled' : '')).join('')} <span>${game.served}/${game.goal}</span> ${icon('coin')} <span>${game.earned}/${game.coinGoal}</span>`;
  $('mobile-goals').setAttribute('aria-label', t('ui.dailyGoals'));
  $('mobile-order').setAttribute('aria-label', t('ui.currentOrder'));
  $('wallet').textContent = game.coins.toLocaleString(getLanguage() === 'vi' ? 'vi-VN' : 'en-US'); $('wallet-unit').textContent = t('ui.coins'); $('wallet-wrap').setAttribute('aria-label', t('ui.wallet', { coins: game.coins.toLocaleString(getLanguage() === 'vi' ? 'vi-VN' : 'en-US') })); $('day-label').textContent = t('ui.day', { day: String(game.day).padStart(2, '0') });
  $('goal-text').textContent = t('ui.sandwiches', { served: game.served, goal: game.goal }); $('goal-progress').style.width = Math.min(100, game.served / game.goal * 100) + '%';
  $('earned').textContent = game.earned; $('missed').textContent = game.missed;
  $('open-sign').textContent = game.phase === 'ready' ? t('ui.ready') : game.phase === 'ended' ? t('ui.dayClosed') : game.phase === 'paused' ? t('ui.dayPaused') : t('ui.dayOpen');
  $('scene-shift').innerHTML = `${icon('sun')}${t('ui.morning')}`; $('level-badge').textContent = t('ui.levelBadge', { level: game.day }); $('combo-badge').textContent = game.combo >= 3 ? t('ui.combo', { combo: game.combo, multiplier: game.multiplier }) : game.combo ? t('ui.streak', { combo: game.combo }) : game.phase === 'ready' ? t('ui.readyStatus') : t('ui.goodbye');
  const combo = $('combo-badge'); combo.classList.toggle('active', game.combo >= 3);
  const start = $('start-button'); start.classList.toggle('playing', game.phase !== 'ready');
  start.innerHTML = game.phase === 'ready' ? `${t('ui.open')} ${icon('arrow')}` : game.phase === 'ended' ? `${t('ui.viewResults')} ${icon('arrow')}` : game.phase === 'paused' ? t('ui.resumeSaved') : `${t('ui.pause')} ${icon('pause')}`;
  $('pause-button').innerHTML = icon(game.phase === 'paused' ? 'play' : 'pause');
  $('pause-button').setAttribute('aria-label', game.phase === 'paused' ? t('ui.resume') : t('ui.pause')); $('pause-button').title = game.phase === 'paused' ? t('ui.resume') : t('ui.pause');
  document.body.classList.toggle('paused-state', game.phase === 'paused');
  document.body.classList.toggle('shift-active', game.active);
  renderClock();
}
function renderClock() {
  $('timer').textContent = formatTime(game.remaining); $('timer').setAttribute('aria-label', t('ui.remaining')); $('timer').classList.toggle('urgent', game.remaining <= 20 && game.active);
  game.baking.forEach((remaining, i) => {
    const view = breadViews[i]; if (!view) return;
    renderHeat(view, i);
  });
  game.customers.forEach((c, i) => {
    const el = $('patience-' + i); if (!el || !c) return;
    const ratio = Math.max(0, c.remaining / c.patience); el.style.width = ratio * 100 + '%'; el.className = 'patience-fill' + (ratio < .25 ? ' low' : ratio < .55 ? ' medium' : '');
    el.parentElement.setAttribute('role', 'progressbar'); el.parentElement.setAttribute('aria-label', `${t('ui.waiting')}: ${c.name}`); el.parentElement.setAttribute('aria-valuemin', '0'); el.parentElement.setAttribute('aria-valuemax', '100'); el.parentElement.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    if (customerViews[i]?.id === c.id) updateMood(customerViews[i], c);
  });
}
function persist() { const ok = saveProgress(game); $('save-status').textContent = t(ok ? 'ui.saved' : 'ui.saveFailed'); }
function renderAll() { renderCustomers(); renderBreads(); updateIngredients(); renderRecipe(); renderStats(); persist(); }

function startShift() {
  if (game.phase === 'ended') { showResults(); return; }
  if (game.phase === 'paused') { game.resume(); previousTime = performance.now(); startMusic(); renderAll(); return; }
  if (game.active) { showPause(); return; }
  if (!game.start().ok) return;
  previousTime = performance.now();
  tone('start'); startMusic(); renderAll();
  $('serve-button').focus({ preventScroll: true });
  toast(t('ui.opened'));
}
function addIngredient(i, options = {}) {
  if (options.bread !== undefined && !game.selectBread(options.bread)) return { ok: false, reason: t('ui.invalidBread') };
  const result = game.addIngredient(i);
  if (!result.ok) { toast(result.reason, true); tone('error'); renderAll(); return result; }
  tone(); vibrate(10); renderAll();
  flySprite([], options.fromRect || $('ingredient-' + i).getBoundingClientRect(), breadViews[game.selectedBread].art.getBoundingClientRect(), i);
  pulseBread(game.selectedBread);
  const el = $('ingredient-' + i); el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
  return result;
}
function selectCustomer(i) { if (!game.selectCustomer(i)) return false; tone(); renderCustomers(); renderRecipe(); persist(); return true; }
function selectBread(i) { if (!game.selectBread(i)) return false; tone(); renderAll(); return true; }
function bakeBread(i = game.selectedBread) {
  if (game.inOven[i] && game.baked[i]) { const result = game.takeOut(i); if (result.ok) { tone(); renderAll(); toast(t('ui.takenOut')); } return result; }
  const result = game.bake(i);
  if (!result.ok) { toast(result.reason, true); tone('error'); renderAll(); return result; }
  game.selectBread(i); tone('bake'); renderAll(); toast(t('ui.baking', { seconds: result.seconds }), false, 1500); return result;
}
function serve(options = {}) {
  const bread = [...game.breads[game.selectedBread]];
  const fromRect = options.fromRect || breadViews[game.selectedBread].art.getBoundingClientRect();
  const target = game.selectedCustomer;
  const toRect = customerViews[target]?.person.getBoundingClientRect();
  const result = game.serve(options.customerId ?? game.selectedCustomerId);
  if (!result.ok) {
    toast(result.reason, true, 3500); tone('error'); vibrate([30, 35, 30]); renderStats();
    if (result.extra || result.missing || game.burnt[game.selectedBread]) wrongOrderReaction(target);
    persist();
    return result;
  }
  customerFeedback(result.customer, result.customerId, true);
  flySprite(bread, fromRect, toRect);
  tone('serve'); vibrate([10, 25, 10]); coinPop(result.coins, result.customer); renderAll();
  if (result.goalReached) { confetti(); toast(t('ui.goalReached', { goal: game.goal }), false, 3300); }
  else toast(t('ui.statusMessage', { name: result.name, coins: result.coins, tip: result.tip ? t('ui.tipFast') : '' }), false, 2200);
  return result;
}
function serveTo(customer, bread, expectedId, fromRect) {
  if (!game.active || game.customers[customer]?.id !== expectedId) { toast(t('ui.customerGone'), true); return { ok: false }; }
  if (!game.selectBread(bread) || !game.selectCustomer(customer)) return { ok: false };
  renderAll();
  return serve({ customerId: expectedId, fromRect });
}
function discard() { const result = game.discard(); if (result) { tone(); renderAll(); toast(t('ui.resetDone'), false, 1500); } else if (!game.active) toast(t('ui.noOpen'), true); return result; }

const dialog = $('game-dialog');
let resumeAfterDialog = false;
let dialogKind = '';
function openDialog(kind, html) {
  pointerControls?.cancel();
  if (!dialog.open) resumeAfterDialog = game.pause();
  dialogKind = kind;
  $('dialog-content').innerHTML = html;
  if (!dialog.open) dialog.showModal();
  renderStats();
}
function closeDialog() {
  if (dialogKind === 'result') { dialog.close(); return; }
  dialog.close();
}
dialog.addEventListener('close', () => { if (resumeAfterDialog) { previousTime = performance.now(); game.resume(); startMusic(); } resumeAfterDialog = false; dialogKind = ''; renderStats(); });
dialog.addEventListener('cancel', () => { /* Native dialog close also resumes an interrupted shift. */ });
dialog.addEventListener('click', event => { if (event.target === dialog && dialogKind !== 'result') closeDialog(); });

function showHelp() {
  openDialog('help', `<div class="modal-inner"><div class="modal-top"><h2>${t('ui.helpTitle')}</h2><button class="close-modal" data-close aria-label="${t('ui.help')}">${icon('close')}</button></div><p class="modal-intro">${t('ui.helpIntro')}</p><ol class="help-steps"><li><span class="step-number">1</span><div><strong>${t('ui.helpStep1')}</strong><small>${t('ui.helpStep1Body')}</small></div></li><li><span class="step-number">2</span><div><strong>${t('ui.helpStep2')}</strong><small>${t('ui.helpStep2Body')}</small></div></li><li><span class="step-number">3</span><div><strong>${t('ui.helpStep3')}</strong><small>${t('ui.helpStep3Body')}</small></div></li></ol><div class="help-keys"><div><kbd>Q W E</kbd> ${t('ui.customerLegend')}</div><div><kbd>A S D</kbd> ${t('ui.breadLegend')}</div><div><kbd>1–6</kbd> ${t('ui.ingredientsLegend')}</div><div><kbd>Enter</kbd> ${t('ui.serveLegend')}</div><div><kbd>B</kbd> ${t('ui.bake')}</div><div><kbd>⌫</kbd> ${t('ui.reset')}</div><div><kbd>P / Esc</kbd> ${t('ui.pause')}</div></div><button class="modal-primary" data-help-done>${game.phase === 'ready' ? t('ui.understood') : t('ui.enterKitchen')}</button><button class="modal-secondary" data-sound>${muted ? t('ui.soundOn') : t('ui.soundOff')}</button></div>`);
}
function showPause() {
  if (game.phase === 'ready') { toast(t('ui.noOpen')); return; }
  if (game.phase === 'paused' && !dialog.open) { game.resume(); previousTime = performance.now(); startMusic(); renderAll(); return; }
  if (game.phase === 'ended') { showResults(); return; }
  if (dialog.open) { closeDialog(); return; }
  openDialog('pause', `<div class="modal-inner modal-center">${food(8, 'pause-art')}<div class="modal-top"><h2>${t('ui.pauseTitle')}</h2></div><p class="modal-intro">${t('ui.pauseBody')}</p><button class="modal-primary" data-close>${t('ui.pauseContinue')}</button><button class="modal-secondary" data-sound>${muted ? t('ui.soundOn') : t('ui.soundOff')}</button></div>`);
}
function showResults() {
  const result = game.result; if (!result) return;
  openDialog('result', `<div class="modal-inner modal-center"><div class="modal-subheading">${t('ui.resultDay', { day: String(game.day).padStart(2, '0') })}</div><div class="result-stars" aria-label="${result.stars} stars">${[0, 1, 2].map(i => `<span class="${i < result.stars ? '' : 'empty'}">${icon('star', i < result.stars ? 'filled' : '')}</span>`).join('')}</div><div class="modal-top"><h2>${result.won ? t('ui.resultWin') : t('ui.resultLose')}</h2></div><p class="result-subtitle">${result.won ? t('ui.resultWinBody') : t('ui.resultLoseBody', { served: result.served, goal: result.goal })}</p>${objectivesMarkup()}<div class="result-stats"><div class="result-stat"><strong>${result.served}</strong><span>${t('ui.sold')}</span></div><div class="result-stat"><strong>${result.earned}</strong><span>${t('ui.earned')}</span></div><div class="result-stat"><strong>${result.bestCombo}</strong><span>${t('ui.bestCombo')}</span></div><div class="result-stat"><strong>${result.missed}</strong><span>${t('ui.missed')}</span></div></div>${result.bonus ? `<p class="result-bonus">${t('ui.bonus', { bonus: result.bonus })}</p>` : ''}<button class="modal-primary" data-next-day>${result.won ? t('ui.nextDay', { day: game.day + 1 }) : t('ui.retry')}</button><button class="modal-secondary" data-replay-day>${t('ui.replayDay')}</button><button class="modal-secondary" data-upgrades>${t('ui.upgradesBefore')}</button></div>`);
}
function upgradeMarkup(message = '') {
  return `<div class="modal-inner"><div class="modal-top"><h2>${t('ui.upgradeTitle')}</h2><button class="close-modal" data-close-upgrades aria-label="${t('ui.upgrade')}">${icon('close')}</button></div><div class="upgrade-wallet"><span class="coin">${icon('coin')}</span><strong>${t('ui.wallet', { coins: game.coins.toLocaleString(getLanguage() === 'vi' ? 'vi-VN' : 'en-US') })}</strong></div>${UPGRADES.map(item => {
    const level = game.upgrades[item.id]; const cost = game.upgradeCost(item.id); const max = level >= item.max;
    return `<div class="upgrade-row"><span class="upgrade-icon">${icon(item.icon)}</span><div class="upgrade-info"><h3>${upgradeLabel(item.id)}</h3><p>${upgradeLabel(item.id, true)}</p></div><div class="upgrade-controls"><span class="level-dots" aria-label="${t('ui.level', { level })}">${[0, 1, 2].map(i => `<i class="level-dot ${i < level ? 'on' : ''}"></i>`).join('')} ${level}/3</span><button class="buy-button" data-buy="${item.id}" ${max || game.coins < cost ? 'disabled' : ''}>${max ? t('ui.maxed') : t('ui.price', { price: cost })}</button></div></div>`;
  }).join('')}<div class="upgrade-feedback" role="status">${safe(message)}</div><p class="upgrade-note">${t('ui.upgradeImmediate')}</p>${game.phase === 'ended' ? `<button class="modal-primary" data-back-results>${t('ui.backToResults')}</button>` : `<button class="modal-primary" data-close>${t('ui.backToShop')}</button>`}</div>`;
}
function showUpgrades() { openDialog('upgrades', upgradeMarkup()); }

$('customers').addEventListener('click', event => { const button = event.target.closest('[data-customer]'); if (button && !button.disabled) selectCustomer(Number(button.dataset.customer)); });
$('ingredients').addEventListener('click', event => { const button = event.target.closest('[data-ingredient]'); if (!button) return; const i = Number(button.dataset.ingredient); if (game.active && game.breads[game.selectedBread].includes(i)) { game.removeIngredient(i); tone(); renderAll(); pulseBread(game.selectedBread); } else addIngredient(i); });
$('bread-slots').addEventListener('click', event => {
  const bake = event.target.closest('[data-bake-slot]');
  if (bake) { bakeBread(Number(bake.dataset.bakeSlot)); return; }
  const remove = event.target.closest('[data-remove]');
  if (remove) { const index = Number(remove.dataset.fromBread); game.selectBread(index); if (game.removeIngredient(Number(remove.dataset.remove))) { tone(); renderAll(); document.querySelector(`[data-select-bread="${index}"]`)?.focus({ preventScroll: true }); } return; }
  const button = event.target.closest('[data-select-bread]'); if (button) { const i = Number(button.dataset.selectBread); selectBread(i); document.querySelector(`[data-select-bread="${i}"]`)?.focus({ preventScroll: true }); }
});
$('mobile-goals').addEventListener('click', () => openDialog('goals', `<div class="modal-inner"><div class="modal-top"><h2>${t('ui.dailyGoals')}</h2><button class="close-modal" data-close aria-label="${t('ui.backToShop')}">${icon('close')}</button></div>${objectivesMarkup()}<p>${t('ui.saved')}</p></div>`));
$('mobile-order').addEventListener('click', () => { const c = game.customers[game.selectedCustomer]; openDialog('order', `<div class="modal-inner"><div class="modal-top"><h2>${t('ui.currentOrder')}</h2><button class="close-modal" data-close aria-label="${t('ui.backToShop')}">${icon('close')}</button></div>${c ? `<p>${safe(c.name)} · ${t('ui.' + c.personality)}</p><p>${t('ui.' + c.personality + 'Hint')}</p><h3>${recipeLabel(RECIPES[c.recipe],true)}</h3>${$('recipe-list').innerHTML}` : t('ui.noCustomer')}</div>`); });
$('start-button').addEventListener('click', startShift);
$('serve-button').addEventListener('click', serve);
$('discard-button').addEventListener('click', discard);
$('pause-button').addEventListener('click', showPause);
$('sound-button').addEventListener('click', toggleSound);
$('help-button').addEventListener('click', showHelp);
$('upgrade-button').addEventListener('click', showUpgrades);
$('dialog-content').addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  if (button.hasAttribute('data-close')) closeDialog();
  if (button.hasAttribute('data-close-upgrades')) game.phase === 'ended' ? showResults() : closeDialog();
  if (button.hasAttribute('data-help-done')) { const ready = game.phase === 'ready'; closeDialog(); if (ready) startShift(); }
  if (button.hasAttribute('data-sound')) { toggleSound(); button.textContent = muted ? t('ui.soundOn') : t('ui.soundOff'); }
  if (button.hasAttribute('data-next-day') || button.hasAttribute('data-replay-day')) {
    resumeAfterDialog = false;
    const previousDay = game.day;
    game.nextDay(button.hasAttribute('data-replay-day'));
    const unlocked = RECIPES.filter(recipe => recipe.unlockDay === game.day);
    closeDialog(); renderAll();
    if (game.day > previousDay) { $('level-badge').classList.remove('level-up'); void $('level-badge').offsetWidth; $('level-badge').classList.add('level-up'); }
    startShift();
    if (game.day > previousDay) toast(unlocked.length ? `${t('ui.levelUp', { level: game.day })} ${t('ui.unlockDish', { name: recipeLabel(unlocked[0], true) })}` : t('ui.levelUp', { level: game.day }), false, 3800);
  }
  if (button.hasAttribute('data-upgrades')) showUpgrades();
  if (button.hasAttribute('data-back-results')) showResults();
  if (button.hasAttribute('data-buy')) {
    const result = game.buyUpgrade(button.dataset.buy); if (result.ok) { tone('upgrade'); renderAll(); }
    $('dialog-content').innerHTML = upgradeMarkup(result.ok ? t('ui.upgradeSuccess') : result.reason);
    document.querySelector(`[data-buy="${button.dataset.buy}"]:not(:disabled)`)?.focus({ preventScroll: true });
  }
});

document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
  const key = event.key.toLowerCase();
  if (pointerControls?.dragging) pointerControls.cancel();
  if (dialog.open) { if (key === 'p' && dialogKind === 'pause') { event.preventDefault(); closeDialog(); } return; }
  if (key === 'p' || key === 'escape') { event.preventDefault(); showPause(); return; }
  if (key === 'h' || key === '?') { event.preventDefault(); showHelp(); return; }
  if (key === 'm') { event.preventDefault(); toggleSound(); return; }
  // Space and Tab keep native button activation and navigation; shortcuts work anywhere else.
  if (key === 'enter') {
    if (event.target.closest('.topbar-actions, .game-sidebar')) return;
    if (game.phase === 'ready' && (event.target === document.body || event.target.id === 'start-button')) { event.preventDefault(); startShift(); }
    else if (game.active) { event.preventDefault(); serve(); }
    return;
  }
  if (/^[1-6]$/.test(key)) { event.preventDefault(); addIngredient(Number(key) - 1); return; }
  if (key === 'b') { event.preventDefault(); bakeBread(); return; }
  if ('qwe'.includes(key) && key.length === 1) { event.preventDefault(); selectCustomer('qwe'.indexOf(key)); return; }
  if ('asd'.includes(key) && key.length === 1) { event.preventDefault(); selectBread('asd'.indexOf(key)); return; }
  if (key === 'backspace' || key === 'delete') { event.preventDefault(); discard(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (game.active) showPause(); persist(); } });
window.addEventListener('pagehide', () => { stopMusic(); if (game.active) game.pause(); persist(); });
window.addEventListener('pageshow', () => { if (game.phase === 'paused' && !dialog.open) { game.resume(); startMusic(); showPause(); } });

let previousTime = performance.now();
setInterval(() => {
  const now = performance.now(); const elapsed = (now - previousTime) / 1000; previousTime = now;
  if (!game.active) return;
  const events = game.tick(elapsed);
  if (events.length) {
    events.filter(event => event.type === 'baked').forEach(event => { if (!game.burnt[event.slot]) { tone('ready'); pulseBread(event.slot); toast(t('ui.readySlot', { slot: event.slot + 1 }), false, 3000); } });
    events.filter(event => event.type === 'burnt').forEach(event => { tone('error'); toast(t('ui.burntSlot', { slot: event.slot + 1 }), true); });
    events.filter(event => event.type === 'left').forEach(event => customerFeedback(event.slot, event.customerId, false));
    renderAll();
    const departed = events.filter(event => event.type === 'left');
    if (departed.length) { toast(departed.map(event => t('ui.leaveWarning', { name: event.name })).join(' '), true); tone('error'); }
    if (events.some(event => event.type === 'finished')) { tone(game.result.won ? 'serve' : 'error'); if (game.result.won) confetti(); showResults(); }
  } else renderClock();
}, 100);
setInterval(() => { if (game.active) persist(); }, 1000);

function registerGameTools() {
  const context = document.modelContext; if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  const definitions = [
    { name: 'read_banh_mi_game', title: 'Đọc trạng thái quán bánh mì', description: 'Read current shift, customers, exact order ingredients, breads, coins and upgrades.', annotations: { readOnlyHint: true, untrustedContentHint: false }, inputSchema: { type: 'object', properties: {}, additionalProperties: false }, execute: () => game.snapshot() },
    { name: 'start_banh_mi_shift', title: 'Mở quán', description: 'Start the ready shift. This starts the countdown and customer patience timers.', annotations: { readOnlyHint: false, untrustedContentHint: false }, inputSchema: { type: 'object', properties: {}, additionalProperties: false }, execute: () => { if (dialog.open || game.phase !== 'ready') throw new Error('Close the dialog and prepare a new shift first.'); startShift(); return game.snapshot(); } },
    { name: 'prepare_banh_mi', title: 'Chuẩn bị một ổ bánh', description: 'Select a customer and bread, then add the listed ingredients. Does not serve the bread. Slots are zero-based; duplicate ingredients are rejected.', annotations: { readOnlyHint: false, untrustedContentHint: false }, inputSchema: { type: 'object', properties: { customer: { type: 'integer', minimum: 0, maximum: 2 }, bread: { type: 'integer', minimum: 0, maximum: 2 }, ingredients: { type: 'array', items: { type: 'string', enum: INGREDIENTS.map(i => i.id) }, uniqueItems: true, maxItems: 6 } }, required: ['customer', 'bread', 'ingredients'], additionalProperties: false }, execute: input => {
      if (!input || typeof input !== 'object' || Object.keys(input).some(key => !['customer', 'bread', 'ingredients'].includes(key))) throw new Error('Invalid input.');
      const { customer, bread, ingredients } = input;
      if (!game.active || dialog.open) throw new Error('The shift must be active and dialogs closed.');
      if (!Number.isInteger(customer) || !game.customers[customer] || !Number.isInteger(bread) || bread < 0 || bread > 2 || !Array.isArray(ingredients) || ingredients.length > 6 || new Set(ingredients).size !== ingredients.length) throw new Error('Invalid customer, bread, or ingredients.');
      const indices = ingredients.map(id => INGREDIENTS.findIndex(i => i.id === id));
      if (indices.some(i => i < 0 || game.breads[bread].includes(i))) throw new Error('Unknown or already-added ingredient.');
      game.selectCustomer(customer); game.selectBread(bread); indices.forEach(i => game.addIngredient(i)); renderAll(); return game.snapshot();
    } },
    { name: 'bake_banh_mi', title: 'Nướng ổ bánh đang chọn', description: 'Bake for four seconds. When golden, call again to take out safely within ten seconds, or deliver before it burns.', annotations: { readOnlyHint: false, untrustedContentHint: false }, inputSchema: { type: 'object', properties: { bread: { type: 'integer', minimum: 0, maximum: 2 } }, additionalProperties: false }, execute: input => { if (dialog.open || !game.active) throw new Error('The shift is not active.'); if (input?.bread !== undefined) game.selectBread(input.bread); const result = bakeBread(); if (!result.ok) throw new Error(result.reason); return game.snapshot(); } },
    { name: 'serve_banh_mi', title: 'Phục vụ ổ bánh đang chọn', description: 'Serve the selected baked bread to the selected customer. A correct recipe earns coins; a mismatch resets the combo and leaves the bread editable.', annotations: { readOnlyHint: false, untrustedContentHint: false }, inputSchema: { type: 'object', properties: {}, additionalProperties: false }, execute: () => { if (dialog.open || !game.active) throw new Error('The shift is not active.'); return { result: serve(), state: game.snapshot() }; } },
  ];
  definitions.forEach(definition => { try { Promise.resolve(context.registerTool(definition, { signal: lifecycle.signal })).catch(() => {}); } catch { /* The game works without experimental WebMCP support. */ } });
}

function applyStaticLanguage() {
  const language = getLanguage();
  document.documentElement.lang = language === 'vi' ? 'vi' : 'en';
  const text = {
    'brand-eyebrow': 'ui.eyebrow', 'wallet-unit': 'ui.coins', 'worktop-label': 'ui.worktop', 'worktop-hint': 'ui.worktopHint',
    'discard-label': 'ui.reset', 'serve-hint': 'ui.orderTip', 'drag-instruction': 'ui.dragInstruction', 'day-label': 'ui.day',
    'goal-label': 'ui.goal', 'earned-label': 'ui.coinsEarned', 'missed-label': 'ui.customersLeft', 'recipe-eyebrow': 'ui.currentOrder',
    'upgrade-label': 'ui.upgrade', 'upgrade-sub': 'ui.upgradeSub', 'customer-legend': 'ui.customerLegend', 'bread-legend': 'ui.breadLegend',
    'ingredients-legend': 'ui.ingredientsLegend', 'serve-legend': 'ui.serveLegend', 'footer-a': 'ui.footerA',
  };
  Object.entries(text).forEach(([id, key]) => { const element = $(id); if (element) element.textContent = t(key); });
  $('brand-title').textContent = t('ui.title');
  $('fresh-label').innerHTML = `<span class="tiny-spark">${icon('check')}</span> ${t('ui.fresh')}`;
  $('desktop-note').innerHTML = `${t('ui.desktopHint')} <kbd>1</kbd>–<kbd>6</kbd>`;
  $('touch-note').textContent = t('ui.touchHint');
  $('shift-title').textContent = t('ui.shiftTitle');
  $('device-hint').innerHTML = `${t('ui.footerB').replace(' · ', ' <span class="footer-dot">·</span> ')}`;
  $('kitchen').setAttribute('aria-label', t('ui.kitchen'));
  $('customers').setAttribute('aria-label', t('ui.customerLegend'));
  $('ingredients').setAttribute('aria-label', t('ui.ingredientsLegend'));
  $('bread-slots').setAttribute('aria-label', t('ui.breadSlots'));
  document.querySelector('.recipe-panel').setAttribute('aria-label', t('ui.currentOrder'));
  $('game-dialog').setAttribute('aria-label', t('ui.info'));
  const languageButton = $('language-button');
  languageButton.querySelector('#language-en').classList.toggle('active', language === 'en');
  languageButton.querySelector('#language-vi').classList.toggle('active', language === 'vi');
  languageButton.setAttribute('aria-label', language === 'en' ? t('ui.switchToVietnamese') : t('ui.switchToEnglish'));
  languageButton.title = languageButton.getAttribute('aria-label');
}

$('language-button').addEventListener('click', () => { persist(); setLanguage(getLanguage() === 'en' ? 'vi' : 'en'); window.location.reload(); });
document.querySelectorAll('.coin').forEach(el => el.innerHTML = icon('coin'));
$('help-button').innerHTML = icon('help'); $('mobile-order').innerHTML = icon('order');
document.querySelector('.shift-symbol').innerHTML = icon('sun'); document.querySelector('.upgrade-arrow').innerHTML = icon('arrow');
$('trash-icon').innerHTML = icon('trash'); $('serve-icon').innerHTML = icon('serve'); $('upgrade-icon').innerHTML = icon('upgrade');
applyStaticLanguage();
renderSound(); renderIngredients(); renderAll(); registerGameTools();
if (restored && game.phase === 'ended') showResults();
pointerControls = installPointerControls({ surface: document.querySelector('.kitchen'), game, blocked: () => dialog.open, actions: { addIngredient, selectBread, serveTo, discard, message: message => toast(message) } });
