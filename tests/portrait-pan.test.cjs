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
  await page.locator('.photo').evaluate(el => el.addEventListener('pointermove', event => {
    window.lastPhotoPointer = { x: event.clientX, y: event.clientY, type: event.pointerType, buttons: event.buttons };
  }));
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
      inner: { x: left, y: top, width, height },
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

async function waitForOffset(page, x, y) {
  await page.waitForFunction(({ x, y }) => {
    const matrix = new DOMMatrix(getComputedStyle(document.querySelector('.photo img')).transform);
    return Math.abs(-matrix.m41 - x) < 0.05 && Math.abs(-matrix.m42 - y) < 0.05;
  }, { x, y }, { timeout: 5000 }).catch(async error => {
    throw new Error(`Pan did not reach ${x}, ${y}: ${JSON.stringify(await state(page))}; pointer: ${JSON.stringify(await page.evaluate(() => window.lastPhotoPointer))}`, { cause: error });
  });
}

async function hoverAt(page, u, v = 0.5) {
  const s = await state(page);
  const coordinate = (start, size, fraction) => fraction === 0 ? Math.floor(start) : fraction === 1 ? Math.ceil(start + size) : Math.round(start + size * fraction);
  await page.mouse.move(coordinate(s.inner.x, s.inner.width, u), coordinate(s.inner.y, s.inner.height, v));
  const pointer = await page.evaluate(() => window.lastPhotoPointer);
  const expectedX = Math.max(0, Math.min(1, (pointer.x - s.inner.x) / s.inner.width)) * s.maxX;
  const expectedY = Math.max(0, Math.min(1, (pointer.y - s.inner.y) / s.inner.height)) * s.maxY;
  await waitForOffset(page, expectedX, expectedY);
  return { ...await state(page), expectedX, expectedY };
}

