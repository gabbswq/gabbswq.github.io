(() => {
  const { gsap, ScrollTrigger } = window;
  if (!gsap) return;

  const photo = document.querySelector('.photo');
  const photoFrame = document.querySelector('.photo-col');
  const image = photo?.querySelector('img');
  const control = document.querySelector('.motion-control');
  const toggle = control?.querySelector('button');
  const tooltip = control?.querySelector('[role="tooltip"]');
  if (!photo || !photoFrame || !image || !toggle || !tooltip) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const storageKey = 'gabriel-portfolio-motion';
  let preference = null;
  let context;
  let enabled = false;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'on' || saved === 'off') preference = saved;
  } catch { /* Private browsing may disable storage; the control still works. */ }

  document.body.classList.add('motion-ready');
  if (ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  function setMotion(active, intro = false) {
    context?.revert();
    context = null;
    enabled = active;
    toggle.setAttribute('aria-pressed', String(active));
    tooltip.textContent = active ? 'Pausar movimento' : 'Ativar movimento';
    document.body.classList.toggle('motion-paused', !active);
    if (!active) return;

    context = gsap.context(() => {
      if (intro) {
        gsap.timeline({ defaults: { ease: 'power3.out', clearProps: 'transform,opacity' } })
          .from(photoFrame, { opacity: 0, x: -24, duration: 0.9 })
          .from('.content-col', { opacity: 0, x: 24, duration: 0.8 }, '-=0.65')
          .from('.greeting span', { opacity: 0, y: 20, stagger: 0.08, duration: 0.55 }, '-=0.5')
          .from('.quote-line', { opacity: 0, y: 10, duration: 0.5 }, '-=0.3')
          .from('.links', { opacity: 0, y: 10, duration: 0.5 }, '-=0.3');
      }

      const listeners = new AbortController();
      const listen = (target, type, handler) => target.addEventListener(type, handler, { signal: listeners.signal });
      if (ScrollTrigger) {
        // Clamp to the short cover's real scroll range; overscan prevents empty edges.
        gsap.fromTo(image, { yPercent: -2, scale: 1.08 }, {
          yPercent: 2, scale: 1.08, ease: 'none',
          scrollTrigger: {
            trigger: '.hero', start: 'top top', end: 'clamp(bottom top)',
            scrub: 0.6, invalidateOnRefresh: true,
          },
        });
        gsap.to('.ambient-visual img', {
          x: -16, y: -28, ease: 'none',
          scrollTrigger: { start: 0, end: 'max', scrub: 0.8 },
        });
        gsap.to('.scroll-progress span', {
          scaleX: 1, ease: 'none',
          scrollTrigger: { start: 0, end: 'max', scrub: 0.2 },
        });
        listen(image, 'load', () => ScrollTrigger.refresh());
        ScrollTrigger.refresh();
      }

      const rotateX = gsap.quickTo(photo, 'rotationX', { duration: 0.5, ease: 'power3.out' });
      const rotateY = gsap.quickTo(photo, 'rotationY', { duration: 0.5, ease: 'power3.out' });
      const lift = gsap.quickTo(photo, 'y', { duration: 0.5, ease: 'power3.out' });
      const reset = () => { rotateX(0); rotateY(0); lift(0); };
      listen(photoFrame, 'pointermove', event => {
        // Use the actual input, so a mouse also works on touch-capable computers.
        if (event.pointerType !== 'mouse') return;
        if (control.contains(event.target)) return reset();
        const rect = photoFrame.getBoundingClientRect();
        const x = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5));
        const y = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5));
        rotateX(-y * 9);
        rotateY(x * 9);
        lift(-5);
      });
      listen(photoFrame, 'pointerleave', reset);
      listen(photoFrame, 'pointercancel', reset);
      listen(window, 'blur', reset);

      document.querySelectorAll('.links a').forEach(link => {
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

  toggle.addEventListener('click', () => {
    preference = enabled ? 'off' : 'on';
    try { localStorage.setItem(storageKey, preference); } catch { /* Session-only choice. */ }
    setMotion(preference === 'on');
  });
  reducedMotion.addEventListener('change', () => {
    if (preference === null) setMotion(!reducedMotion.matches);
  });

  setMotion(preference === 'on' || (preference === null && !reducedMotion.matches), true);
  control.hidden = false;
})();
