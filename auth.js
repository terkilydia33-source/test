/* ============================================================
   Haute et Jolie — حسابات الزبائن عبر Supabase
   النسخة المعدّلة لتعمل مع index.html الديناميكي (30,000 منتج)
   ============================================================ */
(() => {
  'use strict';

  const SUPABASE_URL  = 'https://dajwcerogmplfeuykesp.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_oqq5actT6DuGROP7aswQ9g_MYOXCwtE';

  /* استخدم العميل المشترك من index.html إن وُجد، وإلا أنشئ واحداً */
  const sb = window.sb || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  if (!window.sb) window.sb = sb;

  /* ---------- أدوات ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => Math.round(n).toLocaleString('en-US') + ' د.ج';

  const normPhone = v => {
    const p = String(v ?? '').replace(/[\s\-.]/g, '').replace(/^(\+213|00213)/, '0');
    return /^0[567]\d{8}$/.test(p) ? p : null;
  };
  const phoneToEmail = p => `${p}@haute-et-jolie.dz`;

  function arabicError(err) {
    const m = (err && err.message) || '';
    if (/already registered|already been registered/i.test(m)) return 'هذا الرقم مسجّل مسبقاً، سجّل الدخول';
    if (/invalid login credentials/i.test(m)) return 'رقم الهاتف أو كلمة السر غير صحيحة';
    if (/at least \d+ characters/i.test(m)) return 'كلمة السر يجب أن تكون 6 أحرف على الأقل';
    if (/rate limit|too many/i.test(m)) return 'محاولات كثيرة، أعد المحاولة بعد قليل';
    if (/failed to fetch|network/i.test(m)) return 'تعذّر الاتصال، تحقق من الإنترنت';
    return m || 'حدث خطأ، حاول مجدداً';
  }
  const check = ({ data, error }) => { if (error) throw error; return data; };

  const STATUS = {
    pending: 'قيد المراجعة',
    confirmed: 'مؤكد',
    shipped: 'قيد التوصيل',
    delivered: 'تم التسليم',
    cancelled: 'ملغى',
  };

  /* ---------- الحالة ---------- */
  let user = null;
  const favIds = new Set();
  const toUser = u => u && ({
    id: u.id,
    first_name: u.user_metadata?.first_name || '',
    last_name: u.user_metadata?.last_name || '',
    phone: u.user_metadata?.phone || '',
  });

  /* ---------- واجهة: زر الحساب + النوافذ ---------- */
  const navActions = $('.nav-actions');
  if (navActions) {
    navActions.style.gap = '14px';
    navActions.insertAdjacentHTML('afterbegin',
      `<button class="cart-btn" id="userBtn" aria-label="حسابي"><i class="fa-regular fa-user"></i></button>`);
  }

  document.body.insertAdjacentHTML('beforeend', `
  <div class="modal-overlay" id="authOverlay">
    <div class="modal-box" style="text-align:right">
      <button class="modal-close" data-close aria-label="إغلاق"><i class="fa-solid fa-xmark"></i></button>
      <div class="modal-icon"><i class="fa-regular fa-user"></i></div>
      <h3 id="authTitle" style="text-align:center">تسجيل الدخول</h3>
      <p id="authMsg" style="text-align:center;margin-bottom:14px"></p>
      <div class="chips" style="justify-content:center;padding-bottom:10px">
        <button type="button" class="chip active" data-tab="login">دخول</button>
        <button type="button" class="chip" data-tab="register">حساب جديد</button>
      </div>
      <p id="authErr" style="color:#a33;font-size:13px;font-weight:700;margin:0 0 10px;min-height:18px"></p>

      <form id="loginForm">
        <div class="form-group"><label>رقم الهاتف</label><input name="phone" type="tel" dir="ltr" style="text-align:right" required placeholder="05XX XX XX XX"></div>
        <div class="form-group"><label>كلمة السر</label><input name="password" type="password" required autocomplete="current-password"></div>
        <button class="btn btn-dark" style="width:100%" type="submit">دخول</button>
      </form>

      <form id="registerForm" hidden>
        <div class="form-row-2">
          <div class="form-group"><label>الاسم</label><input name="first_name" required></div>
          <div class="form-group"><label>اللقب</label><input name="last_name" required></div>
        </div>
        <div class="form-group"><label>رقم الهاتف</label><input name="phone" type="tel" dir="ltr" style="text-align:right" required placeholder="05XX XX XX XX"></div>
        <div class="form-group"><label>البريد الإلكتروني (اختياري)</label><input name="email" type="email" dir="ltr" style="text-align:right"></div>
        <div class="form-group"><label>كلمة السر (6 أحرف على الأقل)</label><input name="password" type="password" minlength="6" required autocomplete="new-password"></div>
        <button class="btn btn-dark" style="width:100%" type="submit">إنشاء الحساب</button>
      </form>
    </div>
  </div>

  <div class="modal-overlay" id="accountOverlay">
    <div class="modal-box cart-modal-box" style="text-align:right;max-width:560px">
      <button class="modal-close" data-close aria-label="إغلاق"><i class="fa-solid fa-xmark"></i></button>
      <h3 id="accName" style="text-align:center;margin-bottom:14px"></h3>
      <div class="chips" style="justify-content:center;padding-bottom:6px">
        <button type="button" class="chip active" data-acc="favs"><i class="fa-regular fa-heart"></i> المفضلة</button>
        <button type="button" class="chip" data-acc="orders"><i class="fa-solid fa-bag-shopping"></i> طلباتي</button>
      </div>
      <div id="accContent" style="max-height:52vh;overflow-y:auto;margin-top:10px"></div>
      <button class="btn btn-outline" id="logoutBtn" style="width:100%;margin-top:16px">تسجيل الخروج</button>
    </div>
  </div>`);

  const authOverlay = $('#authOverlay');
  const accOverlay = $('#accountOverlay');
  const authErr = $('#authErr');

  [authOverlay, accOverlay].forEach(ov => {
    ov.addEventListener('click', e => {
      if (e.target === ov || e.target.closest('[data-close]')) ov.classList.remove('show');
    });
  });

  function setAuthTab(tab) {
    authOverlay.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('#loginForm').hidden = tab !== 'login';
    $('#registerForm').hidden = tab !== 'register';
    $('#authTitle').textContent = tab === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب';
    authErr.textContent = '';
  }
  authOverlay.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setAuthTab(b.dataset.tab)));

  function openAuth(tab = 'login', msg = '') {
    setAuthTab(tab);
    $('#authMsg').textContent = msg;
    authOverlay.classList.add('show');
  }

  /* ---------- أيقونة الحساب + القلوب ---------- */
  function updateUserBtn() {
    const btn = $('#userBtn');
    if (btn) btn.querySelector('i').className = user ? 'fa-solid fa-user' : 'fa-regular fa-user';
  }

  /* يقرأ ID المنتج من card.dataset.id الذي يضعه index.html الجديد */
  function cardProductId(card) {
    const id = card && card.dataset ? parseInt(card.dataset.id, 10) : NaN;
    return isNaN(id) ? null : id;
  }

  function syncHearts() {
    document.querySelectorAll('.card').forEach(card => {
      const id = cardProductId(card);
      const h = $('.heart', card);
      if (!h) return;
      const on = !!id && favIds.has(id);
      h.classList.toggle('on', on);
      const i = h.querySelector('i');
      if (i) i.className = on ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
    });
  }

  async function loadFavs() {
    favIds.clear();
    if (!user) return;
    try {
      const rows = check(await sb.from('favorites').select('product_id'));
      rows.forEach(r => favIds.add(r.product_id));
    } catch (e) {
      console.warn('loadFavs failed', e);
    }
  }

  async function afterLogin(u) {
    user = u;
    await loadFavs();
    updateUserBtn();
    syncHearts();
  }

  const userBtn = $('#userBtn');
  if (userBtn) userBtn.addEventListener('click', () => user ? openAccount() : openAuth('login'));

  /* ---------- الدخول / التسجيل ---------- */
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const btn = $('button[type=submit]', form);
    authErr.textContent = '';
    btn.disabled = true;
    try {
      const d = Object.fromEntries(new FormData(form));
      const phone = normPhone(d.phone);
      if (!phone) throw new Error('رقم الهاتف غير صحيح (مثال: 0560748560)');
      const data = check(await sb.auth.signInWithPassword({
        email: phoneToEmail(phone),
        password: d.password,
      }));
      form.reset();
      authOverlay.classList.remove('show');
      await afterLogin(toUser(data.user));
    } catch (err) {
      authErr.textContent = arabicError(err);
    }
    btn.disabled = false;
  });

  $('#registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const btn = $('button[type=submit]', form);
    authErr.textContent = '';
    btn.disabled = true;
    try {
      const d = Object.fromEntries(new FormData(form));
      const phone = normPhone(d.phone);
      if (!phone) throw new Error('رقم الهاتف غير صحيح (مثال: 0560748560)');
      const data = check(await sb.auth.signUp({
        email: phoneToEmail(phone),
        password: d.password,
        options: {
          data: {
            first_name: d.first_name.trim(),
            last_name: d.last_name.trim(),
            phone,
            contact_email: (d.email || '').trim(),
          },
        },
      }));
      if (!data.session) throw new Error('لم تُفتح الجلسة: أوقف خيار "Confirm email" في إعدادات Supabase');
      form.reset();
      authOverlay.classList.remove('show');
      await afterLogin(toUser(data.user));
    } catch (err) {
      authErr.textContent = arabicError(err);
    }
    btn.disabled = false;
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await sb.auth.signOut().catch(() => {});
    user = null;
    favIds.clear();
    updateUserBtn();
    syncHearts();
    accOverlay.classList.remove('show');
  });

  /* ---------- نافذة الحساب ---------- */
  let accTab = 'favs';
  accOverlay.querySelectorAll('[data-acc]').forEach(b => b.addEventListener('click', () => {
    accTab = b.dataset.acc;
    renderAccount();
  }));

  function openAccount() {
    accTab = 'favs';
    accOverlay.classList.add('show');
    renderAccount();
  }

  async function renderAccount() {
    if (!user) return;
    $('#accName').textContent = `مرحباً ${user.first_name} ${user.last_name}`.trim();
    accOverlay.querySelectorAll('[data-acc]').forEach(b => b.classList.toggle('active', b.dataset.acc === accTab));
    const box = $('#accContent');
    box.innerHTML = '<p style="text-align:center">جارٍ التحميل…</p>';

    try {
      if (accTab === 'favs') {
        const rows = check(await sb
          .from('favorites')
          .select('created_at, products(*)')
          .order('created_at', { ascending: false })
          .limit(500));

        const list = rows.map(r => r.products).filter(Boolean);
        if (list.length === 0) {
          box.innerHTML = '<p class="cart-empty-msg" style="display:block">لا توجد منتجات في المفضلة بعد.</p>';
        } else {
          box.innerHTML = list.map(p => `
            <div class="cart-item">
              <img src="${esc(p.image)}" alt="" style="width:54px;height:54px;border-radius:8px;object-fit:cover">
              <span class="cart-item-name">${esc(p.name)}</span>
              <span class="cart-item-price">${money(p.price)}</span>
              <button class="cart-item-remove" data-unfav="${p.id}" aria-label="إزالة"><i class="fa-solid fa-xmark"></i></button>
            </div>`).join('');
        }
      } else {
        /* الطلبات — حدّ أقصى 100 طلب لتفادي البطء */
        const orders = check(await sb
          .from('orders')
          .select('*, order_items(product_name, size, color, qty, unit_price)')
          .order('id', { ascending: false })
          .limit(100));

        if (orders.length === 0) {
          box.innerHTML = '<p class="cart-empty-msg" style="display:block">لم تقم بأي طلب بعد.</p>';
        } else {
          box.innerHTML = orders.map(o => `
            <div style="border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:12px">
              <div style="display:flex;justify-content:space-between;font-weight:800;font-size:14px">
                <span>طلب #${o.id}</span>
                <span style="color:var(--cocoa)">${STATUS[o.status] || esc(o.status)}</span>
              </div>
              <div style="font-size:12px;color:var(--muted);margin:2px 0 8px">
                ${esc(new Date(o.created_at).toLocaleDateString('ar-DZ'))} · ${esc(o.wilaya)}
              </div>
              ${(o.order_items || []).map(i => `
                <div style="display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 0">
                  <span class="cart-item-dot" style="--c:${esc(i.color)}"></span>
                  <span style="flex:1">${esc(i.product_name)} (${esc(i.size)}) × ${i.qty}</span>
                  <span dir="ltr">${money(i.unit_price * i.qty)}</span>
                </div>`).join('')}
              <div style="display:flex;justify-content:space-between;font-weight:800;border-top:1px solid var(--line);margin-top:6px;padding-top:6px;font-size:14px">
                <span>المجموع (مع التوصيل)</span><span dir="ltr">${money(o.total)}</span>
              </div>
            </div>`).join('');
        }
      }
    } catch (err) {
      box.innerHTML = `<p class="cart-empty-msg" style="display:block">${esc(arabicError(err))}</p>`;
    }
  }

  /* إزالة منتج من المفضلة عبر نافذة الحساب */
  $('#accContent').addEventListener('click', async e => {
    const btn = e.target.closest('[data-unfav]');
    if (!btn) return;
    const id = parseInt(btn.dataset.unfav, 10);
    try {
      check(await sb.from('favorites').delete().eq('product_id', id));
      favIds.delete(id);
      syncHearts();
      renderAccount();
    } catch (err) {
      console.warn(err);
    }
  });

  /* ---------- قلب المفضلة على البطاقة ---------- */
  document.addEventListener('click', async e => {
    const h = e.target.closest('.heart');
    if (!h) return;
    if (!user) {
      e.stopPropagation();
      e.preventDefault();
      openAuth('login', 'سجّل الدخول لحفظ المنتجات التي أعجبتك');
      return;
    }
    const card = h.closest('.card');
    const id = cardProductId(card);
    if (!id) {
      console.warn('لم يتم العثور على product id في البطاقة');
      return;
    }
    const willBeOn = !h.classList.contains('on');
    try {
      if (willBeOn) {
        const { error } = await sb.from('favorites').insert({ product_id: id });
        if (error && error.code !== '23505') throw error;
        favIds.add(id);
      } else {
        check(await sb.from('favorites').delete().eq('product_id', id));
        favIds.delete(id);
      }
    } catch (err) {
      console.warn(err);
      syncHearts();
    }
  }, true);

  /* ============================================================
     إتمام الطلب → حفظه في قاعدة البيانات
     نستخرج IDs المنتجات بالاسم عند الحاجة فقط (بدون تحميل 30,000 صف)
     ============================================================ */
  async function resolveProductIdsByNames(names) {
    const unique = [...new Set(names)];
    if (unique.length === 0) return {};

    /* Supabase in() يدعم حتى ~ألف قيمة، وهي أكثر من كافية لسلة */
    const { data, error } = await sb
      .from('products')
      .select('id, name')
      .in('name', unique);
    if (error) throw error;

    const map = {};
    (data || []).forEach(p => { map[p.name] = p.id; });
    return map;
  }

  document.addEventListener('submit', async e => {
    const form = e.target;
    if (form.id !== 'checkoutForm') return;

    /* إذا كان الطلب قد مرّ بالفعل، اترك المعالج الأصلي يكمل */
    if (form.dataset.ok === '1') {
      delete form.dataset.ok;
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const submitBtn = form.querySelector('button[type=submit]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      /* 1) استخرج أسماء المنتجات الأساسية من السلة */
      const parsed = (window.cart || []).map(i => {
        const m = String(i.name).match(/^(.*) \((XS|S|M|L|XL|XXL)\)$/);
        return {
          baseName: m ? m[1] : i.name,
          size: m ? m[2] : null,
          color: i.color,
          qty: i.qty,
        };
      });

      if (parsed.length === 0) throw new Error('السلة فارغة');
      if (parsed.some(p => !p.size)) throw new Error('اختر مقاساً لكل منتج قبل الطلب');

      /* 2) اجلب IDs المنتجات من قاعدة البيانات بالاسم */
      const nameToId = await resolveProductIdsByNames(parsed.map(p => p.baseName));
      const items = parsed.map(p => {
        const pid = nameToId[p.baseName];
        if (!pid) throw new Error(`لم يتم العثور على المنتج: ${p.baseName}`);
        return { product_id: pid, size: p.size, color: p.color, qty: p.qty };
      });

      /* 3) أرسل الطلب عبر RPC */
      const radios = [...document.querySelectorAll('#shipOptions input[name="shipping"]')];
      const res = check(await sb.rpc('create_order', {
        p_first_name: $('#firstName').value,
        p_last_name: $('#lastName').value,
        p_phone: $('#phone').value,
        p_wilaya: $('#wilaya').value,
        p_commune: $('#commune').value,
        p_shipping_type: radios.findIndex(r => r.checked) === 1 ? 'home' : 'office',
        p_items: items,
      }));

      /* 4) حدّث عنوان النجاح ليحمل رقم الطلب */
      const successTitle = $('#orderSuccessOverlay h3');
      if (successTitle && res && res.order_id) {
        successTitle.textContent = `تم تسجيل الطلب #${res.order_id}`;
      }

      /* 5) اسمح للمعالج الأصلي بالتنفيذ (تفريغ السلة + إظهار نافذة النجاح) */
      form.dataset.ok = '1';
      if (submitBtn) submitBtn.disabled = false;
      form.requestSubmit();
    } catch (err) {
      alert(arabicError(err));
      if (submitBtn) submitBtn.disabled = false;
    }
  }, true);

  /* ---------- تعبئة بيانات الزبون تلقائياً عند فتح نموذج الطلب ---------- */
  const cartCheckoutBtn = $('#cartCheckoutBtn');
  if (cartCheckoutBtn) {
    cartCheckoutBtn.addEventListener('click', () => {
      if (!user) return;
      if (!$('#firstName').value) $('#firstName').value = user.first_name;
      if (!$('#lastName').value) $('#lastName').value = user.last_name;
      if (!$('#phone').value) $('#phone').value = user.phone;
    });
  }

  /* ---------- البداية ---------- */
  (async () => {
    try {
      const { data } = await sb.auth.getSession();
      if (data && data.session) await afterLogin(toUser(data.session.user));
    } catch (err) {
      console.warn('getSession failed', err);
    }
  })();
})();
