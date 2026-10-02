(() => {
  'use strict';
  const frame = document.querySelector('.photo');
  const image = frame?.querySelector('img');
  if (!image) return;

  const initial = { x: 0.58, y: 0.5 };
  const fraction = { ...initial };
  const bounds = { x: 0, y: 0, width: 0, height: 0 };
  let x = 0;
  let y = 0;
  let drag = null;
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
    if (Math.abs(width - bounds.width) > 0.01 || Math.abs(height - bounds.height) > 0.01) finishDrag();

    // Size the complete image, not a frame-sized element already cropped by object-fit.
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const imageWidth = image.naturalWidth * scale;
    const imageHeight = image.naturalHeight * scale;
    bounds.width = width;
    bounds.height = height;
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
    Object.assign(fraction, initial);
    moveTo(bounds.x * initial.x, bounds.y * initial.y);
  }

  listen(frame, 'pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || !(bounds.x || bounds.y)) return;
    finishDrag();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    frame.setPointerCapture(event.pointerId);
    frame.dataset.dragging = '';
    if (event.pointerType === 'mouse') {
      event.preventDefault();
      frame.focus({ preventScroll: true });
    }
  });

  listen(frame, 'pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (event.pointerType === 'mouse' && !(event.buttons & 1)) { finishDrag(); return; }
    moveTo(x - (event.clientX - drag.x), y - (event.clientY - drag.y));
    drag.x = event.clientX;
    drag.y = event.clientY;
  });

  // Global listeners only end an existing gesture; they never block page input.
  // A second finger, even outside the frame, belongs to the browser's pinch gesture.
  listen(window, 'pointerdown', event => {
    if (drag && event.pointerType === 'touch' && event.pointerId !== drag.id) finishDrag();
  }, { capture: true });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    listen(frame, type, event => { if (event.pointerId === drag?.id) finishDrag(); });
  }
  listen(window, 'blur', finishDrag);
  listen(document, 'visibilitychange', () => { if (document.hidden) finishDrag(); });
  listen(image, 'dragstart', event => event.preventDefault());

  listen(frame, 'wheel', event => {
    if (event.ctrlKey || event.metaKey || !event.cancelable || !(bounds.x || bounds.y)) return;
    let dx = event.deltaX;
    let dy = event.deltaY;
    if (event.deltaMode === 1) {
      const style = getComputedStyle(frame);
      const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
      dx *= line;
      dy *= line;
    } else if (event.deltaMode === 2) {
      dx *= bounds.width;
      dy *= bounds.height;
    }

    if (bounds.x && bounds.y) {
      if (event.shiftKey && dx === 0) [dx, dy] = [dy, 0];
    } else {
      // A vertical wheel can explore a landscape source in a narrow frame.
      const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      dx = bounds.x ? delta : 0;
      dy = bounds.y ? delta : 0;
    }
    if (moveTo(x + dx, y + dy)) event.preventDefault();
  }, { passive: false });

  listen(frame, 'keydown', event => {
    if (event.target !== frame || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Home') {
      if (bounds.x || bounds.y) { event.preventDefault(); reset(); }
      return;
    }
    const step = event.shiftKey ? 80 : 24;
    const directions = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = directions[event.key];
    if (delta && moveTo(x + delta[0], y + delta[1])) event.preventDefault();
  });

  listen(image, 'load', measure);
  listen(image, 'error', () => {
    finishDrag();
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
    if (!event.persisted) { observer.disconnect(); listeners.abort(); }
  });
  measure();
})();
