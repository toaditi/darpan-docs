/* Community boards for /releases/feature-requests and /releases/bug-reports.
 * Mintlify injects every .js file into every docs page, so this file:
 *  - must stay the only .js in the repo (both boards live here, not in two files),
 *  - no-ops unless one of the board mounts exists,
 *  - watches for mounts via MutationObserver because Mintlify routes
 *    client-side (a run-once script would miss SPA navigation),
 *  - loads the Firebase SDK only after a mount is found.
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
  var TITLE_MIN = 4, TITLE_MAX = 120, DETAIL_MAX = 2000;
  var STATUS_LABELS = {
    under_review: 'Under review',
    planned: 'Planned',
    in_progress: 'In progress',
    shipped: 'Shipped',
    declined: 'Declined'
  };

  var LINK_MIN = 8, LINK_MAX = 500, BUG_DETAIL_MIN = 20, BUG_DETAIL_MAX = 4000;
  var BUG_STATUS_LABELS = {
    reported: 'Reported',
    confirmed: 'Confirmed',
    fixed: 'Fixed',
    cannot_reproduce: 'Cannot reproduce',
    not_a_bug: 'Not a bug',
    duplicate: 'Duplicate'
  };
  // Screenshots are stored inline as base64 data URLs, one document per slot.
  // The cap is structural in firestore.rules (only ids 1..3 are legal) because
  // rules cannot count documents in a subcollection; keep these in step with it.
  var SHOT_MAX = 3, SHOT_EDGE = 1600, SHOT_CHARS = 700000;
  var SHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  // Mirrors the firestore.rules pattern. The rules already reject anything else,
  // but a stored value reaches an <a href> and an <img src>, and a URL sink must
  // not depend on a single remote control being correctly deployed.
  var SHOT_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
  var HEADLINE_MAX = 90;

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

  // Each board keeps its own mount, item list, sort mode and draft. They render
  // on separate pages, but Mintlify navigates client-side without a reload, so
  // module-level shared state would leak one board's data into the other.
  var BOARDS = [
    { id: 'feature-forum', kind: 'request', collection: 'requests', sortMode: 'top',
      mount: null, items: null, draft: null },
    { id: 'bug-board', kind: 'bug', collection: 'bugs', sortMode: 'affected',
      mount: null, items: null, draft: null }
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

  // Bugs have no time window: a report stays open until someone decides it is closed.
  function bugOpen(item) {
    return item.status === 'reported' || item.status === 'confirmed';
  }

  // There is no title field on a bug — intake is the link and the description —
  // so the list headline is the description's first line.
  function headline(detail) {
    var first = String(detail || '').split('\n')[0].trim();
    return first.length > HEADLINE_MAX ? first.slice(0, HEADLINE_MAX) + '…' : first;
  }

  function timeAgo(ms) {
    var s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  var fb = null;        // { app, auth, db, fs, authMod } after SDK load
  var sdkPromise = null; // single-flight guard: the SSR mount and the hydrated
                         // mount both boot, and a second init would call
                         // connectFirestoreEmulator on an already-started instance

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
    // The persisted anonymous session restores asynchronously; the fetchers key
    // the visitor's own vote/mark off currentUser, so without this wait a slow
    // restore renders them as a first-time voter (no highlight, wrong optimistic math).
    await auth.authStateReady();
    fb = { app: app, auth: auth, db: db, fs: fs, authMod: authMod };
    return fb;
  }

  async function ensureSignedIn() {
    if (fb.auth.currentUser) return fb.auth.currentUser;
    await fb.authMod.signInAnonymously(fb.auth);
    return fb.auth.currentUser;
  }

  /* ---- feature requests ---- */

  async function fetchRequests(board) {
    var f = fb.fs;
    var snap = await f.getDocs(f.query(f.collection(fb.db, 'requests')));
    var uid = fb.auth.currentUser ? fb.auth.currentUser.uid : null;
    board.items = await Promise.all(snap.docs.map(async function (d) {
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
        author: pseudonym(String(data.createdBy || '')),
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

  async function submitRequest(board, title, detail) {
    await ensureSignedIn();
    var f = fb.fs;
    var ref = await f.addDoc(f.collection(fb.db, 'requests'), {
      title: title,
      detail: detail,
      status: 'under_review',
      createdBy: fb.auth.currentUser.uid,
      createdAt: f.serverTimestamp()
    });
    board.items.unshift({
      id: ref.id, title: title, detail: detail, status: 'under_review',
      createdAt: Date.now(), author: pseudonym(fb.auth.currentUser.uid),
      up: 0, down: 0, score: 0, myVote: 0,
      commentCount: 0, comments: [], expanded: false
    });
  }

  /* ---- bug reports ---- */

  async function fetchBugs(board) {
    var f = fb.fs;
    var snap = await f.getDocs(f.query(f.collection(fb.db, 'bugs')));
    var uid = fb.auth.currentUser ? fb.auth.currentUser.uid : null;
    board.items = await Promise.all(snap.docs.map(async function (d) {
      var affectedCol = f.collection(fb.db, 'bugs', d.id, 'affected');
      var aAgg = await f.getAggregateFromServer(affectedCol, { n: f.count() });
      var commentsCol = f.collection(fb.db, 'bugs', d.id, 'comments');
      var cAgg = await f.getAggregateFromServer(commentsCol, { n: f.count() });
      // Only the count here — the images themselves load on expand, because the
      // list fetches every document and inline base64 would cost megabytes a visit.
      var shotsCol = f.collection(fb.db, 'bugs', d.id, 'shots');
      var sAgg = await f.getAggregateFromServer(shotsCol, { n: f.count() });
      var mine = false;
      if (uid) {
        var own = await f.getDoc(f.doc(fb.db, 'bugs', d.id, 'affected', uid));
        mine = own.exists();
      }
      var data = d.data();
      return {
        id: d.id,
        link: String(data.link || ''),
        detail: String(data.detail || ''),
        status: BUG_STATUS_LABELS[data.status] ? data.status : 'reported',
        createdAt: data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : 0,
        author: pseudonym(String(data.createdBy || '')),
        affected: aAgg.data().n || 0,
        mine: mine,
        commentCount: cAgg.data().n || 0,
        shotCount: sAgg.data().n || 0,
        comments: null,
        shots: null,
        expanded: false
      };
    }));
  }

  async function toggleAffected(item) {
    if (!bugOpen(item)) return;
    await ensureSignedIn();
    var f = fb.fs;
    var uid = fb.auth.currentUser.uid;
    var ref = f.doc(fb.db, 'bugs', item.id, 'affected', uid);
    if (item.mine) {
      await f.deleteDoc(ref);
      item.affected -= 1;
      item.mine = false;
    } else {
      await f.setDoc(ref, { createdAt: f.serverTimestamp() });
      item.affected += 1;
      item.mine = true;
    }
  }

  // Returns the slot numbers whose screenshot could not be attached. The report
  // itself is never rolled back — a partially illustrated report beats a lost one.
  async function submitBug(board, link, detail, shots) {
    await ensureSignedIn();
    var f = fb.fs;
    var uid = fb.auth.currentUser.uid;
    var ref = await f.addDoc(f.collection(fb.db, 'bugs'), {
      link: link,
      detail: detail,
      status: 'reported',
      createdBy: uid,
      createdAt: f.serverTimestamp()
    });
    var attached = [], failed = [];
    for (var i = 0; i < shots.length; i++) {
      try {
        // Slot ids must be '1'..'3': firestore.rules admits no others, which is
        // what enforces the cap without a counter.
        await f.setDoc(f.doc(fb.db, 'bugs', ref.id, 'shots', String(i + 1)),
          { data: shots[i], createdAt: f.serverTimestamp() });
        attached.push(shots[i]);
      } catch (e) {
        failed.push(i + 1);
      }
    }
    board.items.unshift({
      id: ref.id, link: link, detail: detail, status: 'reported',
      createdAt: Date.now(), author: pseudonym(uid),
      affected: 0, mine: false, commentCount: 0, shotCount: attached.length,
      comments: [], shots: attached, expanded: false
    });
    return failed;
  }

  async function loadShots(item) {
    var f = fb.fs;
    var snap = await f.getDocs(f.collection(fb.db, 'bugs', item.id, 'shots'));
    var bySlot = {};
    snap.docs.forEach(function (d) { bySlot[d.id] = String(d.data().data || ''); });
    item.shots = ['1', '2', '3'].map(function (slot) { return bySlot[slot]; })
      .filter(function (v) { return !!v && SHOT_URL.test(v); });
  }

  /* ---- screenshot preparation (client-side, before any write) ---- */

  function readImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  // Re-encoding through a canvas also strips EXIF (GPS, device, capture time),
  // which matters because this board is public.
  function encodeImage(img, edge, quality) {
    var scale = Math.min(1, edge / Math.max(img.width, img.height));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    var url = canvas.toDataURL('image/webp', quality);
    // Browsers that cannot encode WebP silently hand back a PNG, which is far
    // larger for a screenshot; fall back to JPEG rather than accepting that.
    if (url.indexOf('data:image/webp') !== 0) url = canvas.toDataURL('image/jpeg', quality);
    return url;
  }

  async function prepareShot(file) {
    if (SHOT_TYPES.indexOf(file.type) < 0) throw new Error('type');
    var img = await readImage(file);
    var attempts = [[SHOT_EDGE, 0.8], [SHOT_EDGE, 0.6], [1200, 0.6]];
    for (var i = 0; i < attempts.length; i++) {
      var url = encodeImage(img, attempts[i][0], attempts[i][1]);
      if (!SHOT_URL.test(url)) throw new Error('type');   // canvas produced something we will not store
      if (url.length <= SHOT_CHARS) return url;
    }
    throw new Error('size');
  }

  /* ---- shared thread rendering ---- */

  async function loadComments(board, item) {
    var f = fb.fs;
    var q = f.query(f.collection(fb.db, board.collection, item.id, 'comments'), f.orderBy('createdAt', 'asc'));
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

  async function submitComment(board, item, text) {
    await ensureSignedIn();
    var f = fb.fs;
    await f.addDoc(f.collection(fb.db, board.collection, item.id, 'comments'), {
      text: text,
      createdBy: fb.auth.currentUser.uid,
      createdAt: f.serverTimestamp()
    });
    if (item.comments) {
      item.comments.push({ author: pseudonym(fb.auth.currentUser.uid), text: text, at: Date.now() });
    }
    item.commentCount += 1;
  }

  function buildThread(board, item, open) {
    var thread = el('div', 'ff-thread');
    if (item.comments === null) {
      thread.appendChild(el('p', 'ff-notice', 'Loading discussion…'));
      return thread;
    }
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
    if (!open) {
      thread.appendChild(el('p', 'ff-notice', 'Discussion closed.'));
      return thread;
    }
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
      submitComment(board, item, text).then(function () { render(board); })
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
    return thread;
  }

  function toggleExpand(board, item) {
    item.expanded = !item.expanded;
    if (!item.expanded) { render(board); return; }
    var pending = [];
    if (item.comments === null) pending.push(loadComments(board, item).catch(function () { item.comments = []; }));
    if (board.kind === 'bug' && item.shots === null && item.shotCount > 0) {
      pending.push(loadShots(item).catch(function () { item.shots = []; }));
    } else if (board.kind === 'bug' && item.shots === null) {
      item.shots = [];
    }
    if (!pending.length) { render(board); return; }
    render(board);                                   // show the loading state first
    Promise.all(pending).then(function () { render(board); });
  }

  function sorted(board) {
    var copy = board.items.slice();
    if (board.kind === 'bug') {
      copy.sort(board.sortMode === 'affected'
        ? function (a, b) { return b.affected - a.affected || b.createdAt - a.createdAt; }
        : function (a, b) { return b.createdAt - a.createdAt; });
      return copy;
    }
    copy.sort(board.sortMode === 'top'
      ? function (a, b) { return b.score - a.score || b.createdAt - a.createdAt; }
      : function (a, b) { return b.createdAt - a.createdAt; });
    return copy;
  }

  function buildToolbar(board, label, modes) {
    var toolbar = el('div', 'ff-toolbar');
    toolbar.appendChild(el('span', null, plural(board.items.length, label)));
    var sortWrap = el('span');
    modes.forEach(function (pair, i) {
      if (i) sortWrap.appendChild(el('span', null, ' · '));
      var b = el('button', 'ff-sort' + (board.sortMode === pair[0] ? ' ff-sort-active' : ''), pair[1]);
      b.addEventListener('click', function () { board.sortMode = pair[0]; render(board); });
      sortWrap.appendChild(b);
    });
    toolbar.appendChild(sortWrap);
    return toolbar;
  }

  /* ---- feature-request rendering ---- */

  function renderRequests(board) {
    var mount = board.mount;
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
      submitRequest(board, title, detailInput.value.trim()).then(function () {
        render(board);
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

    mount.appendChild(buildToolbar(board, 'request', [['top', 'Top voted'], ['new', 'Newest']]));

    if (!board.items.length) {
      mount.appendChild(el('p', 'ff-notice', 'No requests yet — yours can be the first.'));
      return;
    }

    var list = el('div', 'ff-list');
    sorted(board).forEach(function (item) {
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
            castVote(item, pair[1]).then(function () { render(board); })
              .catch(function () {
                item.error = 'Could not save your vote — try again.';
                render(board);
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
      var meta = item.author
        + (open ? ' · closes in ' + closesInDays(item) + 'd' : '')
        + ' · ' + plural(item.commentCount, 'comment');
      body.appendChild(el('p', 'ff-meta', meta + (item.expanded ? ' ▾' : ' ▸')));
      if (item.error) {
        body.appendChild(el('p', 'ff-error', item.error));
        delete item.error;
      }
      body.addEventListener('click', function () { toggleExpand(board, item); });

      var chip = isAwaiting(item)
        ? el('span', 'ff-chip ff-chip-awaiting', 'Awaiting decision')
        : el('span', 'ff-chip ff-chip-' + item.status, STATUS_LABELS[item.status]);

      row.appendChild(votebox);
      row.appendChild(body);
      row.appendChild(chip);
      list.appendChild(row);

      if (item.expanded) list.appendChild(buildThread(board, item, open));
    });
    mount.appendChild(list);
  }

  /* ---- bug-report rendering ---- */

  function renderBugForm(board) {
    var draft = board.draft;
    var box = el('div', 'ff-submit');

    var linkInput = el('input', 'ff-input');
    linkInput.placeholder = 'Link to where it happened — paste the URL from your browser';
    linkInput.maxLength = LINK_MAX;
    linkInput.value = draft.link;
    linkInput.addEventListener('input', function () { draft.link = linkInput.value; });

    box.appendChild(linkInput);

    var detailInput = el('textarea', 'ff-textarea');
    detailInput.placeholder = 'What you did, what you expected, what happened instead.';
    detailInput.maxLength = BUG_DETAIL_MAX;
    detailInput.value = draft.detail;
    detailInput.addEventListener('input', function () { draft.detail = detailInput.value; });
    box.appendChild(detailInput);

    var errLine = el('p', 'ff-error');
    errLine.style.display = 'none';

    function fail(message) {
      errLine.textContent = message;
      errLine.style.display = '';
    }

    // Screenshot picker: thumbnails of what is staged, plus a control that
    // disappears once the three rules-enforced slots are spoken for.
    var pick = el('div', 'ff-shot-pick');
    draft.shots.forEach(function (dataUrl, index) {
      var wrap = el('span', 'ff-shot-thumb');
      var img = document.createElement('img');
      img.src = dataUrl;
      img.alt = 'Screenshot ' + (index + 1);
      wrap.appendChild(img);
      var drop = el('button', 'ff-shot-drop', '×');
      drop.title = 'Remove this screenshot';
      drop.addEventListener('click', function () {
        draft.shots.splice(index, 1);
        render(board);
      });
      wrap.appendChild(drop);
      pick.appendChild(wrap);
    });

    function stage(files) {
      var room = SHOT_MAX - draft.shots.length;
      var chosen = Array.prototype.slice.call(files, 0, room);
      if (!chosen.length) return;
      Promise.all(chosen.map(function (file) {
        return prepareShot(file).then(function (url) { return { url: url }; },
          function (e) { return { error: e.message, name: file.name }; });
      })).then(function (results) {
        var problems = [];
        results.forEach(function (r) {
          if (r.url) draft.shots.push(r.url);
          else if (r.error === 'type') problems.push('Only PNG, JPEG, and WebP screenshots can be attached.');
          else if (r.error === 'size') problems.push('That screenshot is too large even after compression — try cropping it.');
          else problems.push('That file could not be read as an image.');
        });
        render(board);
        if (problems.length) {
          var box2 = board.mount.querySelector('.ff-submit .ff-error');
          if (box2) { box2.textContent = problems[0]; box2.style.display = ''; }
        }
      });
    }

    if (draft.shots.length < SHOT_MAX) {
      var label = el('label', 'ff-shot-add', draft.shots.length ? 'Add another' : 'Attach a screenshot');
      var file = document.createElement('input');
      file.type = 'file';
      file.accept = SHOT_TYPES.join(',');
      file.multiple = true;
      file.addEventListener('change', function () {
        stage(file.files);
        file.value = '';
      });
      label.appendChild(file);
      pick.appendChild(label);
      pick.appendChild(el('span', 'ff-notice', ' or paste one — up to ' + SHOT_MAX + '.'));
    } else {
      pick.appendChild(el('span', 'ff-notice', 'All ' + SHOT_MAX + ' screenshot slots are used.'));
    }
    box.appendChild(pick);
    // Sits with the attach control rather than between the two text fields: this
    // is a caution about what you are about to upload, and splitting the form in
    // half to say it made the intake read as two disconnected steps.
    box.appendChild(el('p', 'ff-warn',
      'Reports and screenshots are public — check them for order data, customer names, ' +
      'email addresses, and tokens.'));

    // Cmd+Shift+4 then Cmd+V is how people actually take a screenshot.
    box.addEventListener('paste', function (event) {
      var items = event.clipboardData && event.clipboardData.items;
      if (!items) return;
      var files = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          var f = items[i].getAsFile();
          if (f) files.push(f);
        }
      }
      if (!files.length) return;
      event.preventDefault();
      stage(files);
    });

    box.appendChild(errLine);

    var actions = el('div', 'ff-actions');
    var button = el('button', 'ff-button', 'Report bug');
    button.addEventListener('click', function () {
      var link = draft.link.trim();
      var detail = draft.detail.trim();
      var parsed = null;
      try { parsed = new URL(link); } catch (e) { parsed = null; }
      if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || link.length < LINK_MIN) {
        fail('Paste the full URL of the page where it happened, starting with https://');
        return;
      }
      if (detail.length < BUG_DETAIL_MIN) {
        fail('Describe what happened in a little more detail — at least ' + BUG_DETAIL_MIN + ' characters.');
        return;
      }
      button.disabled = true;
      submitBug(board, link, detail, draft.shots.slice()).then(function (failedSlots) {
        board.draft = { link: '', detail: '', shots: [] };
        render(board);
        if (failedSlots.length) {
          var notice = board.mount.querySelector('.ff-submit .ff-error');
          if (notice) {
            notice.textContent = 'Your report was saved, but screenshot ' + failedSlots.join(', ') + ' could not be attached.';
            notice.style.display = '';
          }
        }
      }).catch(function () {
        fail('Could not submit right now — try again.');
        button.disabled = false;
      });
    });
    actions.appendChild(el('span', 'ff-notice', 'No account needed.'));
    actions.appendChild(button);
    box.appendChild(actions);
    return box;
  }

  function buildShotStrip(item) {
    var strip = el('div', 'ff-shots');
    if (item.shots === null) {
      strip.appendChild(el('p', 'ff-notice', 'Loading screenshots…'));
      return strip;
    }
    item.shots.forEach(function (dataUrl, index) {
      // Final gate at the sink itself, so the guarantee holds no matter which
      // path populated item.shots.
      if (!SHOT_URL.test(dataUrl)) return;
      var link = document.createElement('a');
      link.href = dataUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'ff-shot';
      var img = document.createElement('img');
      img.src = dataUrl;
      img.alt = 'Screenshot ' + (index + 1);
      img.loading = 'lazy';
      img.addEventListener('error', function () {
        link.replaceChildren(el('span', 'ff-notice', 'Screenshot could not be displayed'));
      });
      link.appendChild(img);
      strip.appendChild(link);
    });
    return strip;
  }

  function renderBugs(board) {
    var mount = board.mount;
    if (!board.draft) board.draft = { link: '', detail: '', shots: [] };
    mount.appendChild(renderBugForm(board));

    mount.appendChild(buildToolbar(board, 'report', [['affected', 'Most affected'], ['new', 'Newest']]));

    if (!board.items.length) {
      mount.appendChild(el('p', 'ff-notice', 'No bugs reported yet.'));
      return;
    }

    var list = el('div', 'ff-list');
    sorted(board).forEach(function (item) {
      var open = bugOpen(item);
      var row = el('div', 'ff-row');

      var affectBox = el('div', 'ff-votebox ff-affectbox');
      var affect = el('button', 'ff-affect' + (item.mine ? ' ff-affect-active' : ''),
        item.mine ? '✓ Me too' : 'Me too');
      affect.title = 'I hit this too';
      affect.disabled = !open;
      if (open) {
        affect.addEventListener('click', function () {
          toggleAffected(item).then(function () { render(board); })
            .catch(function () {
              item.error = 'Could not save that — try again.';
              render(board);
            });
        });
      }
      affectBox.appendChild(affect);
      affectBox.appendChild(el('span', 'ff-count', String(item.affected)));

      var body = el('div');
      body.style.flex = '1';
      body.style.cursor = 'pointer';
      body.appendChild(el('p', 'ff-title', headline(item.detail)));
      // Plain text, never an anchor: anonymous posting on a public page means an
      // auto-linked URL would make docs.drpn.ai a phishing-link host.
      body.appendChild(el('p', 'ff-link', item.link));
      var meta = item.author
        + ' · ' + item.affected + ' affected'
        + ' · ' + plural(item.commentCount, 'comment')
        + (item.shotCount ? ' · ' + plural(item.shotCount, 'screenshot') : '');
      body.appendChild(el('p', 'ff-meta', meta + (item.expanded ? ' ▾' : ' ▸')));
      if (item.error) {
        body.appendChild(el('p', 'ff-error', item.error));
        delete item.error;
      }
      body.addEventListener('click', function () { toggleExpand(board, item); });

      var chip = el('span', 'ff-chip ff-chip-' + item.status, BUG_STATUS_LABELS[item.status]);

      row.appendChild(affectBox);
      row.appendChild(body);
      row.appendChild(chip);
      list.appendChild(row);

      if (item.expanded) {
        var detail = el('div', 'ff-expand');
        detail.appendChild(el('p', 'ff-ctext', item.detail));
        if (item.shotCount) detail.appendChild(buildShotStrip(item));
        list.appendChild(detail);
        list.appendChild(buildThread(board, item, open));
      }
    });
    mount.appendChild(list);
  }

  /* ---- board plumbing ---- */

  function render(board) {
    var mount = board.mount;
    if (!mount) return;
    mount.replaceChildren();

    var noun = board.kind === 'bug' ? 'bug board' : 'request board';
    if (!isConfigured()) {
      mount.appendChild(el('p', 'ff-notice', 'The ' + noun + ' is warming up — check back soon.'));
      return;
    }
    if (board.items === null) {
      mount.appendChild(el('p', 'ff-notice', board.kind === 'bug' ? 'Loading reports…' : 'Loading requests…'));
      return;
    }
    if (board.kind === 'bug') renderBugs(board); else renderRequests(board);
  }

  async function boot(board, mount) {
    render(board);                     // configured? / loading state
    if (!isConfigured()) return;
    try {
      await loadSdk();
      if (board.kind === 'bug') await fetchBugs(board); else await fetchRequests(board);
    } catch (e) {
      console.error('[forum] boot failed:', e);
      mount.replaceChildren(el('p', 'ff-notice',
        'The ' + (board.kind === 'bug' ? 'bug board' : 'request board') +
        ' could not load. Refresh to try again.'));
      return;
    }
    if (mount === board.mount) render(board);
  }

  function watchForMounts() {
    function check() {
      BOARDS.forEach(function (board) {
        var mount = document.getElementById(board.id);
        if (mount && mount !== board.mount) {
          board.mount = mount;
          board.items = null;            // refetch on each page visit
          board.draft = null;
          boot(board, mount);
        }
      });
    }
    check();
    new MutationObserver(check).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchForMounts);
  } else {
    watchForMounts();
  }
})();
