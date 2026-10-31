// Material "ripple" touch feedback (classic script, extension pages only).
(() => {
  const SEL = '.btn, .act, .tab, .sn-tool, .seg button, .menu button, .li, .ripple';
  document.addEventListener('pointerdown', e => {
    if (e.button) return;
    const el = e.target.closest && e.target.closest(SEL);
    if (!el || el.disabled) return;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const r = el.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const s = document.createElement('span');
    s.className = 'rpl';
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    el.appendChild(s);
    setTimeout(() => s.remove(), 650);
  }, true);
})();
