// nav.js —— 左侧导航：收起/展开、滚动高亮、实验室入口探测、简介浮层随演示区出现。

const RAIL_KEY = 'll-rail';

function initRailCollapse() {
  const rail = document.getElementById('rail');
  const btn = document.getElementById('railToggle');
  if (!rail || !btn) return;

  // 收起后文字被隐藏，给每个入口留一份可访问名称与悬停提示
  const links = [...rail.querySelectorAll('.rail-link')].map((link) => ({
    link,
    label: (link.querySelector('.rail-label')?.textContent || '').trim(),
  }));
  for (const { link, label } of links) {
    if (label) link.setAttribute('aria-label', label);
  }

  let collapsed = false;
  try { collapsed = localStorage.getItem(RAIL_KEY) === '1'; } catch (_) { /* 忽略 */ }

  const set = (v) => {
    collapsed = v;
    rail.classList.toggle('collapsed', v);
    document.body.classList.toggle('rail-collapsed', v);
    btn.setAttribute('aria-expanded', String(!v));
    btn.setAttribute('aria-label', v ? '展开导航' : '收起导航');
    for (const { link, label } of links) {
      if (v && label) link.title = label;
      else link.removeAttribute('title');
    }
    try { localStorage.setItem(RAIL_KEY, v ? '1' : '0'); } catch (_) { /* 忽略 */ }
  };

  set(collapsed);
  btn.addEventListener('click', () => set(!collapsed));
}

function initSpy() {
  const groups = [...document.querySelectorAll('.rail-link[data-spy]')]
    .map((link) => ({
      link,
      els: link.dataset.spy.split(',').map((id) => document.getElementById(id)).filter(Boolean),
    }))
    .filter((g) => g.els.length);
  if (!groups.length) return;

  let ticking = false;
  const update = () => {
    ticking = false;
    // 视口上方 1/3 处作为“当前板块”的分界线
    const line = window.innerHeight * 0.34;
    let current = groups[0];
    for (const g of groups) {
      const top = Math.min(...g.els.map((el) => el.getBoundingClientRect().top));
      if (top <= line) current = g;
    }
    for (const g of groups) {
      const on = g === current;
      g.link.classList.toggle('active', on);
      if (on) g.link.setAttribute('aria-current', 'true');
      else g.link.removeAttribute('aria-current');
    }
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
}

// 「函数实验室」由另一处工程提供：不存在时降级为不可点击 + 「建设中」，绝不 404
async function initLabGate() {
  const links = [...document.querySelectorAll('[data-lab-link]')];
  if (!links.length) return;

  let available = false;
  try {
    const res = await fetch('./lab.html', { method: 'HEAD', cache: 'no-store' });
    available = res.ok;
  } catch (_) {
    available = false;
  }

  for (const el of links) {
    if (available) {
      el.setAttribute('href', './lab.html');
      el.classList.remove('is-disabled');
      el.removeAttribute('aria-disabled');
      el.removeAttribute('title');
    } else {
      el.removeAttribute('href');
      el.classList.add('is-disabled');
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('title', '实验室建设中');
      el.addEventListener('click', (e) => e.preventDefault());
    }
  }

  const badge = document.querySelector('#railLab .rail-badge');
  if (badge) badge.hidden = available;
  const status = document.getElementById('labStatus');
  if (status) status.hidden = available;
}

// 简介浮层：第一次滚到演示区时再出现，避免一进页面就挡住叙事首页
function initIntroOnView() {
  const intro = document.getElementById('intro');
  const demo = document.getElementById('app');
  if (!intro || !demo || !('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    if (!intro.classList.contains('hide')) return; // 已经在展示就不打断
    intro.classList.remove('hide');
    setTimeout(() => intro.classList.add('hide'), 6000);
  }, { threshold: 0.25 });
  io.observe(demo);
}

export function initNav() {
  initRailCollapse();
  initSpy();
  initLabGate();
  initIntroOnView();
}
