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
    // Public client config by design; the security boundary is the Firestore
    // rules (wrapper tools/feature-forum) plus App Check once enforced.
    apiKey: 'AIzaSyDLS8qnR9BTzlROsVui12ZhJYbjmJlR0UA',
    authDomain: 'darpan-forum.firebaseapp.com',
    projectId: 'darpan-forum',
    appId: '1:608366042877:web:56b3aa7bae800fdeb4a894',
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

  var DAY_MS = 86400000, WINDOW_DAYS = 14;
  var NAMES = [
    'Vega','Altair','Deneb','Sirius','Rigel','Betelgeuse','Bellatrix','Mintaka','Alnilam','Alnitak',
    'Saiph','Meissa','Aldebaran','Antares','Arcturus','Capella','Castor','Pollux','Procyon','Spica',
    'Regulus','Fomalhaut','Canopus','Achernar','Polaris','Mizar','Alcor','Alioth','Dubhe','Merak',
    'Phecda','Megrez','Alkaid','Algol','Mirfak','Mira','Albireo','Sadr','Enif','Markab',
    'Scheat','Algenib','Mirach','Almach','Hamal','Sheratan','Menkar','Diphda','Alphard','Alphecca',
    'Unukalhai','Rasalhague','Sabik','Shaula','Lesath','Nunki','Ascella','Albali','Sadalmelik','Sadalsuud',
    'Skat','Situla','Ancha','Izar','Muphrid','Seginus','Nekkar','Kochab','Pherkad','Thuban',
    'Edasich','Eltanin','Rastaban','Grumium','Aludra','Wezen','Adhara','Mirzam','Furud','Muliphein',
    'Naos','Avior','Miaplacidus','Aspidiske','Suhail','Markeb','Gacrux','Acrux','Mimosa','Hadar',
    'Menkent','Toliman','Alnair','Aldhanab','Atria','Sargas','Fang','Dschubba','Acrab','Jabbah',
    'Alniyat','Kornephoros','Sarin','Vindemiatrix','Zavijava','Porrima','Heze','Kang','Zaurak','Cursa',
    'Phact','Wazn','Tarazed','Alshain','Sualocin','Rotanev','Kitalpha','Baham','Homam','Matar',
    'Electra','Maia','Merope','Taygeta','Alcyone','Celaeno','Asterope','Atlas','Pleione','Ceres',
    'Pallas','Vesta','Hygiea','Eros','Ida','Gaspra','Eris','Haumea','Makemake','Sedna',
    'Quaoar','Orcus','Ixion','Varuna','Bennu','Ryugu','Itokawa','Psyche','Lutetia','Mathilde',
    'Io','Europa','Ganymede','Callisto','Titan','Rhea','Iapetus','Dione','Tethys','Enceladus',
    'Mimas','Hyperion','Phoebe','Miranda','Ariel','Umbriel','Titania','Oberon','Triton','Nereid',
    'Proteus','Charon','Phobos','Deimos','Amalthea','Himalia','Elara','Janus','Epimetheus','Pandora',
    'Prometheus','Helene','Telesto','Calypso','Lyra','Orion','Andromeda','Cassiopeia','Perseus','Auriga',
    'Gemini','Taurus','Aries','Pisces','Aquarius','Sagittarius','Scorpius','Libra','Virgo','Leo',
    'Hydra','Corvus','Crater','Centaurus','Lupus','Ara','Hercules','Ophiuchus','Serpens','Aquila',
    'Delphinus','Equuleus','Pegasus','Lacerta','Cygnus','Cepheus','Draco','Bootes','Columba','Lepus',
    'Monoceros','Puppis','Vela','Carina','Pyxis','Antlia','Sextans','Fornax','Caelum','Dorado',
    'Volans','Chamaeleon','Musca','Circinus','Norma','Pavo','Indus','Tucana','Grus','Phoenix',
    'Sculptor','Horologium','Reticulum','Pictor','Mensa','Octans','Apus','Crux','Vulpecula','Sagitta',
    'Scutum','Lynx','Cetus','Eridanus','Pleiades','Hyades','Praesepe','Helix'
  ];

  function hashUid(uid) {
    var h = 2166136261;
    for (var i = 0; i < uid.length; i++) {
      h ^= uid.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  function pseudonym(uid) {
    var h = hashUid(uid);
    return NAMES[h % NAMES.length] + '-' + (10 + ((h / NAMES.length) | 0) % 90);
  }

  function isOpen(item) {
    return item.status === 'under_review' && (Date.now() - item.createdAt) < WINDOW_DAYS * DAY_MS;
  }

  function isAwaiting(item) {
    return item.status === 'under_review' && !isOpen(item);
  }

  function closesInDays(item) {
    return Math.max(1, Math.ceil((item.createdAt + WINDOW_DAYS * DAY_MS - Date.now()) / DAY_MS));
  }

  function timeAgo(ms) {
    var s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  var fb = null;        // { app, auth, db, fs, authMod } after SDK load
  var sdkPromise = null; // single-flight guard: the SSR mount and the hydrated
                         // mount both boot, and a second init would call
                         // connectFirestoreEmulator on an already-started instance
  var items = null;     // [{ id, title, detail, status, createdAt, up, down, score, myVote }]
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
    // The persisted anonymous session restores asynchronously; fetchAll keys
    // myVote off currentUser, so without this wait a slow restore renders the
    // visitor as a first-time voter (no highlight, wrong optimistic math).
    await auth.authStateReady();
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
      var agg = await f.getAggregateFromServer(votes, { score: f.sum('value'), n: f.count() });
      var commentsCol = f.collection(fb.db, 'requests', d.id, 'comments');
      var cAgg = await f.getAggregateFromServer(commentsCol, { n: f.count() });
      var myVote = 0;
      if (uid) {
        var mine = await f.getDoc(f.doc(fb.db, 'requests', d.id, 'votes', uid));
        if (mine.exists()) myVote = mine.data().value;
      }
      var data = d.data();
      // Vote values are ±1 (enforced by firestore.rules), so one aggregate
      // yields both directions: up + down = n, up - down = score.
      var score = agg.data().score || 0;
      var n = agg.data().n || 0;
      return {
        id: d.id,
        title: String(data.title || ''),
        detail: String(data.detail || ''),
        status: STATUS_LABELS[data.status] ? data.status : 'under_review',
        createdAt: data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : 0,
        up: (n + score) / 2,
        down: (n - score) / 2,
        score: score,
        myVote: myVote,
        commentCount: cAgg.data().n || 0,
        comments: null,
        expanded: false
      };
    }));
  }

  async function castVote(item, value) {
    if (!isOpen(item)) return;
    await ensureSignedIn();
    var f = fb.fs;
    var uid = fb.auth.currentUser.uid;
    var ref = f.doc(fb.db, 'requests', item.id, 'votes', uid);
    if (item.myVote === value) {          // clicking the same arrow removes the vote
      await f.deleteDoc(ref);
      if (value === 1) item.up -= 1; else item.down -= 1;
      item.myVote = 0;
    } else {                              // new vote or switch
      await f.setDoc(ref, { value: value, createdAt: f.serverTimestamp() });
      if (item.myVote === 1) item.up -= 1;
      if (item.myVote === -1) item.down -= 1;
      if (value === 1) item.up += 1; else item.down += 1;
      item.myVote = value;
    }
    item.score = item.up - item.down;
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
      createdAt: Date.now(), up: 0, down: 0, score: 0, myVote: 0,
      commentCount: 0, comments: [], expanded: false
    });
  }

  async function loadComments(item) {
    var f = fb.fs;
    var q = f.query(f.collection(fb.db, 'requests', item.id, 'comments'), f.orderBy('createdAt', 'asc'));
    var snap = await f.getDocs(q);
    item.comments = snap.docs.map(function (d) {
      var c = d.data();
      return {
        author: pseudonym(String(c.createdBy || '')),
        text: String(c.text || ''),
        at: c.createdAt && c.createdAt.toMillis ? c.createdAt.toMillis() : 0
      };
    });
  }

  async function submitComment(item, text) {
    await ensureSignedIn();
    var f = fb.fs;
    await f.addDoc(f.collection(fb.db, 'requests', item.id, 'comments'), {
      text: text,
      createdBy: fb.auth.currentUser.uid,
      createdAt: f.serverTimestamp()
    });
    if (item.comments) {
      item.comments.push({ author: pseudonym(fb.auth.currentUser.uid), text: text, at: Date.now() });
    }
    item.commentCount += 1;
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
      var open = isOpen(item);
      var row = el('div', 'ff-row');
      var votebox = el('div', 'ff-votebox');
      var up = el('button', 'ff-arrow' + (item.myVote === 1 ? ' ff-arrow-active' : ''), '▲');
      var down = el('button', 'ff-arrow ff-down' + (item.myVote === -1 ? ' ff-arrow-active' : ''), '▼');
      up.disabled = !open;
      down.disabled = !open;
      if (open) {
        [[up, 1], [down, -1]].forEach(function (pair) {
          pair[0].addEventListener('click', function () {
            castVote(item, pair[1]).then(function () { render(mount); })
              .catch(function () {
                item.error = 'Could not save your vote — try again.';
                render(mount);
              });
          });
        });
      }
      var upRow = el('div', 'ff-voterow');
      upRow.appendChild(up);
      upRow.appendChild(el('span', 'ff-count', String(item.up)));
      var downRow = el('div', 'ff-voterow');
      downRow.appendChild(down);
      downRow.appendChild(el('span', 'ff-count', String(item.down)));
      votebox.appendChild(upRow);
      votebox.appendChild(downRow);

      var body = el('div');
      body.style.flex = '1';
      body.style.cursor = 'pointer';
      body.appendChild(el('p', 'ff-title', item.title));
      if (item.detail) body.appendChild(el('p', 'ff-detail', item.detail));
      var meta = open
        ? 'closes in ' + closesInDays(item) + 'd · ' + item.commentCount + (item.commentCount === 1 ? ' comment' : ' comments')
        : item.commentCount + (item.commentCount === 1 ? ' comment' : ' comments');
      body.appendChild(el('p', 'ff-meta', meta + (item.expanded ? ' ▾' : ' ▸')));
      if (item.error) {
        body.appendChild(el('p', 'ff-error', item.error));
        delete item.error;
      }
      body.addEventListener('click', function () {
        item.expanded = !item.expanded;
        if (item.expanded && item.comments === null) {
          render(mount);
          loadComments(item).then(function () { render(mount); })
            .catch(function () { item.comments = []; render(mount); });
        } else {
          render(mount);
        }
      });

      var chip = isAwaiting(item)
        ? el('span', 'ff-chip ff-chip-awaiting', 'Awaiting decision')
        : el('span', 'ff-chip ff-chip-' + item.status, STATUS_LABELS[item.status]);

      row.appendChild(votebox);
      row.appendChild(body);
      row.appendChild(chip);
      list.appendChild(row);

      if (item.expanded) {
        var thread = el('div', 'ff-thread');
        if (item.comments === null) {
          thread.appendChild(el('p', 'ff-notice', 'Loading discussion…'));
        } else {
          item.comments.forEach(function (c) {
            var cRow = el('div', 'ff-comment');
            var head = el('p', 'ff-cauthor', c.author);
            head.appendChild(el('span', 'ff-ctime', ' · ' + timeAgo(c.at)));
            cRow.appendChild(head);
            cRow.appendChild(el('p', 'ff-ctext', c.text));
            thread.appendChild(cRow);
          });
          if (!item.comments.length) {
            thread.appendChild(el('p', 'ff-notice', open ? 'No comments yet — start the discussion.' : 'No comments were posted.'));
          }
          if (open) {
            var composer = el('div', 'ff-composer');
            var ta = el('textarea', 'ff-textarea');
            ta.placeholder = 'Join the discussion…';
            ta.maxLength = 1000;
            var cActions = el('div', 'ff-actions');
            var cErr = el('p', 'ff-error');
            cErr.style.display = 'none';
            var cBtn = el('button', 'ff-button', 'Comment');
            cBtn.addEventListener('click', function () {
              var text = ta.value.trim();
              if (!text) return;
              cBtn.disabled = true;
              submitComment(item, text).then(function () { render(mount); })
                .catch(function () {
                  cErr.textContent = 'Could not post right now — try again.';
                  cErr.style.display = '';
                  cBtn.disabled = false;
                });
            });
            cActions.appendChild(el('span', 'ff-notice',
              fb && fb.auth.currentUser ? 'Commenting as ' + pseudonym(fb.auth.currentUser.uid) : 'Your handle is assigned on first post.'));
            cActions.appendChild(cBtn);
            composer.appendChild(ta);
            composer.appendChild(cErr);
            composer.appendChild(cActions);
            thread.appendChild(composer);
          } else {
            thread.appendChild(el('p', 'ff-notice', 'Discussion closed.'));
          }
        }
        list.appendChild(thread);
      }
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
