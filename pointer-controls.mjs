import { breadMask, breadSprite } from './bread-art.mjs';
import { t } from './i18n.mjs';

// Pointer Events share one gesture path for mouse, touch and pen.
// A drag consumes its following synthetic click; a tap keeps native click behavior.
export function installPointerControls({ surface, game, blocked, actions }) {
  const doc = surface.ownerDocument;
  let gesture = null;
  let suppressClickUntil = 0;
  let highlighted = null;
  const instruction = doc.getElementById('drag-instruction');
  const defaultInstruction = instruction.textContent;

  function clearTarget() { highlighted?.classList.remove('drop-target'); highlighted = null; }
  function targetAt(x, y, type) {
    const element = doc.elementFromPoint(x, y);
    if (!element) return null;
    if (type === 'ingredient') {
      const bread = element.closest('[data-bread]');
      return bread && surface.contains(bread) ? { type: 'bread', element: bread, index: Number(bread.dataset.bread) } : null;
    }
    const trash = element.closest('#discard-button');
    if (trash) return { type: 'trash', element: trash };
    const customer = element.closest('[data-customer-slot]');
    if (!customer || !surface.contains(customer)) return null;
    const slot = Number(customer.dataset.customerSlot);
    const current = game.customers[slot];
    if (!current || customer.dataset.customerId !== String(current.id)) return null;
    return { type: 'customer', element: customer, index: slot, customerId: current.id, name: current.name };
  }
  function cleanup() {
    const previous = gesture; gesture = null;
    clearTarget(); previous?.ghost?.remove();
    surface.classList.remove('is-dragging', 'dragging-bread', 'dragging-ingredient');
    instruction.textContent = defaultInstruction;
    if (previous) {
      try { if (previous.source.hasPointerCapture?.(previous.pointerId)) previous.source.releasePointerCapture(previous.pointerId); } catch { /* Already released by the browser. */ }
    }
    return previous;
  }
  function cancel() {
    if (gesture?.started) suppressClickUntil = performance.now() + 500;
    cleanup();
  }
  function beginDrag(current) {
    if (!game.active || blocked()) return false;
    if (current.type === 'bread' && game.baking[current.index] > 0) { actions.message(t('ui.bakingNow')); return false; }
    if (current.type === 'bread' && !game.breads[current.index].length) { actions.message(t('ui.noFilling')); return false; }
    current.started = true;
    current.originRect = current.source.getBoundingClientRect();
    current.mask = current.type === 'bread' ? breadMask(game.breads[current.index]) : null;
    const ghost = doc.createElement('span'); ghost.setAttribute('aria-hidden', 'true');
    ghost.className = 'drag-ghost ' + (current.type === 'ingredient' ? `food food-${current.index}` : 'bread-sprite');
    if (current.type === 'bread') {
      const sprite = breadSprite(game.breads[current.index]);
      ghost.style.backgroundImage = `url('${sprite.url}')`;
      ghost.style.backgroundPosition = `${sprite.column * 100 / 3}% ${sprite.row * 100 / 3}%`;
      if (game.burnt[current.index]) { ghost.style.backgroundImage = "url('/assets/bread-burnt.webp')"; ghost.style.backgroundSize = 'contain'; ghost.style.backgroundPosition = 'center'; }
      actions.selectBread(current.index);
    }
    current.size = current.type === 'ingredient' ? 53 : 115;
    ghost.style.width = ghost.style.height = `${current.size}px`;
    current.ghost = ghost; doc.body.append(ghost);
    surface.classList.add('is-dragging', `dragging-${current.type}`);
    return true;
  }
  function down(event) {
    if (event.button !== 0 || event.isPrimary === false || gesture || blocked() || !game.active) return;
    const ingredient = event.target.closest('[data-ingredient]');
    const bread = event.target.closest('[data-select-bread]');
    const source = ingredient || bread;
    if (!source || !surface.contains(source)) return;
    gesture = { pointerId: event.pointerId, source, type: ingredient ? 'ingredient' : 'bread', index: Number(ingredient ? source.dataset.ingredient : source.dataset.selectBread), x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch', started: false, ghost: null };
    try { source.setPointerCapture(event.pointerId); } catch { /* Document listeners still receive mouse events. */ }
  }
  function move(event) {
    const current = gesture;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!game.active || blocked()) { cancel(); return; }
    if (!current.started) {
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < (current.touch ? 9 : 6)) return;
      if (!beginDrag(current)) { cancel(); return; }
    }
    event.preventDefault();
    const x = event.clientX - current.size / 2;
    const y = event.clientY - current.size / 2 - (current.touch ? 23 : 0);
    current.ghost.style.transform = `translate3d(${x}px,${y}px,0)`;
    clearTarget();
    const target = targetAt(event.clientX, event.clientY, current.type);
    if (target) {
      highlighted = target.element; highlighted.classList.add('drop-target');
      instruction.textContent = target.type === 'bread' ? t('ui.addToBread', { slot: target.index + 1 }) : target.type === 'trash' ? t('ui.resetDrop') : t('ui.deliverTo', { name: target.name });
    } else instruction.textContent = current.type === 'ingredient' ? t('ui.dragToBread') : t('ui.dragToCustomer');
  }
  function up(event) {
    const current = gesture;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.started) { cleanup(); return; }
    event.preventDefault(); suppressClickUntil = performance.now() + 500;
    const target = targetAt(event.clientX, event.clientY, current.type);
    const fromRect = current.originRect;
    cleanup();
    if (!game.active || blocked()) return;
    if (!target) { actions.message(t('ui.wrongDrop')); return; }
    if (current.type === 'ingredient') actions.addIngredient(current.index, { bread: target.index, fromRect });
    else if (breadMask(game.breads[current.index]) !== current.mask) actions.message(t('ui.breadChanged'));
    else if (target.type === 'trash') { actions.selectBread(current.index); actions.discard(); }
    else actions.serveTo(target.index, current.index, target.customerId, fromRect);
  }
  surface.addEventListener('pointerdown', down);
  doc.addEventListener('pointermove', move, { passive: false });
  doc.addEventListener('pointerup', up, { passive: false });
  doc.addEventListener('pointercancel', event => { if (gesture?.pointerId === event.pointerId) cancel(); });
  surface.addEventListener('lostpointercapture', event => { if (gesture?.pointerId === event.pointerId) cancel(); });
  surface.addEventListener('click', event => {
    if (event.detail !== 0 && performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  return { cancel, get dragging() { return !!gesture?.started; } };
}
