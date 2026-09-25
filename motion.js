(() => {
  const { gsap, ScrollTrigger } = window;
  if (!gsap) return;

  const photo = document.querySelector('.photo');
  const photoFrame = document.querySelector('.photo-col');
  const image = photo?.querySelector('img');
  if (!photo || !photoFrame || !image) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let context;

  document.body.classList.add('motion-ready');
  if (ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  function setMotion(reduced, intro = false) {
    context?.revert();
    context = null;

    context = gsap.context(() => {
      if (intro && !reduced) {
        gsap.timeline({ defaults: { ease: 'power3.out', clearProps: 'transform,opacity' } })
          .from(photoFrame, { opacity: 0, x: -24, duration: 0.9 })
          .from('.content-col', { opacity: 0, x: 24, duration: 0.8 }, '-=0.65')
          .from('.greeting span', { opacity: 0, y: 20, stagger: 0.08, duration: 0.55 }, '-=0.5')
          .from('.quote-line', { opacity: 0, y: 10, duration: 0.5 }, '-=0.3')
          .from('.links', { opacity: 0, y: 10, duration: 0.5 }, '-=0.3');
      }

      const listeners = new AbortController();
      const listen = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal: listeners.signal });
      if (ScrollTrigger) {
        if (!reduced) {
          gsap.to('.ambient-visual img', {
            x: -16, y: -28, ease: 'none',
            scrollTrigger: { start: 0, end: 'max', scrub: 0.8 },
          });
        }
        gsap.to('.scroll-progress span', {
          scaleX: 1, ease: 'none',
          scrollTrigger: { start: 0, end: 'max', scrub: reduced ? true : 0.2 },
        });
        listen(image, 'load', () => ScrollTrigger.refresh());
        ScrollTrigger.refresh();
      }

      // The frame stays still. Overscan exceeds pan limits to keep its edges covered.
      gsap.set(image, { xPercent: 0, yPercent: 0, scale: 1 });
      const follow = (property, unit) => reduced
        ? gsap.quickSetter(image, property, unit)
        : gsap.quickTo(image, property, { duration: 0.45, ease: 'power3.out' });
      const panX = follow('xPercent', '%');
      const panY = follow('yPercent', '%');
      const scaleX = follow('scaleX');
      const scaleY = follow('scaleY');
      const zoom = value => { scaleX(value); scaleY(value); };
      const clamp = value => Math.max(-10, Math.min(10, value));
      let x = 0;
      let y = 0;
      const render = () => { zoom(1.24); panX(x); panY(y); };
      const reset = () => { x = 0; y = 0; panX(0); panY(0); zoom(1); };
      const move = event => {
        if (event.pointerType !== 'mouse') return;
        const rect = photo.getBoundingClientRect();
        x = clamp((0.5 - (event.clientX - rect.left) / rect.width) * 20);
        y = clamp((0.5 - (event.clientY - rect.top) / rect.height) * 20);
        render();
      };
      listen(photo, 'pointerenter', move);
      listen(photo, 'pointermove', move);
      listen(photo, 'wheel', event => {
        if (event.ctrlKey || event.metaKey) return;
        const rect = photo.getBoundingClientRect();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
        const nextX = clamp(x - event.deltaX * unit / rect.width * 100);
        const nextY = clamp(y - event.deltaY * unit / rect.height * 100);
        // At an image edge, let the wheel continue scrolling the page normally.
        if (nextX === x && nextY === y) return;
        event.preventDefault();
        x = nextX;
        y = nextY;
        render();
      }, { passive: false });
      listen(photo, 'pointerleave', reset);
      listen(photo, 'pointercancel', reset);
      listen(photo, 'pointerdown', event => {
        if (event.pointerType !== 'mouse') reset();
      });
      listen(window, 'blur', reset);
      listen(document, 'visibilitychange', () => { if (document.hidden) reset(); });

      if (!reduced) document.querySelectorAll('.links a').forEach(link => {
        const x = gsap.quickTo(link, 'x', { duration: 0.3, ease: 'power3.out' });
        const y = gsap.quickTo(link, 'y', { duration: 0.3, ease: 'power3.out' });
        const resetLink = () => { x(0); y(0); };
        listen(link, 'pointermove', event => {
          if (event.pointerType !== 'mouse') return;
          const rect = link.getBoundingClientRect();
          x((event.clientX - rect.left - rect.width / 2) * 0.14);
          y((event.clientY - rect.top - rect.height / 2) * 0.14);
        });
        listen(link, 'pointerleave', resetLink);
        listen(link, 'pointercancel', resetLink);
        listen(link, 'blur', resetLink);
        listen(window, 'blur', resetLink);
      });
      return () => listeners.abort();
    });
  }

  reducedMotion.addEventListener('change', () => {
    setMotion(reducedMotion.matches);
  });

  setMotion(reducedMotion.matches, true);
})();
