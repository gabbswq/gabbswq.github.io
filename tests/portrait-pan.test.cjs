const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit, firefox } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const artifacts = process.env.PORTFOLIO_ARTIFACT_DIR || path.join(root, 'test-results');
const engine = process.env.PLAYWRIGHT_BROWSER || 'chromium';
let browser, server, url;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

before(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const type = mime[path.extname(file)];
    if (!file.startsWith(root + path.sep) || !type) { response.writeHead(404).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': type });
      response.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = process.env.PORTFOLIO_TEST_URL || `http://127.0.0.1:${server.address().port}/`;
  browser = await ({ chromium, webkit, firefox })[engine].launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  });
  fs.mkdirSync(artifacts, { recursive: true });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function open(t, options = {}, setup) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', ...options });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, [], 'no JavaScript errors'); });
  if (setup) await setup(page);
  await page.goto(url, { waitUntil: 'load' });
  await page.locator('.photo[data-pan-ready]').waitFor();
  await waitForGeometry(page);
  return page;
}

async function waitForGeometry(page) {
  // ResizeObserver delivery is asynchronous, especially after WebKit viewport changes.
  await page.waitForFunction(() => {
    const frame = document.querySelector('.photo');
    const image = frame.querySelector('img');
    const rect = frame.getBoundingClientRect();
    const photo = image.getBoundingClientRect();
    const style = getComputedStyle(frame);
    const width = rect.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
    const height = rect.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth);
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    return Math.abs(photo.width - image.naturalWidth * scale) < 0.05 &&
      Math.abs(photo.height - image.naturalHeight * scale) < 0.05;
  }, null, { timeout: 10000 }).catch(async error => {
    throw new Error(`Geometry did not settle: ${JSON.stringify(await state(page))}`, { cause: error });
  });
}

