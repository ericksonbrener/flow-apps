/* flow-auth.js — login + sincronização por usuário (Supabase) para apps do Ecossistema Flow.
   Requer:
     - window.FLOW_SUPABASE = { url, key, table, prefix }
     - a lib UMD do Supabase (window.supabase) carregada antes deste arquivo
   Estratégia:
     - tela de login cobre o app até autenticar;
     - ao logar: baixa o documento do usuário -> popula localStorage -> reinicia o app;
     - se a conta ainda não tem dados: sobe o que já está no aparelho (migração);
     - cada gravação local agenda um upload (debounce) do documento completo.
   Isolamento: a tabela usa RLS (auth.uid() = user_id), então cada conta só vê o que é dela. */
(function () {
  var CFG = window.FLOW_SUPABASE;
  if (!CFG || !window.supabase) { console.warn('[flow-auth] config/lib ausente'); return; }

  var sb = window.supabase.createClient(CFG.url, CFG.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  var TABLE = CFG.table, PREFIX = CFG.prefix || 'ff_';
  var session = null, syncTimer = null, ready = false;

  /* ---------- documento = todas as chaves do app no localStorage ---------- */
  function collectDoc() {
    var doc = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(PREFIX) === 0) {
        try { doc[k] = JSON.parse(localStorage.getItem(k)); }
        catch (e) { doc[k] = localStorage.getItem(k); }
      }
    }
    return doc;
  }
  function applyDoc(doc) {
    if (!doc || typeof doc !== 'object') return false;
    var keys = Object.keys(doc), n = 0;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i]; if (k.indexOf(PREFIX) !== 0) continue;
      try { localStorage.setItem(k, JSON.stringify(doc[k])); n++; } catch (e) {}
    }
    return n > 0;
  }

  /* ---------- sincronização ---------- */
  async function pullAndStart() {
    var box = document.getElementById('flowAuthMsg');
    try {
      var res = await sb.from(TABLE).select('data').eq('user_id', session.user.id).maybeSingle();
      if (res.error) throw res.error;
      if (res.data && res.data.data && Object.keys(res.data.data).length) {
        applyDoc(res.data.data);          // nuvem -> aparelho
      } else {
        await pushNow(true);              // 1ª vez: migra o que há no aparelho
      }
    } catch (e) {
      if (box) box.textContent = 'Falha ao sincronizar: ' + (e.message || e) + ' (usando dados locais).';
      console.error('[flow-auth] pull', e);
    }
    // marca que esta sessão de aba já sincronizou (evita recarga em loop no boot)
    try { sessionStorage.setItem('flowSynced', '1'); } catch (e) {}
    location.reload();
  }
  async function pushNow(silent) {
    if (!session) return;
    var doc = collectDoc();
    var row = { user_id: session.user.id, data: doc, updated_at: new Date().toISOString() };
    var res = await sb.from(TABLE).upsert(row, { onConflict: 'user_id' });
    if (res.error && !silent) console.error('[flow-auth] push', res.error);
    return res;
  }
  function scheduleSync() {
    if (!ready || !session) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { pushNow(false); }, 1500);
  }

  /* envolve sv() para subir após cada gravação local */
  function hookSave() {
    if (typeof window.sv === 'function' && !window.sv.__flowHooked) {
      var orig = window.sv;
      window.sv = function (k, d) { orig(k, d); scheduleSync(); };
      window.sv.__flowHooked = true;
    }
  }

  /* ---------- UI da tela de login ---------- */
  function gateHTML() {
    return '' +
'<div id="flowAuthCard">' +
'  <div id="flowAuthBrand">Ecossistema&nbsp;Flow</div>' +
'  <h2 id="flowAuthTitle">Entrar</h2>' +
'  <p id="flowAuthSub">Acesse sua conta para sincronizar seus dados.</p>' +
'  <label class="flowAuthL">E-mail</label>' +
'  <input id="flowAuthEmail" class="flowAuthI" type="email" autocomplete="email" inputmode="email" placeholder="voce@exemplo.com">' +
'  <label class="flowAuthL">Senha</label>' +
'  <input id="flowAuthPass" class="flowAuthI" type="password" autocomplete="current-password" placeholder="••••••••">' +
'  <div id="flowAuthMsg" class="flowAuthMsg"></div>' +
'  <button id="flowAuthBtn" class="flowAuthBtn">Entrar</button>' +
'  <div class="flowAuthRow">' +
'    <a id="flowAuthToggle" class="flowAuthLink" href="#">Criar conta</a>' +
'    <a id="flowAuthForgot" class="flowAuthLink" href="#">Esqueci a senha</a>' +
'  </div>' +
'  <div id="flowAuthLgpd" class="flowAuthLgpd"></div>' +
'</div>';
  }
  function gateCSS() {
    return '' +
'#flowAuthGate{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
'  padding:18px;background:radial-gradient(1200px 600px at 50% -10%,#0d1b1e,#05090a);overflow:auto}' +
'#flowAuthCard{width:100%;max-width:380px;background:#0e1518;border:1px solid #1d2a2f;border-radius:18px;' +
'  padding:26px 24px;box-shadow:0 24px 70px rgba(0,0,0,.55);color:#e8eef0;font-family:inherit}' +
'#flowAuthBrand{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#f97316;font-weight:700}' +
'#flowAuthTitle{margin:10px 0 4px;font-size:22px;font-weight:700;color:#fff}' +
'#flowAuthSub{margin:0 0 18px;font-size:13px;color:#9fb0b5;line-height:1.4}' +
'.flowAuthL{display:block;font-size:12px;color:#9fb0b5;margin:12px 0 6px}' +
'.flowAuthI{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:11px;border:1px solid #26343a;' +
'  background:#0a1013;color:#fff;font-size:15px;outline:none}' +
'.flowAuthI:focus{border-color:#f97316}' +
'.flowAuthBtn{width:100%;margin-top:18px;padding:13px;border:none;border-radius:11px;cursor:pointer;' +
'  background:#f97316;color:#1a0f06;font-size:15px;font-weight:700}' +
'.flowAuthBtn:disabled{opacity:.6;cursor:default}' +
'.flowAuthRow{display:flex;justify-content:space-between;margin-top:16px}' +
'.flowAuthLink{color:#60a5fa;font-size:13px;text-decoration:none}' +
'.flowAuthLink:hover{text-decoration:underline}' +
'.flowAuthMsg{min-height:18px;margin-top:12px;font-size:13px;color:#fbbf24;line-height:1.35}' +
'.flowAuthMsg.ok{color:#34d399}' +
'.flowAuthLgpd{margin-top:18px;padding-top:14px;border-top:1px solid #1d2a2f;font-size:11px;color:#6f8086;line-height:1.45}';
  }

  var mode = 'in'; // 'in' login | 'up' cadastro
  function setMode(m) {
    mode = m;
    var t = document.getElementById('flowAuthTitle'),
        s = document.getElementById('flowAuthSub'),
        b = document.getElementById('flowAuthBtn'),
        tg = document.getElementById('flowAuthToggle'),
        p = document.getElementById('flowAuthPass'),
        lg = document.getElementById('flowAuthLgpd');
    if (m === 'up') {
      t.textContent = 'Criar conta';
      s.textContent = 'Cadastre-se para guardar seus dados com segurança.';
      b.textContent = 'Cadastrar';
      tg.textContent = 'Já tenho conta';
      p.setAttribute('autocomplete', 'new-password');
      lg.innerHTML = 'Ao criar a conta, seus dados financeiros ficam vinculados apenas ao seu e-mail e ' +
        'protegidos por isolamento por usuário (RLS). Usamos seu e-mail somente para autenticação. ' +
        'Você pode solicitar a exclusão a qualquer momento.';
    } else {
      t.textContent = 'Entrar';
      s.textContent = 'Acesse sua conta para sincronizar seus dados.';
      b.textContent = 'Entrar';
      tg.textContent = 'Criar conta';
      p.setAttribute('autocomplete', 'current-password');
      lg.innerHTML = '';
    }
    msg('');
  }
  function msg(txt, ok) {
    var m = document.getElementById('flowAuthMsg');
    if (!m) return; m.textContent = txt || ''; m.className = 'flowAuthMsg' + (ok ? ' ok' : '');
  }
  function busy(on) {
    var b = document.getElementById('flowAuthBtn'); if (b) b.disabled = on;
  }

  async function submit() {
    var email = (document.getElementById('flowAuthEmail').value || '').trim();
    var pass = document.getElementById('flowAuthPass').value || '';
    if (!email || !pass) { msg('Preencha e-mail e senha.'); return; }
    if (mode === 'up' && pass.length < 6) { msg('A senha precisa ter ao menos 6 caracteres.'); return; }
    busy(true); msg(mode === 'up' ? 'Criando conta…' : 'Entrando…');
    try {
      var res;
      if (mode === 'up') {
        res = await sb.auth.signUp({ email: email, password: pass });
        if (res.error) throw res.error;
        if (!res.data.session) { // confirmação por e-mail ativada
          busy(false); msg('Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre.', true);
          setMode('in'); return;
        }
      } else {
        res = await sb.auth.signInWithPassword({ email: email, password: pass });
        if (res.error) throw res.error;
      }
      session = res.data.session;
      msg('Sincronizando…', true);
      await pullAndStart();
    } catch (e) {
      busy(false); msg(traduzErro(e));
    }
  }
  async function forgot() {
    var email = (document.getElementById('flowAuthEmail').value || '').trim();
    if (!email) { msg('Digite seu e-mail acima para receber o link de recuperação.'); return; }
    busy(true);
    try {
      var res = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href });
      if (res.error) throw res.error;
      msg('Enviamos um link de redefinição para ' + email + '.', true);
    } catch (e) { msg(traduzErro(e)); }
    busy(false);
  }
  function traduzErro(e) {
    var m = (e && e.message || '').toLowerCase();
    if (m.indexOf('invalid login') >= 0) return 'E-mail ou senha incorretos.';
    if (m.indexOf('already registered') >= 0 || m.indexOf('already exists') >= 0) return 'Este e-mail já tem conta. Use "Entrar".';
    if (m.indexOf('email not confirmed') >= 0) return 'Confirme seu e-mail pelo link enviado antes de entrar.';
    if (m.indexOf('rate limit') >= 0) return 'Muitas tentativas. Aguarde alguns minutos.';
    return e && e.message || 'Erro inesperado.';
  }

  function openGate() {
    if (document.getElementById('flowAuthGate')) return;
    var st = document.createElement('style'); st.id = 'flowAuthCSS'; st.textContent = gateCSS();
    document.head.appendChild(st);
    var g = document.createElement('div'); g.id = 'flowAuthGate'; g.innerHTML = gateHTML();
    document.body.appendChild(g);
    document.getElementById('flowAuthBtn').onclick = submit;
    document.getElementById('flowAuthToggle').onclick = function (e) { e.preventDefault(); setMode(mode === 'in' ? 'up' : 'in'); };
    document.getElementById('flowAuthForgot').onclick = function (e) { e.preventDefault(); forgot(); };
    document.getElementById('flowAuthPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    setMode('in');
  }
  function closeGate() {
    var g = document.getElementById('flowAuthGate'); if (g) g.remove();
    var st = document.getElementById('flowAuthCSS'); if (st) st.remove();
  }

  /* botão "Sair" no rodapé da sidebar */
  function addLogout() {
    if (document.getElementById('flowLogout')) return;
    var bot = document.querySelector('#sb .sbbot') || document.querySelector('#sb');
    if (!bot) return;
    var b = document.createElement('button');
    b.id = 'flowLogout';
    b.style.cssText = 'width:100%;margin-top:10px;padding:9px;border:1px solid #2a2a2a;border-radius:10px;' +
      'background:transparent;color:#9fb0b5;font-size:12.5px;cursor:pointer';
    b.textContent = 'Sair (' + (session && session.user ? session.user.email : '') + ')';
    b.onclick = async function () {
      await pushNow(true);          // garante o último estado na nuvem
      await sb.auth.signOut();
      try { sessionStorage.removeItem('flowSynced'); } catch (e) {}
      location.reload();
    };
    bot.appendChild(b);
  }

  /* redefinição de senha: o link de recuperação abre o app neste evento */
  var recovering = false;
  sb.auth.onAuthStateChange(function (event, sess) {
    if (event === 'PASSWORD_RECOVERY') {
      recovering = true; session = sess;
      try { sessionStorage.removeItem('flowSynced'); } catch (e) {}
      openGate(); setRecoverMode();
    }
  });
  function setRecoverMode() {
    var t = document.getElementById('flowAuthTitle'),
        s = document.getElementById('flowAuthSub'),
        b = document.getElementById('flowAuthBtn'),
        em = document.getElementById('flowAuthEmail'),
        p = document.getElementById('flowAuthPass'),
        row = document.querySelector('.flowAuthRow');
    t.textContent = 'Nova senha';
    s.textContent = 'Defina uma nova senha para sua conta.';
    b.textContent = 'Salvar nova senha';
    if (em) em.style.display = 'none';
    if (em && em.previousElementSibling) em.previousElementSibling.style.display = 'none';
    p.setAttribute('autocomplete', 'new-password');
    p.value = '';
    if (row) row.style.display = 'none';
    b.onclick = saveNewPass;
    p.onkeydown = function (e) { if (e.key === 'Enter') saveNewPass(); };
  }
  async function saveNewPass() {
    var pass = document.getElementById('flowAuthPass').value || '';
    if (pass.length < 6) { msg('A senha precisa ter ao menos 6 caracteres.'); return; }
    busy(true); msg('Salvando…');
    try {
      var res = await sb.auth.updateUser({ password: pass });
      if (res.error) throw res.error;
      recovering = false;
      msg('Senha alterada! Entrando…', true);
      var sres = await sb.auth.getSession(); session = sres.data.session;
      await pullAndStart();
    } catch (e) { busy(false); msg(traduzErro(e)); }
  }

  /* ---------- boot ---------- */
  async function boot() {
    hookSave();
    if (recovering) return;  // tela de nova senha já está no ar
    var res = await sb.auth.getSession();
    session = res.data.session;
    if (!session) { openGate(); return; }
    var synced = false;
    try { synced = sessionStorage.getItem('flowSynced') === '1'; } catch (e) {}
    if (!synced) {
      // aparelho/aba ainda não sincronizou nesta sessão: baixa a nuvem e recarrega
      openGate();
      msg('Sincronizando seus dados…', true);
      busy(true);
      await pullAndStart();   // aplica doc + reload (que voltará já marcado como synced)
      return;
    }
    // já sincronizado nesta aba: liga o sync e o botão sair, sem recarregar
    ready = true;
    addLogout();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }

  // expõe p/ debug/uso externo
  window.flowAuth = { pushNow: pushNow, signOut: function () { return sb.auth.signOut().then(function(){location.reload();}); } };
})();
