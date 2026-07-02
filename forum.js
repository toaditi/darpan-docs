/* Feature-request board for /releases/feature-requests.
 * Mintlify injects every .js file into every docs page, so this file:
 *  - must stay the only .js in the repo,
 *  - no-ops unless #feature-forum exists,
 *  - watches for the mount via MutationObserver because Mintlify routes
 *    client-side (a run-once script would miss SPA navigation),
 *  - loads the Firebase SDK only after the mount is found.
 * Server-side contract lives in wrapper tools/feature-forum/firestore.rules.
 */
(function () {
  'use strict';

  var FORUM_CONFIG = {
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: '',
    recaptchaSiteKey: '',
    useEmulator: false
  };

  var SDK_BASE = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var MOUNT_ID = 'feature-forum';
  var TITLE_MIN = 4, TITLE_MAX = 120, DETAIL_MAX = 2000;
  var STATUS_LABELS = {
    under_review: 'Under review',
    planned: 'Planned',
    in_progress: 'In progress',
    shipped: 'Shipped',
    declined: 'Declined'
  };

  var fb = null;        // { app, auth, db, fs, authMod } after SDK load
  var sdkPromise = null; // single-flight guard: the SSR mount and the hydrated
                         // mount both boot, and a second init would call
                         // connectFirestoreEmulator on an already-started instance
  var items = null;     // [{ id, title, detail, status, createdAt, score, myVote }]
  var sortMode = 'top';
  var currentMount = null;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text; // textContent only: user data must never hit innerHTML
    return node;
  }

  function isConfigured() {
    return FORUM_CONFIG.useEmulator || (FORUM_CONFIG.projectId && FORUM_CONFIG.apiKey);
  }

  function loadSdk() {
    if (!sdkPromise) sdkPromise = initSdk();
    return sdkPromise;
  }

  async function initSdk() {
    var appMod = await import(SDK_BASE + 'firebase-app.js');
    var fs = await import(SDK_BASE + 'firebase-firestore.js');
    var authMod = await import(SDK_BASE + 'firebase-auth.js');
    var app = appMod.initializeApp(FORUM_CONFIG.useEmulator
      ? { projectId: 'demo-darpan-forum', apiKey: 'demo' }
      : { apiKey: FORUM_CONFIG.apiKey, authDomain: FORUM_CONFIG.authDomain,
          projectId: FORUM_CONFIG.projectId, appId: FORUM_CONFIG.appId });
    if (!FORUM_CONFIG.useEmulator && FORUM_CONFIG.recaptchaSiteKey) {
      var ac = await import(SDK_BASE + 'firebase-app-check.js');
      ac.initializeAppCheck(app, {
        provider: new ac.ReCaptchaV3Provider(FORUM_CONFIG.recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true
      });
    }
    var db = fs.getFirestore(app);
    var auth = authMod.getAuth(app);
    if (FORUM_CONFIG.useEmulator) {
      fs.connectFirestoreEmulator(db, '127.0.0.1', 8087);
      authMod.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
    fb = { app: app, auth: auth, db: db, fs: fs, authMod: authMod };
    return fb;
  }

  async function ensureSignedIn() {
    if (fb.auth.currentUser) return fb.auth.currentUser;
    await fb.authMod.signInAnonymously(fb.auth);
    return fb.auth.currentUser;
  }

  async function fetchAll() {
    var f = fb.fs;
    var snap = await f.getDocs(f.query(f.collection(fb.db, 'requests')));
    var uid = fb.auth.currentUser ? fb.auth.currentUser.uid : null;
    items = await Promise.all(snap.docs.map(async function (d) {
      var votes = f.collection(fb.db, 'requests', d.id, 'votes');
      var agg = await f.getAggregateFromServer(votes, { score: f.sum('value') });
      var myVote = 0;
      if (uid) {
        var mine = await f.getDoc(f.doc(fb.db, 'requests', d.id, 'votes', uid));
        if (mine.exists()) myVote = mine.data().value;
      }
      var data = d.data();
      return {
        id: d.id,
        title: String(data.title || ''),
        detail: String(data.detail || ''),
        status: STATUS_LABELS[data.status] ? data.status : 'under_review',
        createdAt: data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : 0,
        score: agg.data().score || 0,
        myVote: myVote
      };
    }));
  }

  async function castVote(item, value) {
    await ensureSignedIn();
    var f = fb.fs;
    var uid = fb.auth.currentUser.uid;
    var ref = f.doc(fb.db, 'requests', item.id, 'votes', uid);
    if (item.myVote === value) {          // clicking the same arrow removes the vote
      await f.deleteDoc(ref);
      item.score -= value;
      item.myVote = 0;
    } else {                              // new vote or switch
      await f.setDoc(ref, { value: value, createdAt: f.serverTimestamp() });
      item.score += value - item.myVote;
      item.myVote = value;
    }
  }

  async function submitRequest(title, detail) {
    await ensureSignedIn();
    var f = fb.fs;
    var ref = await f.addDoc(f.collection(fb.db, 'requests'), {
      title: title,
      detail: detail,
      status: 'under_review',
      createdBy: fb.auth.currentUser.uid,
      createdAt: f.serverTimestamp()
    });
    items.unshift({
      id: ref.id, title: title, detail: detail, status: 'under_review',
      createdAt: Date.now(), score: 0, myVote: 0
    });
  }

  function sorted() {
    var copy = items.slice();
    copy.sort(sortMode === 'top'
      ? function (a, b) { return b.score - a.score || b.createdAt - a.createdAt; }
      : function (a, b) { return b.createdAt - a.createdAt; });
    return copy;
  }

  function render(mount) {
    mount.replaceChildren();

    if (!isConfigured()) {
      mount.appendChild(el('p', 'ff-notice',
        'The request board is warming up — check back soon.'));
      return;
    }
    if (items === null) {
      mount.appendChild(el('p', 'ff-notice', 'Loading requests…'));
      return;
    }

    var box = el('div', 'ff-submit');
    var titleInput = el('input', 'ff-input');
    titleInput.placeholder = 'One-line summary of your idea…';
    titleInput.maxLength = TITLE_MAX;
    var detailInput = el('textarea', 'ff-textarea');
    detailInput.placeholder = 'What problem does it solve? (optional)';
    detailInput.maxLength = DETAIL_MAX;
    var actions = el('div', 'ff-actions');
    var errLine = el('p', 'ff-error');
    errLine.style.display = 'none';
    var button = el('button', 'ff-button', 'Submit request');
    button.addEventListener('click', function () {
      var title = titleInput.value.trim();
      if (title.length < TITLE_MIN) {
        errLine.textContent = 'Give the idea a summary of at least ' + TITLE_MIN + ' characters.';
        errLine.style.display = '';
        return;
      }
      button.disabled = true;
      submitRequest(title, detailInput.value.trim()).then(function () {
        render(mount);
      }).catch(function () {
        errLine.textContent = 'Could not submit right now — try again.';
        errLine.style.display = '';
        button.disabled = false;
      });
    });
    actions.appendChild(el('span', 'ff-notice', 'No account needed.'));
    actions.appendChild(button);
    box.appendChild(titleInput);
    box.appendChild(detailInput);
    box.appendChild(errLine);
    box.appendChild(actions);
    mount.appendChild(box);

    var toolbar = el('div', 'ff-toolbar');
    toolbar.appendChild(el('span', null, items.length + ' request' + (items.length === 1 ? '' : 's')));
    var sortWrap = el('span');
    [['top', 'Top voted'], ['new', 'Newest']].forEach(function (pair, i) {
      if (i) sortWrap.appendChild(el('span', null, ' · '));
      var b = el('button', 'ff-sort' + (sortMode === pair[0] ? ' ff-sort-active' : ''), pair[1]);
      b.addEventListener('click', function () { sortMode = pair[0]; render(mount); });
      sortWrap.appendChild(b);
    });
    toolbar.appendChild(sortWrap);
    mount.appendChild(toolbar);

    if (!items.length) {
      mount.appendChild(el('p', 'ff-notice', 'No requests yet — yours can be the first.'));
      return;
    }

    var list = el('div', 'ff-list');
    sorted().forEach(function (item) {
      var row = el('div', 'ff-row');
      var votebox = el('div', 'ff-votebox');
      var up = el('button', 'ff-arrow' + (item.myVote === 1 ? ' ff-arrow-active' : ''), '▲');
      var down = el('button', 'ff-arrow ff-down' + (item.myVote === -1 ? ' ff-arrow-active' : ''), '▼');
      [[up, 1], [down, -1]].forEach(function (pair) {
        pair[0].addEventListener('click', function () {
          castVote(item, pair[1]).then(function () { render(mount); })
            .catch(function () {
              item.error = 'Could not save your vote — try again.';
              render(mount);
            });
        });
      });
      votebox.appendChild(up);
      votebox.appendChild(el('div', 'ff-score', String(item.score)));
      votebox.appendChild(down);
      var body = el('div');
      body.style.flex = '1';
      body.appendChild(el('p', 'ff-title', item.title));
      if (item.detail) body.appendChild(el('p', 'ff-detail', item.detail));
      if (item.error) {
        body.appendChild(el('p', 'ff-error', item.error));
        delete item.error;
      }
      row.appendChild(votebox);
      row.appendChild(body);
      row.appendChild(el('span', 'ff-chip ff-chip-' + item.status, STATUS_LABELS[item.status]));
      list.appendChild(row);
    });
    mount.appendChild(list);
  }

  async function boot(mount) {
    render(mount);                     // configured? / loading state
    if (!isConfigured()) return;
    try {
      await loadSdk();
      await fetchAll();
    } catch (e) {
      console.error('[forum] boot failed:', e);
      mount.replaceChildren(el('p', 'ff-notice',
        'The request board could not load. Refresh to try again.'));
      return;
    }
    if (mount === currentMount) render(mount);
  }

  function watchForMount() {
    function check() {
      var mount = document.getElementById(MOUNT_ID);
      if (mount && mount !== currentMount) {
        currentMount = mount;
        items = null;                  // refetch on each page visit
        boot(mount);
      }
    }
    check();
    new MutationObserver(check).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchForMount);
  } else {
    watchForMount();
  }
})();