test('photo contains only the image and hover preserves its clean styling and stationary frame', async t => {
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
  const hovered = await hoverAt(page, 0.8);
  assert.notEqual(hovered.x, before.x, 'hover visibly pans the image');
  assert.deepEqual(hovered.frame, before.frame, 'hover never moves the frame');
  assert.deepEqual(await appearance(), original, 'no hover glow, gradient, or filter change');
  assert.equal(await frame.evaluate(el => el === document.activeElement), false);
  assert.equal(await frame.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
  assert.equal(await frame.evaluate(el => getComputedStyle(el).cursor), 'auto');
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
  test(`fresh-page hover with zero pressed buttons reaches both photo edges and persists on leave (${reducedMotion})`, async t => {
    const page = await open(t, { reducedMotion });
    await page.evaluate(() => {
      window.photoInputs = { activation: 0, moves: [] };
      const frame = document.querySelector('.photo');
      for (const type of ['pointerdown', 'click', 'wheel', 'focus']) {
        frame.addEventListener(type, () => window.photoInputs.activation++);
      }
      frame.addEventListener('pointermove', event => window.photoInputs.moves.push({ type: event.pointerType, buttons: event.buttons }));
    });
    const before = await state(page);
    const left = await hoverAt(page, 0);
    near(left.x, 0, 'leftmost source edge is reachable');
    assert.ok(left.covered && !left.dragging);
    const leftPixels = await page.locator('.photo').screenshot();
    for (const u of [0.25, 0.5, 0.75, 1]) {
      const s = await hoverAt(page, u);
      near(s.x, s.expectedX, 'actual pointer coordinates control the view');
      near(s.y, 0, 'no manufactured vertical overflow');
      assert.deepEqual(s.frame, before.frame, 'frame stays stationary');
      assert.ok(s.covered && !s.dragging);
    }
    const right = await state(page);
    near(right.x, right.maxX, 'rightmost source edge is reachable');
    assert.notDeepEqual(await page.locator('.photo').screenshot(), leftPixels, 'the visible photograph changes across the full range');
    const inputs = await page.evaluate(() => window.photoInputs);
    assert.equal(inputs.activation, 0, 'no click, wheel, focus or pointerdown preceded hover panning');
    assert.ok(inputs.moves.length >= 5 && inputs.moves.every(event => event.type === 'mouse' && event.buttons === 0));
    await page.mouse.move(1, 1);
    await page.waitForTimeout(300);
    near((await state(page)).x, right.x, 'no return on leave or competing GSAP transform');
  });
}

test('mouse hover works on touch-capable computers without mouse drag activation or an outline', async t => {
  const page = await open(t, { hasTouch: true });
  let s = await hoverAt(page, 0.2);
  near(s.x, s.expectedX, 'actual mouse input uses hover even with touch capability');
  await page.mouse.down();
  assert.equal((await state(page)).dragging, false, 'mouse contact does not enter drag mode');
  s = await hoverAt(page, 0.8);
  near(s.x, s.expectedX, 'mapping does not depend on held mouse buttons');
  await page.mouse.up();
  assert.equal(await page.locator('.photo').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
  assert.equal(await page.locator('.photo').evaluate(el => getComputedStyle(el).cursor), 'auto');
});

test('smoothing eases entry, freezes the current position on leave, and reduced motion responds immediately', async t => {
  const page = await open(t, { reducedMotion: 'no-preference' });
  const initial = await state(page);
  // Synchronous dispatch observes entry before the next animation frame runs.
  await page.locator('.photo').dispatchEvent('pointermove', {
    pointerType: 'mouse', buttons: 0, clientX: initial.inner.x + initial.inner.width, clientY: initial.inner.y + initial.inner.height / 2,
  });
  const entering = await state(page);
  assert.ok(entering.x < entering.maxX, 'entry is not an instant jump');
  await page.waitForFunction(start => -new DOMMatrix(getComputedStyle(document.querySelector('.photo img')).transform).m41 > start, initial.x);
  await page.locator('.photo').dispatchEvent('pointerleave', { pointerType: 'mouse' });
  const held = (await state(page)).x;
  await page.waitForTimeout(250);
  near((await state(page)).x, held, 'leaving stops easing without recentering');
  await page.evaluate(() => { window.testReducedMotion = matchMedia('(prefers-reduced-motion: reduce)'); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // WebKit updates existing queries asynchronously, after newly created ones.
  await page.waitForFunction(() => window.testReducedMotion.matches);
  const immediate = await page.locator('.photo').evaluate(el => {
    const rect = el.getBoundingClientRect();
    const border = parseFloat(getComputedStyle(el).borderLeftWidth);
    el.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', buttons: 0, clientX: rect.left + border, clientY: rect.top + rect.height / 2 }));
    return -new DOMMatrix(getComputedStyle(el.querySelector('img')).transform).m41;
  });
  near(immediate, 0, 'reduced-motion update is synchronous');
});

test('rebuilt layout keeps text, icons and footer inside their containers across breakpoints', async t => {
  const page = await open(t);
  await page.evaluate(() => document.fonts.ready);
  for (const [width, height] of [[320, 740], [390, 844], [521, 900], [768, 1024], [859, 900], [860, 900], [1024, 768], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await waitForGeometry(page);
    const layout = await page.evaluate(() => {
      const box = selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      };
      const content = box('.content-col');
      const photo = box('.photo');
      const contained = [...document.querySelectorAll('.greeting span, .quote-line, .links a')].every(el => {
        const rect = el.getBoundingClientRect();
        return rect.left >= content.left - 0.1 && rect.right <= content.right + 0.1;
      });
      const links = [...document.querySelectorAll('.links a')].map(el => ({
        width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height,
        label: el.getAttribute('aria-label'), svg: Boolean(el.querySelector('svg')),
      }));
      return { content, photo, contained, links, footer: box('.site-footer'), hero: box('.hero'), quote: box('.quote-line'), nav: box('.links'), gap: parseFloat(getComputedStyle(document.querySelector('.links')).gap) };
    });
    assert.ok(layout.contained, `no clipped text or icons at ${width}px`);
    assert.ok(layout.content.left >= 0 && layout.content.right <= width + 0.1);
    assert.ok(layout.photo.left >= 0 && layout.photo.right <= width + 0.1);
    assert.ok(width < 860 ? layout.content.top >= layout.photo.bottom : layout.content.left >= layout.photo.right, `photo and content do not overlap at ${width}px`);
    assert.ok(layout.nav.top >= layout.quote.bottom && layout.footer.top >= layout.hero.bottom - 0.1);
    assert.equal(layout.links.length, 4);
    assert.ok(layout.links.every(link => link.width === 48 && link.height === 48 && link.label && link.svg));
    assert.ok(layout.gap <= 16, 'social icons keep compact spacing');
  }
});

test('wheel over the photo always scrolls the page and never pans or consumes wheel events', async t => {
  const page = await open(t);
  const held = await hoverAt(page, 0.35);
  for (const options of [{}, { shiftKey: true }, { deltaMode: 1 }, { deltaMode: 2 }, { ctrlKey: true }, { metaKey: true }, { cancelable: false }]) {
    assert.equal(await wheel(page, 20, 40, options), false);
    near((await state(page)).x, held.x, 'wheel and trackpad do not move the photograph');
  }
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(() => scrollY > 0);
  near((await state(page)).x, held.x, 'native page scroll preserves the last horizontal view');
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

test('responsive resizing, orientation and real vertical/no-overflow geometry', async t => {
  const page = await open(t);
  await hoverAt(page, 0.3);
  await page.mouse.move(1, 1);
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
  let s = await hoverAt(page, 0.5, 1);
  near(s.y, s.maxY, 'bottom of full image reachable');
  assert.ok(s.covered);
  await hoverAt(page, 0.5, 0);
  near((await state(page)).y, 0, 'top reachable');
  await page.locator('.photo').evaluate(el => { el.style.width = '514px'; el.style.height = `${512 * document.querySelector('.photo img').naturalHeight / document.querySelector('.photo img').naturalWidth + 2}px`; });
  await page.waitForFunction(() => document.querySelector('.photo').dataset.panAxis === 'none');
  assert.equal(await wheel(page, 0, 30), false);
  assert.equal(await page.locator('.photo').getAttribute('tabindex'), null);
  assert.equal((await state(page)).touch, 'auto');
});

test('pointer mapping accounts for unequal frame borders without blank edges', async t => {
  const page = await open(t);
  await page.locator('.photo').evaluate(el => { el.style.borderWidth = '3px 7px 9px 13px'; });
  await waitForGeometry(page);
  for (const u of [0, 0.3, 1]) {
    const s = await hoverAt(page, u);
    near(s.x, s.expectedX, 'coordinates are relative to the inner image viewport');
    assert.ok(s.covered);
  }
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
  assert.equal(await page.locator('.photo').evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'touch does not show a keyboard outline');
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

test('a first finger swipe follows actual vertical overflow and stays bounded', { skip: engine !== 'chromium' }, async t => {
  const page = await open(t, { viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });
  await page.locator('.photo').evaluate(el => { el.style.aspectRatio = '2.5'; });
  await page.waitForFunction(() => document.querySelector('.photo').dataset.panAxis === 'y');
  const s = await state(page);
  const x = s.inner.x + s.inner.width / 2, y = s.inner.y + s.inner.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 20, id: 1 }] });
  near((await state(page)).y, Math.min(s.maxY, s.y + 20), 'vertical swipe follows the finger immediately');
  near((await state(page)).x, 0, 'no artificial horizontal overflow');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 40, id: 1 }] });
  await waitForOffset(page, 0, 0);
  near((await state(page)).y, 0, 'top boundary clamps without blank pixels');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok((await state(page)).covered);
});

test('late loading, reduced-motion changes, unrelated animations, links and no-GSAP fallback', async t => {
  const page = await open(t, { reducedMotion: 'no-preference' }, async page => {
    await page.route('**/hero.png?*', async route => { await new Promise(resolve => setTimeout(resolve, 180)); await route.continue(); });
  });
  await hoverAt(page, 0.7);
  await page.mouse.move(1, 1);
  const before = (await state(page)).x;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  near((await state(page)).x, before, 'GSAP context revert cannot reset portrait');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => ScrollTrigger.getAll().some(trigger => trigger.animation?.targets().includes(document.querySelector('.ambient-visual img'))));
  assert.ok(await page.locator('.links a[href]').count() >= 3);
  const noGSAP = await open(t, {}, async page => { await page.route('**/vendor/*.js', route => route.abort()); });
  assert.equal(await noGSAP.evaluate(() => typeof window.gsap), 'undefined');
  const independent = await hoverAt(noGSAP, 0.2);
  near(independent.x, independent.expectedX, 'hover panning has no GSAP dependency');
});

test('desktop/mobile captures and unchanged fallback without JavaScript', async t => {
  const desktop = await open(t);
  await desktop.locator('.photo').hover();
  await desktop.screenshot({ path: path.join(artifacts, `portrait-desktop-${engine}.png`), fullPage: true });
  await hoverAt(desktop, 0);
  await desktop.locator('.photo').screenshot({ path: path.join(artifacts, `portrait-left-edge-${engine}.png`) });
  await hoverAt(desktop, 1);
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
