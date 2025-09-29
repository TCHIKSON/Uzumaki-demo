export function initRoving(container, onBack) {
  let current = container.querySelector('.card[tabindex="0"]') || container.querySelector('.card');
  if (current) current.setAttribute('tabindex','0');

  container.addEventListener('keydown', (e) => {
    const cards = [...container.querySelectorAll('.card')]; if (!cards.length) return;
    const cw = cards[0].offsetWidth || 240; const cols = Math.max(1, Math.round(container.offsetWidth / cw));
    const idx = Math.max(0, cards.indexOf(document.activeElement));
    let next = idx;
    if (e.key === 'ArrowRight') next = Math.min(idx + 1, cards.length - 1);
    else if (e.key === 'ArrowLeft') next = Math.max(idx - 1, 0);
    else if (e.key === 'ArrowDown') next = Math.min(idx + cols, cards.length - 1);
    else if (e.key === 'ArrowUp') next = Math.max(idx - cols, 0);
    else if (e.key === 'Backspace' || e.key === 'Escape' || (e.keyCode === 10009 && !e.key)) { e.preventDefault(); onBack?.(); return; }
    else return;
    e.preventDefault(); cards.forEach(c => c.setAttribute('tabindex','-1')); cards[next].setAttribute('tabindex','0'); cards[next].focus();
  });
}
