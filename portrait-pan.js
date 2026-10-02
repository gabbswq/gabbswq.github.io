(() => {
  'use strict';
  const frame = document.querySelector('.photo');
  const image = frame?.querySelector('img');
  if (!image) return;

  const initial = { x: 0.58, y: 0.5 };
  const fraction = { ...initial };
  const bounds = { x: 0, y: 0, width: 0, height: 0, insetX: 0, insetY: 0 };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let x = 0;
  let y = 0;
  let drag = null;
  let hoverMotion = null;
  let animationFrame = 0;
  const listeners = new AbortController();
  const listen = (target, type, handler, options = {}) =>
    target.addEventListener(type, handler, { ...options, signal: listeners.signal });
  const clamp = (value, max) => Math.max(0, Math.min(max, value));

  function render() {
    image.style.transform = `translate3d(${-x}px, ${-y}px, 0)`;
  }

  function moveTo(nextX, nextY) {
    const clampedX = clamp(nextX, bounds.x);
    const clampedY = clamp(nextY, bounds.y);
    if (clampedX === x && clampedY === y) return false;
    x = clampedX;
    y = clampedY;
    if (bounds.x) fraction.x = x / bounds.x;
    if (bounds.y) fraction.y = y / bounds.y;
    render();
    return true;
  }

  function stopHover() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    hoverMotion = null;
  }

  function animateHover(now) {
    animationFrame = 0;
    if (!hoverMotion) return;
    const { targetX, targetY, time } = hoverMotion;
    const amount = 1 - Math.exp(-Math.max(0, now - time) / 70);
    hoverMotion.time = now;
    const nextX = x + (targetX - x) * amount;
    const nextY = y + (targetY - y) * amount;
    if (Math.abs(targetX - nextX) < 0.05 && Math.abs(targetY - nextY) < 0.05) {
      moveTo(targetX, targetY);
      hoverMotion = null;
      return;
    }
    moveTo(nextX, nextY);
    animationFrame = requestAnimationFrame(animateHover);
  }

  function followMouse(event) {
    if (!(bounds.x || bounds.y)) return;
    const rect = frame.getBoundingClientRect();
    const u = clamp((event.clientX - rect.left - bounds.insetX) / bounds.width, 1);
    const v = clamp((event.clientY - rect.top - bounds.insetY) / bounds.height, 1);
    const targetX = u * bounds.x;
    const targetY = v * bounds.y;
    if (reducedMotion.matches) {
      stopHover();
      moveTo(targetX, targetY);
      return;
    }
    // The target follows absolute pointer position; only its presentation is eased.
    hoverMotion = { targetX, targetY, time: hoverMotion?.time ?? performance.now() };
    if (!animationFrame) animationFrame = requestAnimationFrame(animateHover);
  }

  function finishDrag() {
    const previous = drag;
    drag = null;
    delete frame.dataset.dragging;
    if (previous && frame.hasPointerCapture(previous.id)) frame.releasePointerCapture(previous.id);
  }

  function measure() {
    if (!image.complete || !image.naturalWidth || !image.naturalHeight) return;
    const rect = frame.getBoundingClientRect();
    const style = getComputedStyle(frame);
    const width = rect.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
    const height = rect.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth);
    if (width <= 0 || height <= 0) return;
    if (Math.abs(width - bounds.width) > 0.01 || Math.abs(height - bounds.height) > 0.01) {
      finishDrag();
      stopHover();
    }

    // Size the complete image, not a frame-sized element already cropped by object-fit.
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const imageWidth = image.naturalWidth * scale;
    const imageHeight = image.naturalHeight * scale;
    bounds.width = width;
    bounds.height = height;
    bounds.insetX = parseFloat(style.borderLeftWidth);
    bounds.insetY = parseFloat(style.borderTopWidth);
    bounds.x = imageWidth - width > 0.01 ? imageWidth - width : 0;
    bounds.y = imageHeight - height > 0.01 ? imageHeight - height : 0;
    image.style.width = `${imageWidth}px`;
    image.style.height = `${imageHeight}px`;
    x = bounds.x * fraction.x;
    y = bounds.y * fraction.y;
    render();
    frame.dataset.panReady = '';
    frame.dataset.panAxis = bounds.x ? (bounds.y ? 'both' : 'x') : (bounds.y ? 'y' : 'none');
    const available = Boolean(bounds.x || bounds.y);
    if (available) {
      frame.tabIndex = 0;
      frame.setAttribute('aria-describedby', 'portrait-help');
      frame.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Home');
    } else {
      frame.removeAttribute('tabindex');
      frame.removeAttribute('aria-describedby');
      frame.removeAttribute('aria-keyshortcuts');
    }
  }

  function reset() {
    finishDrag();
    stopHover();
    Object.assign(fraction, initial);
    moveTo(bounds.x * initial.x, bounds.y * initial.y);
  }

  listen(frame, 'pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    if (!event.isPrimary || event.button !== 0 || !(bounds.x || bounds.y)) return;
    finishDrag();
    stopHover();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    frame.setPointerCapture(event.pointerId);
    frame.dataset.dragging = '';
  });

  listen(frame, 'pointermove', event => {
    if (event.pointerType === 'mouse') {
      followMouse(event);
      return;
    }
    if (!drag || event.pointerId !== drag.id) return;
    moveTo(x - (event.clientX - drag.x), y - (event.clientY - drag.y));
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  listen(frame, 'pointerleave', event => { if (event.pointerType === 'mouse') stopHover(); });

  // Global listeners only end an existing gesture; they never block page input.
  // A second finger, even outside the frame, belongs to the browser's pinch gesture.
  listen(window, 'pointerdown', event => {
    if (drag && event.pointerType === 'touch' && event.pointerId !== drag.id) finishDrag();
  }, { capture: true });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    listen(frame, type, event => { if (event.pointerId === drag?.id) finishDrag(); });
  }
  listen(window, 'blur', () => { finishDrag(); stopHover(); });
  listen(document, 'visibilitychange', () => { if (document.hidden) { finishDrag(); stopHover(); } });
  listen(image, 'dragstart', event => event.preventDefault());

  listen(frame, 'keydown', event => {
    if (event.target !== frame || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Home') {
      if (bounds.x || bounds.y) { event.preventDefault(); reset(); }
      return;
    }
    const step = event.shiftKey ? 80 : 24;
    const directions = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = directions[event.key];
    if (delta) {
      stopHover();
      if (moveTo(x + delta[0], y + delta[1])) event.preventDefault();
    }
  });

  listen(reducedMotion, 'change', event => {
    if (event.matches && hoverMotion) {
      const { targetX, targetY } = hoverMotion;
      stopHover();
      moveTo(targetX, targetY);
    }
  });

  listen(image, 'load', measure);
  listen(image, 'error', () => {
    finishDrag();
    stopHover();
    bounds.x = bounds.y = 0;
    delete frame.dataset.panReady;
    delete frame.dataset.panAxis;
    frame.removeAttribute('tabindex');
    frame.removeAttribute('aria-describedby');
    frame.removeAttribute('aria-keyshortcuts');
    for (const property of ['width', 'height', 'transform']) image.style.removeProperty(property);
  });
  const observer = new ResizeObserver(measure);
  observer.observe(frame);
  listen(window, 'resize', measure);
  listen(window, 'pageshow', measure);
  listen(window, 'pagehide', event => {
    finishDrag();
    stopHover();
    if (!event.persisted) { observer.disconnect(); listeners.abort(); }
  });
  measure();
})();