async function state(page) {
  return page.evaluate(() => {
    const frame = document.querySelector('.photo');
    const image = frame.querySelector('img');
    const rect = frame.getBoundingClientRect();
    const photo = image.getBoundingClientRect();
    const style = getComputedStyle(frame);
    const left = rect.left + parseFloat(style.borderLeftWidth);
    const top = rect.top + parseFloat(style.borderTopWidth);
    const width = rect.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
    const height = rect.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth);
    const transform = new DOMMatrix(getComputedStyle(image).transform);
    return {
      x: -transform.m41, y: -transform.m42,
      maxX: Math.max(0, photo.width - width), maxY: Math.max(0, photo.height - height),
      natural: [image.naturalWidth, image.naturalHeight], rendered: [photo.width, photo.height],
      frame: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      axis: frame.dataset.panAxis, dragging: frame.hasAttribute('data-dragging'),
      touch: style.touchAction, scroll: scrollY, scale: transform.a,
      covered: photo.left <= left + 0.1 && photo.top <= top + 0.1 && photo.right >= left + width - 0.1 && photo.bottom >= top + height - 0.1,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

async function wheel(page, deltaX, deltaY, rest = {}) {
  return page.locator('.photo').evaluate((frame, init) => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
    frame.dispatchEvent(event);
    return event.defaultPrevented;
  }, { deltaX, deltaY, ...rest });
}

function near(actual, expected, message, tolerance = 0.15) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} != ${expected}`);
}

test('photo contains only the image and hover alone changes neither its position nor its styling', async t => {
  const page = await open(t, { reducedMotion: 'no-preference' });
  const frame = page.locator('.photo');
  assert.equal(await frame.locator(':scope > *').count(), 1);
  assert.equal((await frame.textContent()).trim(), '');
  const appearance = () => frame.evaluate(el => {
    const style = getComputedStyle(el);
    return {
      border: style.border,
      radius: style.borderRadius,
      shadow: style.boxShadow,
      background: style.backgroundImage,
      before: getComputedStyle(el, '::before').content,
      after: getComputedStyle(el, '::after').content,
      filter: getComputedStyle(el.querySelector('img')).filter,
    };
  });
  const original = await appearance();
  assert.equal(original.shadow, 'none');
  assert.equal(original.background, 'none');
  assert.equal(original.before, 'none');
  assert.equal(original.after, 'none');
  const before = await state(page);
  await page.mouse.move(before.frame.x + 20, before.frame.y + 20);
  await page.mouse.move(before.frame.x + before.frame.width - 20, before.frame.y + before.frame.height - 20, { steps: 6 });
  await page.waitForTimeout(700);
  const hovered = await state(page);
  near(hovered.x, before.x, 'hover alone does not pan');
  near(hovered.y, before.y, 'hover alone does not pan vertically');
  assert.deepEqual(hovered.frame, before.frame, 'hover never moves the frame');
  assert.deepEqual(await appearance(), original, 'no hover glow, gradient, or filter change');
  assert.equal(await frame.evaluate(el => el === document.activeElement), false);
  assert.equal(await frame.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
});

test('original landscape asset is unchanged, fully rendered, and initially composed around the face', async t => {
  const bytes = fs.readFileSync(path.join(root, 'hero.png'));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), '64f15a6664fb75824ef0766ba99c8be1058ecfe21f77581d92783902050cedb0');
  const page = await open(t);
  const s = await state(page);
  assert.deepEqual(s.natural, [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]);
  assert.ok(s.natural[0] > s.natural[1]);
  assert.equal(s.axis, 'x');
  near(s.x / s.maxX, 0.58, 'initial composition', 0.001);
  near(s.rendered[0] / s.rendered[1], s.natural[0] / s.natural[1], 'no distortion', 0.001);
  assert.ok(s.covered);
  assert.equal(s.scale, 1, 'no extra transform scale');
  assert.equal(await page.locator('.photo img').getAttribute('alt'), 'Gabriel Diniz trabalhando no notebook');
});

for (const reducedMotion of ['reduce', 'no-preference']) {
  test(`mouse drag follows the pointer, capture survives leaving the frame, and position persists (${reducedMotion})`, async t => {
    const page = await open(t, { reducedMotion });
    const before = await state(page);
    const x = before.frame.x + before.frame.width * 0.5;
    const y = before.frame.y + before.frame.height * 0.5;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 60, y + 30, { steps: 5 });
    let s = await state(page);
    near(s.x, before.x + 60, 'direct horizontal dragging');
    near(s.y, 0, 'no manufactured vertical overflow');
    assert.deepEqual(s.frame, before.frame, 'frame stays stationary');
    assert.ok(s.dragging && s.covered);
    await page.mouse.move(before.frame.x - 20, y);
    await page.mouse.up();
    s = await state(page);
    assert.equal(s.dragging, false);
    const held = s.x;
    await page.mouse.move(1, 1);
    await page.waitForTimeout(700);
    near((await state(page)).x, held, 'no return on leave and no GSAP overwriting');
  });
}

test('wheel works on first hover without click or focus, reaches both edges, and releases page scroll', async t => {
  const page = await open(t);
  await page.evaluate(() => {
    window.photoActivationEvents = 0;
    for (const type of ['pointerdown', 'click', 'focus']) {
      document.querySelector('.photo').addEventListener(type, () => window.photoActivationEvents++);
    }
  });
  let s = await state(page);
  await page.mouse.move(s.frame.x + s.frame.width / 2, s.frame.y + s.frame.height / 2);
  const initial = s.x;
  await page.mouse.wheel(0, 40);
  await page.waitForFunction(previous => -new DOMMatrix(getComputedStyle(document.querySelector('.photo img')).transform).m41 > previous, initial);
  s = await state(page);
  near(s.x, initial + 40, 'vertical wheel maps to overflow');
  assert.equal(s.scroll, 0);
  assert.equal(await page.evaluate(() => window.photoActivationEvents), 0, 'wheel never needs or triggers activation');
  assert.equal(await page.locator('.photo').evaluate(el => el === document.activeElement), false);
  assert.equal(await wheel(page, 0, -100000), true);
  s = await state(page);
  near(s.x, 0, 'left edge reachable');
  assert.ok(s.covered);
  assert.equal(await wheel(page, 0, -100), false, 'outward wheel not consumed');
  assert.equal(await wheel(page, 0, 100000), true);
  s = await state(page);
  near(s.x, s.maxX, 'right edge reachable');
  assert.ok(s.covered);
  assert.equal(await wheel(page, 0, 100), false);
  await page.mouse.wheel(0, 180);
  await page.waitForFunction(() => scrollY > 0);
  assert.ok((await state(page)).covered);
});

test('wheel outside the photo scrolls the page without moving the image', async t => {
  const page = await open(t, { viewport: { width: 1440, height: 650 } });
  const before = await state(page);
  await page.mouse.move(1400, 300);
  await page.mouse.wheel(0, 100);
  await page.waitForFunction(() => scrollY > 0);
  const after = await state(page);
  near(after.x, before.x, 'outside wheel does not pan');
  near(after.y, before.y, 'outside wheel does not pan');
});

test('trackpad deltas, Shift, line/page modes, browser zoom and noncancelable events', async t => {
  const page = await open(t);
  const reset = () => page.locator('.photo').dispatchEvent('keydown', { key: 'Home' });
  for (const [dx, dy, options, distance] of [[12, 0, {}, 12], [-12, 0, {}, -12], [20, 5, {}, 20], [-20, -5, {}, -20], [0, 10, { shiftKey: true }, 10]]) {
    await reset();
    const before = await state(page);
    assert.equal(await wheel(page, dx, dy, options), true);
    near((await state(page)).x, before.x + distance, 'mapped delta');
  }
  await reset();
  const before = await state(page);
  await wheel(page, 0, 1, { deltaMode: 1 });
  assert.ok((await state(page)).x - before.x > 10, 'line units normalized');
  await wheel(page, 0, 1, { deltaMode: 2 });
  near((await state(page)).x, before.maxX, 'page units reach boundary');
  await reset();
  const composed = (await state(page)).x;
  for (const options of [{ ctrlKey: true }, { metaKey: true }, { cancelable: false }]) {
    assert.equal(await wheel(page, 0, 40, options), false);
    near((await state(page)).x, composed, 'browser gestures left alone');
  }
});

test('keyboard navigation and Home remain accessible without any visible controls', async t => {
  const page = await open(t);
  const frame = page.locator('.photo');
  await page.keyboard.press('Tab');
  assert.equal(await frame.evaluate(el => el === document.activeElement), true);
  assert.notEqual(await frame.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
  assert.equal(await frame.getAttribute('aria-describedby'), 'portrait-help');
  const initial = (await state(page)).x;
  await page.keyboard.press('ArrowLeft');
  near((await state(page)).x, initial - 24, 'left arrow');
  await page.keyboard.press('Shift+ArrowRight');
  near((await state(page)).x, Math.min(initial + 56, (await state(page)).maxX), 'large step');
  await page.keyboard.press('Home');
  near((await state(page)).x, initial, 'Home resets');
  await page.keyboard.press('ArrowRight');
  const held = (await state(page)).x;
  await page.keyboard.press('Tab');
  // WebKit may skip native links depending on its full keyboard access setting.
  assert.equal(await frame.evaluate(el => el === document.activeElement), false, 'Tab leaves the photo without a focus trap');
  if (engine !== 'webkit') {
    assert.equal(await page.locator('.links a').first().evaluate(el => el === document.activeElement), true);
  }
  near((await state(page)).x, held, 'leaving keyboard focus does not reset the photo');
  assert.equal(await frame.locator('button, [role="button"]').count(), 0);
});

test('blur, pointer cancellation, lost capture and resize terminate dragging without resetting the explored position', async t => {
  const page = await open(t);
  for (const reason of ['blur', 'pointercancel', 'lostpointercapture', 'resize']) {
    const s = await state(page);
    const x = s.frame.x + s.frame.width / 2, y = s.frame.y + s.frame.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 10, y);
    const explored = await state(page);
    if (reason === 'resize') await page.setViewportSize({ width: 1300, height: 900 });
    else await page.evaluate(reason => {
      if (reason === 'blur') window.dispatchEvent(new Event('blur'));
      else document.querySelector('.photo').dispatchEvent(new PointerEvent(reason, { pointerId: 1, bubbles: true }));
    }, reason);
    await page.waitForFunction(() => !document.querySelector('.photo').hasAttribute('data-dragging'));
    await waitForGeometry(page);
    const stopped = await state(page);
    near(stopped.x / stopped.maxX, explored.x / explored.maxX, 'fraction preserved', 0.001);
    await page.mouse.up();
  }
});

test('responsive resizing, orientation and real vertical/no-overflow geometry', async t => {
  const page = await open(t);
  await wheel(page, 0, -25);
  const fraction = (await state(page)).x / (await state(page)).maxX;
  for (const [width, height] of [[390, 844], [844, 390], [320, 740], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await waitForGeometry(page);
    const s = await state(page);
    near(s.x / s.maxX, fraction, `explored position survives resize to ${width}x${height}: ${JSON.stringify(s)}`, 0.001);
    assert.ok(s.covered && !s.overflow);
  }
  await page.locator('.photo').evaluate(el => { el.style.aspectRatio = '2.5'; });
  await page.waitForFunction(() => document.querySelector('.photo').dataset.panAxis === 'y');
  assert.equal(await wheel(page, 0, 100000), true);
  let s = await state(page);
  near(s.y, s.maxY, 'bottom of full image reachable');
  assert.ok(s.covered);
  await wheel(page, 0, -100000);
  near((await state(page)).y, 0, 'top reachable');
  await page.locator('.photo').evaluate(el => { el.style.width = '514px'; el.style.height = `${512 * document.querySelector('.photo img').naturalHeight / document.querySelector('.photo img').naturalWidth + 2}px`; });
  await page.waitForFunction(() => document.querySelector('.photo').dataset.panAxis === 'none');
  assert.equal(await wheel(page, 0, 30), false);
  assert.equal(await page.locator('.photo').getAttribute('tabindex'), null);
  assert.equal((await state(page)).touch, 'auto');
});

test('mobile touch drag is immediate, navigation outside remains native, and pinch cancels image capture', { skip: engine !== 'chromium' }, async t => {
  const page = await open(t, { viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const s = await state(page);
  const x = s.frame.x + s.frame.width / 2, y = s.frame.y + s.frame.height / 2;
  assert.equal(await page.locator('.photo').evaluate(el => el === document.activeElement), false);
  await touch('touchStart', [{ x, y, id: 1 }]);
  assert.equal((await state(page)).dragging, true, 'the first touch starts dragging without tap or long press');
  await touch('touchMove', [{ x: x - 45, y: y + 12, id: 1 }]);
  near((await state(page)).x, s.x + 45, 'one-finger diagonal movement follows immediately');
  assert.equal((await state(page)).scroll, 0);
  await touch('touchEnd', []);
  assert.equal((await state(page)).dragging, false);
  near((await state(page)).x, s.x + 45, 'touch release keeps the explored position');
  await touch('touchStart', [{ x, y, id: 1 }]);
  await touch('touchCancel', []);
  assert.equal((await state(page)).dragging, false);
  await touch('touchStart', [{ x, y, id: 1 }]);
  await touch('touchStart', [{ x, y, id: 1 }, { x: x + 50, y, id: 2 }]);
  assert.equal((await state(page)).dragging, false, 'second finger released from photo');
  assert.equal((await state(page)).touch, 'pinch-zoom');
  for (let step = 1; step <= 8; step++) {
    await touch('touchMove', [{ x: x - step * 5, y, id: 1 }, { x: x + 50 + step * 5, y, id: 2 }]);
    await page.waitForTimeout(20);
  }
  await touch('touchEnd', []);
  assert.ok(await page.evaluate(() => visualViewport.scale > 1), 'browser pinch zoom remains functional in Chromium emulation');
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), 'page has room to scroll');
  const outsideY = Math.min(s.frame.y + s.frame.height + 55, 800);
  await touch('touchStart', [{ x: 200, y: outsideY, id: 1 }]);
  for (let step = 1; step <= 6; step++) {
    await touch('touchMove', [{ x: 200, y: outsideY - step * 25, id: 1 }]);
  }
  await touch('touchEnd', []);
  await page.waitForFunction(() => scrollY > 0);
  await page.setViewportSize({ width: 844, height: 390 });
  await waitForGeometry(page);
  const landscape = await state(page);
  assert.ok(landscape.frame.width > 200 && landscape.frame.width < 390, 'landscape keeps a usable photo and wide areas outside the drag surface');
  assert.ok(landscape.covered && !landscape.dragging);
  await page.screenshot({ path: path.join(artifacts, `portrait-landscape-touch-${engine}.png`) });
});

test('late loading, reduced-motion changes, unrelated animations, links and no-GSAP fallback', async t => {
  const page = await open(t, { reducedMotion: 'no-preference' }, async page => {
    await page.route('**/hero.png?*', async route => { await new Promise(resolve => setTimeout(resolve, 180)); await route.continue(); });
  });
  await wheel(page, 0, 30);
  const before = (await state(page)).x;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  near((await state(page)).x, before, 'GSAP context revert cannot reset portrait');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => ScrollTrigger.getAll().some(trigger => trigger.animation?.targets().includes(document.querySelector('.ambient-visual img'))));
  assert.ok(await page.locator('.links a[href]').count() >= 3);
  const noGSAP = await open(t, {}, async page => { await page.route('**/vendor/*.js', route => route.abort()); });
  assert.equal(await noGSAP.evaluate(() => typeof window.gsap), 'undefined');
  assert.equal(await wheel(noGSAP, 0, 20), true, 'panning has no GSAP dependency');
});

test('desktop/mobile captures and unchanged fallback without JavaScript', async t => {
  const desktop = await open(t);
  await desktop.locator('.photo').hover();
  await desktop.screenshot({ path: path.join(artifacts, `portrait-desktop-${engine}.png`), fullPage: true });
  await wheel(desktop, 0, -100000);
  await desktop.locator('.photo').screenshot({ path: path.join(artifacts, `portrait-left-edge-${engine}.png`) });
  await wheel(desktop, 0, 100000);
  await desktop.locator('.photo').screenshot({ path: path.join(artifacts, `portrait-right-edge-${engine}.png`) });
  const mobile = await open(t, { viewport: { width: 390, height: 844 }, hasTouch: true });
  await mobile.screenshot({ path: path.join(artifacts, `portrait-mobile-${engine}.png`), fullPage: true });
  await mobile.setViewportSize({ width: 844, height: 390 });
  await waitForGeometry(mobile);
  const landscape = await state(mobile);
  assert.ok(landscape.frame.width > 200 && landscape.frame.width < 390);
  assert.ok(landscape.covered && !landscape.overflow);
  await mobile.screenshot({ path: path.join(artifacts, `portrait-landscape-${engine}.png`) });
  const fallback = await browser.newPage({ javaScriptEnabled: false });
  t.after(() => fallback.close());
  await fallback.goto(url);
  assert.equal(await fallback.locator('.photo img').isVisible(), true);
  assert.equal(await fallback.locator('.photo > :not(img)').count(), 0);
});
