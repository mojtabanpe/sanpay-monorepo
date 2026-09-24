/* Runs before Angular: the splash must also work while application chunks load. */
(() => {
  const splash = document.getElementById('sanpay-splash');
  if (!splash) return;
  splash.dataset.startedAt = String(performance.now());
  splash.dataset.managed = 'true';
  const video = splash.querySelector('video');
  const message = document.getElementById('splash-message');
  const retry = document.getElementById('splash-retry');
  const root = document.querySelector('app-root');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let ready = false;
  let finished = false;
  let closing = false;
  let animationDeadline;
  let hasFrame = false;

  function dismiss() {
    if (!ready || !finished || closing) return;
    closing = true;
    clearTimeout(animationDeadline);
    clearTimeout(loadDeadline);
    document.removeEventListener('sanpay:ready', onReady);
    document.removeEventListener('sanpay:failed', onFailure);
    motion.removeEventListener('change', onMotionChange);
    video.pause();
    // Restore the app's background and layout while the opaque splash covers it.
    // Changing these after the fade caused a second visible jump at removal.
    document.body.classList.remove('splash-active');
    const removeSplash = () => {
      splash.remove();
      root?.removeAttribute('inert');
    };
    if (motion.matches) {
      removeSplash();
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const deadline = setTimeout(removeSplash, 550);
      splash.addEventListener('transitionend', (event) => {
        if (event.target !== splash || event.propertyName !== 'opacity') return;
        clearTimeout(deadline);
        removeSplash();
      });
      splash.classList.add('splash-leaving');
    }));
  }
  function finishAnimation() {
    clearTimeout(animationDeadline);
    finished = true;
    dismiss();
  }
  function showPoster() {
    video.pause();
    if (!hasFrame) splash.dataset.static = 'true';
    finishAnimation();
  }
  function onMotionChange() {
    if (motion.matches) showPoster();
  }
  function onReady() {
    ready = true;
    dismiss();
  }
  function onFailure() {
    clearTimeout(loadDeadline);
    showPoster();
    message.textContent = 'بارگذاری اپ انجام نشد. دوباره تلاش کنید.';
    message.hidden = false;
    retry.hidden = false;
    splash.classList.add('splash-failed');
  }
  const loadDeadline = setTimeout(() => {
    if (!ready) {
      message.textContent = 'بارگذاری بیشتر از معمول طول کشیده است.';
      message.hidden = false;
      retry.hidden = false;
    }
  }, 15000);
  document.addEventListener('sanpay:ready', onReady);
  document.addEventListener('sanpay:failed', onFailure);
  motion.addEventListener('change', onMotionChange);
  video.addEventListener('ended', finishAnimation, { once: true });
  video.addEventListener('error', showPoster, { once: true });

  function revealFrame() {
    if (finished || closing) return;
    hasFrame = true;
    splash.dataset.animated = 'true';
    clearTimeout(animationDeadline);
    // A stalled stream keeps its current frame instead of jumping to a poster.
    animationDeadline = setTimeout(showPoster, 5000);
  }
  if (splash.hasAttribute('data-static') || motion.matches || navigator.connection?.saveData) {
    showPoster();
  } else {
    video.src = 'brand/splash/intro.mp4';
    animationDeadline = setTimeout(showPoster, 5000);
    if ('requestVideoFrameCallback' in video) {
      video.requestVideoFrameCallback(revealFrame);
    } else {
      video.addEventListener('playing', revealFrame, { once: true });
    }
    video.play().catch(showPoster);
  }
  if (document.documentElement.dataset.sanpayBoot === 'ready') onReady();
  if (document.documentElement.dataset.sanpayBoot === 'failed') onFailure();
})();
