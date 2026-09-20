(() => {
  const { gsap, ScrollTrigger } = window;
  if (!gsap) return;

  const photo = document.querySelector('.photo');
  const photoFrame = document.querySelector('.photo-col');
  const image = photo?.querySelector('img');
  if (!photo || !photoFrame || !image) return;

  document.body.classList.add('motion-ready');
  if (ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  const media = gsap.matchMedia();

  media.add('(prefers-reduced-motion: no-preference)', () => {
    gsap.timeline({ defaults: { ease: 'power3.out', clearProps: 'transform,opacity' } })
      .from(photoFrame, { opacity: 0, x: -24, duration: 0.9 })
      .from('.content-col', { opacity: 0, x: 24, duration: 0.8 }, '-=0.65')
      .from('.greeting span', { opacity: 0, y: 20, stagger: 0.08, duration: 0.55 }, '-=0.5')
      .from('.quote-line', { opacity: 0, y: 10, duration: 0.5 }, '-=0.3')
      .from('.links', { opacity: 0, y: 10, duration: 0.5 }, '-=0.3');

    if (!ScrollTrigger) return;

    // The cover is almost one viewport tall. Clamp to the actual scroll range.
    // Overscan keeps the image inside its frame at both ends of the parallax.
    gsap.fromTo(image, { yPercent: -2, scale: 1.08 }, {
      yPercent: 2,
      scale: 1.08,
      ease: 'none',
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

    const refresh = () => ScrollTrigger.refresh();
    image.addEventListener('load', refresh, { once: true });
    refresh();
    return () => image.removeEventListener('load', refresh);
  });

  media.add('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
    const rotateX = gsap.quickTo(photo, 'rotationX', { duration: 0.5, ease: 'power3.out' });
    const rotateY = gsap.quickTo(photo, 'rotationY', { duration: 0.5, ease: 'power3.out' });
    const lift = gsap.quickTo(photo, 'y', { duration: 0.5, ease: 'power3.out' });
    const move = event => {
      // Measure the stationary parent so tilt does not move its own pointer target.
      const rect = photoFrame.getBoundingClientRect();
      const x = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5));
      const y = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5));
      rotateX(-y * 9);
      rotateY(x * 9);
      lift(-5);
    };
    const reset = () => { rotateX(0); rotateY(0); lift(0); };
    photoFrame.addEventListener('pointermove', move);
    photoFrame.addEventListener('pointerleave', reset);
    photoFrame.addEventListener('pointercancel', reset);
    window.addEventListener('blur', reset);
    const links = Array.from(document.querySelectorAll('.links a'), link => {
      const x = gsap.quickTo(link, 'x', { duration: 0.3, ease: 'power3.out' });
      const y = gsap.quickTo(link, 'y', { duration: 0.3, ease: 'power3.out' });
      const moveLink = event => {
        const rect = link.getBoundingClientRect();
        x((event.clientX - rect.left - rect.width / 2) * 0.14);
        y((event.clientY - rect.top - rect.height / 2) * 0.14);
      };
      const resetLink = () => { x(0); y(0); };
      link.addEventListener('pointermove', moveLink);
      link.addEventListener('pointerleave', resetLink);
      link.addEventListener('blur', resetLink);
      return () => {
        link.removeEventListener('pointermove', moveLink);
        link.removeEventListener('pointerleave', resetLink);
        link.removeEventListener('blur', resetLink);
      };
    });
    return () => {
      links.forEach(cleanup => cleanup());
      photoFrame.removeEventListener('pointermove', move);
      photoFrame.removeEventListener('pointerleave', reset);
      photoFrame.removeEventListener('pointercancel', reset);
      window.removeEventListener('blur', reset);
    };
  });
})();
