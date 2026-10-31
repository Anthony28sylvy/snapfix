(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function el(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var kids = [].concat(arguments[i]);
      for (var j = 0; j < kids.length; j++) {
        var kid = kids[j];
        if (kid === null || kid === undefined || kid === false) continue;
        n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
      }
    }
    return n;
  }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function num(v) { var n = Number(v); return isFinite(n) && n >= 0 ? n : 0; }
  function str(v, d) { return typeof v === 'string' && v.trim() ? v.trim() : (d || ''); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function enc(s) { return encodeURIComponent(s); }

  var RETAIL = [
    ['Home Depot', function (q) { return 'https://www.homedepot.com/s/' + enc(q); }],
    ["Lowe's", function (q) { return 'https://www.lowes.com/search?searchTerm=' + enc(q); }],
    ['Ace', function (q) { return 'https://www.acehardware.com/search?query=' + enc(q); }],
    ['Amazon', function (q) { return 'https://www.amazon.com/s?k=' + enc(q); }]
  ];

  function normalize(r) {
    r = r && typeof r === 'object' ? r : {};
    var conf = str(r.confidence).toLowerCase();
    var cost = r.proCost && typeof r.proCost === 'object' ? r.proCost : {};
    function items(list, withQty) {
      return arr(list).slice(0, 14).map(function (t) {
        t = t && typeof t === 'object' ? t : {};
        var o = { name: str(t.name), price: num(t.price), search: str(t.search) || str(t.name) };
        if (withQty) { o.spec = str(t.spec); o.qty = t.qty === undefined || t.qty === null ? '' : String(t.qty).slice(0, 30); }
        else { o.why = str(t.why); }
        return o;
      }).filter(function (t) { return t.name; });
    }
    return {
      needsBetterPhoto: str(r.needsBetterPhoto) || null,
      problem: str(r.problem, 'Repair needed'),
      summary: str(r.summary),
      confidence: ['high', 'medium', 'low'].indexOf(conf) >= 0 ? conf : 'medium',
      difficulty: str(r.difficulty, 'Intermediate'),
      timeEstimate: str(r.timeEstimate, 'Unknown'),
      needsPro: r.needsPro === true,
      needsProReason: str(r.needsProReason) || null,
      proType: str(r.proType, 'handyman'),
      proCost: { low: num(cost.low), high: num(cost.high) },
      safety: arr(r.safety).map(function (s) { return str(s); }).filter(Boolean).slice(0, 5),
      stopAndCallPro: arr(r.stopAndCallPro).map(function (s) { return str(s); }).filter(Boolean).slice(0, 4),
      tools: items(r.tools, false),
      materials: items(r.materials, true),
      steps: arr(r.steps).slice(0, 14).map(function (s) {
        s = s && typeof s === 'object' ? s : {};
        return { title: str(s.title, 'Step'), detail: str(s.detail), tip: str(s.tip) || null };
      }),
      videoSearches: arr(r.videoSearches).map(function (s) { return str(s); }).filter(Boolean).slice(0, 4),
      proBasis: str(r.proBasis),
      quoteRequest: str(r.quoteRequest)
    };
  }
  function ytUrl(q) { return 'https://www.youtube.com/results?search_query=' + enc(q); }

  /* The upload page saves the finished job in this browser, then opens this page. */
  function loadJob() {
    var raw = null;
    try { raw = sessionStorage.getItem('snapfix-job'); } catch (e) { raw = null; }
    if (!raw) { try { raw = localStorage.getItem('snapfix-job'); } catch (e) { raw = null; } }
    if (!raw) return null;
    try {
      var j = JSON.parse(raw);
      return j && typeof j === 'object' && j.result && typeof j.result === 'object' ? j : null;
    } catch (e) { return null; }
  }
  var job = loadJob();
  if (!job) { location.replace('/'); return; }

  var current = normalize(job.result);
  var isExample = false;
  var owned = new Set();
  var activeTab = 'steps';
  var quotes = loadQuotes();

  function loadQuotes() {
    try {
      var v = JSON.parse(localStorage.getItem('snapfix-quotes') || '[]');
      return Array.isArray(v) ? v.filter(function (q) { return q && typeof q.name === 'string' && isFinite(q.amount); }) : [];
    } catch (e) { return []; }
  }
  function saveQuotes() { try { localStorage.setItem('snapfix-quotes', JSON.stringify(quotes)); } catch (e) { /* storage unavailable */ } }

  function diyTotal() {
    var t = 0;
    current.tools.forEach(function (it, i) { if (!owned.has('t' + i)) t += it.price; });
    current.materials.forEach(function (it, i) { if (!owned.has('m' + i)) t += it.price; });
    return t;
  }
  function updateTotals() {
    document.querySelectorAll('[data-diy]').forEach(function (n) { n.textContent = money(diyTotal()); });
    renderQuoteLog();
  }

  function flash(btn, text) {
    var old = btn.dataset.label || btn.textContent;
    btn.dataset.label = old;
    btn.textContent = text;
    setTimeout(function () { btn.textContent = old; }, 1600);
  }
  async function copyText(text, node, btn) {
    try { await navigator.clipboard.writeText(text); flash(btn, 'Copied'); }
    catch (e) {
      var r = document.createRange(); r.selectNodeContents(node);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      flash(btn, 'Selected. Press copy.');
    }
  }

  function chip(text, cls) { return el('span', { class: 'chip' + (cls ? ' ' + cls : ''), text: text }); }
  function stat(k, v, diy) {
    var val = el('div', { class: 'v', text: v });
    if (diy) val.setAttribute('data-diy', '');
    return el('div', { class: 'stat' }, el('div', { class: 'k', text: k }), val);
  }

  /* Results */
  function renderResults() {
    var box = $('#results');
    box.textContent = '';
    box.append(jobBar());
    var d = current;

    if (isExample) {
      box.append(el('div', { class: 'banner' }, el('b', { text: 'Example result. ' }), 'Add your own photo and press Diagnose to replace it.'));
    }
    if (d.needsBetterPhoto) {
      box.append(el('div', { class: 'notice' }, el('h3', { text: 'Need a clearer look' }), el('p', { text: d.needsBetterPhoto })));
      return;
    }

    var chips = el('div', { class: 'chips' },
      chip('Confidence: ' + d.confidence, d.confidence === 'high' ? 'good' : (d.confidence === 'low' ? 'warn' : '')),
      d.needsPro ? chip('Pro recommended', 'warn') : chip('DIY friendly', 'good')
    );
    box.append(el('header', { class: 'diag' }, chips, el('h2', { text: d.problem }), el('p', { class: 'lede', text: d.summary })));

    var pr = d.proCost;
    box.append(el('div', { class: 'stats' },
      stat('DIY cost, est.', money(diyTotal()), true),
      stat('Pro cost, est.', pr.high > 0 ? money(pr.low) + '–' + money(pr.high) : 'Unknown'),
      stat('Time', d.timeEstimate),
      stat('Difficulty', d.difficulty)
    ));

    if (d.needsPro) {
      box.append(el('div', { class: 'danger' }, el('h3', { text: 'A pro is the safer choice' }), el('p', { text: d.needsProReason || 'This repair carries enough risk that a licensed pro is the better call.' })));
    }
    if (d.safety.length || d.stopAndCallPro.length) {
      var s = el('div', { class: 'safety' });
      if (d.safety.length) s.append(el('div', null, el('h3', { text: 'Before you start' }), el('ul', null, d.safety.map(function (t) { return el('li', { text: t }); }))));
      if (d.stopAndCallPro.length) s.append(el('div', null, el('h3', { text: 'Stop and call a pro if' }), el('ul', null, d.stopAndCallPro.map(function (t) { return el('li', { text: t }); }))));
      box.append(s);
    }

    var tabDefs = [
      ['steps', 'Repair steps', d.steps.length],
      ['shop', 'Shopping list', d.tools.length + d.materials.length],
      ['videos', 'How-to videos', null],
      ['pros', 'Pro quotes', null]
    ];
    var tabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Repair plan sections' });
    var panels = {};
    tabDefs.forEach(function (t) {
      var b = el('button', { class: 'tab', role: 'tab', id: 'tab-' + t[0], 'aria-controls': 'panel-' + t[0], 'aria-selected': String(activeTab === t[0]), type: 'button' },
        t[1], t[2] !== null ? el('span', { class: 'count', text: String(t[2]) }) : null);
      b.addEventListener('click', function () { selectTab(t[0]); });
      tabs.append(b);
    });
    function selectTab(id) {
      activeTab = id;
      tabs.querySelectorAll('.tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.id === 'tab-' + id)); });
      Object.keys(panels).forEach(function (k) { panels[k].hidden = k !== id; });
    }
    panels.steps = buildSteps(d);
    panels.shop = buildShop(d);
    panels.videos = buildVideos(d);
    panels.pros = buildPros(d);
    box.append(tabs);
    Object.keys(panels).forEach(function (k) { box.append(panels[k]); });
    selectTab(activeTab);
    renderQuoteLog();
  }

  function buildSteps(d) {
    var panel = el('div', { class: 'panel', role: 'tabpanel', id: 'panel-steps', 'aria-labelledby': 'tab-steps' });
    var prog = el('p', { class: 'progress', text: '0 of ' + d.steps.length + ' steps done' });
    var ol = el('ol', { class: 'steps' });
    var done = 0;
    d.steps.forEach(function (s, i) {
      var cb = el('input', { type: 'checkbox', id: 'step-' + i });
      var li = el('li', null,
        el('div', { class: 'n', text: String(i + 1), 'aria-hidden': 'true' }),
        el('div', { class: 'body' },
          el('h3', { class: 'st-title', text: s.title }),
          el('p', { text: s.detail }),
          s.tip ? el('p', { class: 'tip' }, el('b', { text: 'Tip ' }), s.tip) : null,
          el('p', { class: 'tip' }, el('a', { href: ytUrl(d.problem + ' ' + s.title), target: '_blank', rel: 'noopener noreferrer', text: 'Watch this step on YouTube' }))),
        el('label', { class: 'done-box', for: 'step-' + i }, cb, 'Done'));
      cb.addEventListener('change', function () {
        li.classList.toggle('done', cb.checked);
        done += cb.checked ? 1 : -1;
        prog.textContent = done + ' of ' + d.steps.length + ' steps done';
      });
      ol.append(li);
    });
    panel.append(prog, ol);
    return panel;
  }

  function itemRow(kind, i, it) {
    var key = kind + i;
    var id = 'own-' + key;
    var cb = el('input', { type: 'checkbox', id: id });
    if (owned.has(key)) cb.checked = true;
    var sub = kind === 't' ? it.why : [it.spec, it.qty ? 'Qty: ' + it.qty : ''].filter(Boolean).join(' · ');
    var links = el('span', { class: 'links-inline', style: 'display:contents' },
      el('span', { class: 'muted', text: 'Find:' }),
      RETAIL.map(function (r) { return el('a', { href: r[1](it.search), target: '_blank', rel: 'noopener noreferrer', text: r[0] }); }));
    var row = el('div', { class: 'item' + (owned.has(key) ? ' have' : '') },
      el('div', { class: 'name', text: it.name }),
      el('div', { class: 'price', text: it.price ? money(it.price) : '–' }),
      sub ? el('div', { class: 'sub', text: sub }) : null,
      el('div', { class: 'meta' }, links, el('label', { class: 'own', for: id }, cb, 'I have this')));
    cb.addEventListener('change', function () {
      if (cb.checked) owned.add(key); else owned.delete(key);
      row.classList.toggle('have', cb.checked);
      updateTotals();
    });
    return row;
  }

  function buildShop(d) {
    var panel = el('div', { class: 'panel', role: 'tabpanel', id: 'panel-shop', 'aria-labelledby': 'tab-shop' });
    if (d.tools.length) panel.append(el('h3', { text: 'Tools' }), el('div', { class: 'items' }, d.tools.map(function (it, i) { return itemRow('t', i, it); })));
    if (d.materials.length) panel.append(el('h3', { text: 'Parts and materials' }), el('div', { class: 'items' }, d.materials.map(function (it, i) { return itemRow('m', i, it); })));
    panel.append(el('div', { class: 'total' }, el('span', { text: 'Estimated total for what you still need' }), el('span', { class: 'num', 'data-diy': '', text: money(diyTotal()) })));
    panel.append(el('p', { class: 'fine', text: 'Prices are rough US retail estimates. Links open a search at each store, so check stock and price there. Tick "I have this" to remove an item from the total.' }));
    return panel;
  }

  function buildVideos(d) {
    var panel = el('div', { class: 'panel', role: 'tabpanel', id: 'panel-videos', 'aria-labelledby': 'tab-videos' });
    var queries = d.videoSearches.length ? d.videoSearches : [d.problem + ' how to fix'];
    panel.append(el('h3', { text: 'Watch it done first' }));
    panel.append(el('p', { class: 'muted', text: 'Each link opens a YouTube search for this exact repair in a new tab. Pick a video that matches your fixture, and pause before each step.' }));
    panel.append(el('div', { class: 'items' }, queries.map(function (q) {
      return el('div', { class: 'item' },
        el('div', { class: 'name', text: q }),
        el('div', { class: 'meta' }, el('a', { href: ytUrl(q), target: '_blank', rel: 'noopener noreferrer', text: 'Search YouTube' }), el('a', { href: ytUrl(q + ' beginner'), target: '_blank', rel: 'noopener noreferrer', text: 'Beginner videos' })));
    })));
    panel.append(el('p', { class: 'fine', text: 'Snapfix cannot play videos inside this page or check which ones are good. Look for recent uploads that show your exact brand or model, and cross-check the steps here.' }));
    return panel;
  }

  function buildPros(d) {
    var panel = el('div', { class: 'panel', role: 'tabpanel', id: 'panel-pros', 'aria-labelledby': 'tab-pros' });
    var pr = d.proCost;
    panel.append(el('div', { class: 'compare' },
      el('div', { class: 'card' }, el('div', { class: 'label-h', text: 'Typical ' + d.proType + ' price, est.' }), el('div', { class: 'big', text: pr.high > 0 ? money(pr.low) + '–' + money(pr.high) : 'Unknown' }), el('p', { class: 'fine', text: (d.proBasis ? d.proBasis + ' ' : 'An AI estimate of parts and labor. ') + 'It is not a quote.' })),
      el('div', { class: 'card hl' }, el('div', { class: 'label-h', text: 'Doing it yourself, est.' }), el('div', { class: 'big', 'data-diy': '', text: money(diyTotal()) }), el('p', { class: 'fine', text: 'Tools and parts you still need.' }))
    ));

    var zip = (job.zip || '').trim();
    var where = zip ? ' near ' + zip : ' near me';
    var q = d.proType + where;
    panel.append(el('h3', { text: 'Find pros' }));
    panel.append(el('div', { class: 'card' },
      el('p', { class: 'label-h', text: 'Local and independent' }),
      el('div', { class: 'links', style: 'margin-top:8px' },
        el('a', { href: 'https://www.google.com/maps/search/' + enc(q), target: '_blank', rel: 'noopener noreferrer', text: 'Google Maps' }),
        el('a', { href: 'https://www.yelp.com/search?find_desc=' + enc(d.proType) + '&find_loc=' + enc(zip || 'current location'), target: '_blank', rel: 'noopener noreferrer', text: 'Yelp' })),
      el('p', { class: 'label-h', style: 'margin-top:14px', text: 'Larger platforms' }),
      el('div', { class: 'links', style: 'margin-top:8px' },
        el('a', { href: 'https://www.angi.com/', target: '_blank', rel: 'noopener noreferrer', text: 'Angi' }),
        el('a', { href: 'https://www.thumbtack.com/', target: '_blank', rel: 'noopener noreferrer', text: 'Thumbtack' })),
      el('p', { class: 'fine', style: 'margin-top:12px', text: 'Snapfix cannot pull live bids from these sites yet. Send each one the same request below, then log what comes back.' })
    ));

    if (d.quoteRequest) {
      var text = d.quoteRequest + (zip ? '\nLocation: ' + zip : '');
      var pre = el('div', { class: 'request', id: 'request-text', text: text });
      var cbtn = el('button', { class: 'btn small', type: 'button', text: 'Copy request' });
      cbtn.addEventListener('click', function () { copyText(text, pre, cbtn); });
      panel.append(el('h3', { text: 'Ask for a quote' }), pre, el('div', null, cbtn));
    }

    panel.append(el('h3', { text: 'Compare the quotes you get' }));
    var name = el('input', { id: 'q-name', placeholder: 'Company name', maxlength: '60' });
    var kind = el('select', { id: 'q-kind' }, el('option', { value: 'Local', text: 'Local' }), el('option', { value: 'National', text: 'National' }));
    var amt = el('input', { id: 'q-amt', type: 'number', min: '0', step: '1', inputmode: 'decimal', placeholder: 'Quote $' });
    var add = el('button', { class: 'btn small', type: 'button', text: 'Add quote' });
    add.addEventListener('click', function () {
      var a = Number(amt.value);
      if (!name.value.trim() || !isFinite(a) || a <= 0) { name.focus(); return; }
      quotes.push({ name: name.value.trim().slice(0, 60), kind: kind.value, amount: a });
      saveQuotes();
      name.value = ''; amt.value = '';
      renderQuoteLog();
    });
    panel.append(el('div', { class: 'qform' },
      el('div', { class: 'field' }, el('label', { for: 'q-name', text: 'Company' }), name),
      el('div', { class: 'field' }, el('label', { for: 'q-kind', text: 'Type' }), kind),
      el('div', { class: 'field' }, el('label', { for: 'q-amt', text: 'Amount' }), amt),
      add));
    panel.append(el('div', { id: 'quote-log', class: 'items' }));
    panel.append(el('p', { class: 'fine', text: 'Quotes you log stay in this browser only.' }));
    return panel;
  }

  function renderQuoteLog() {
    var host = $('#quote-log');
    if (!host) return;
    host.textContent = '';
    if (!quotes.length) {
      host.append(el('p', { class: 'muted', text: 'No quotes yet. Add each estimate you receive and Snapfix will flag the lowest and show how it compares with doing the job yourself.' }));
      return;
    }
    var min = Math.min.apply(null, quotes.map(function (q) { return q.amount; }));
    var diy = diyTotal();
    quotes.forEach(function (q, i) {
      var diff = q.amount - diy;
      var note = diy > 0
        ? (diff >= 0 ? money(diff) + ' more than doing it yourself' : money(-diff) + ' less than doing it yourself')
        : '';
      var rm = el('button', { class: 'btn ghost small', type: 'button', text: 'Remove', 'aria-label': 'Remove quote from ' + q.name });
      rm.addEventListener('click', function () { quotes.splice(i, 1); saveQuotes(); renderQuoteLog(); });
      host.append(el('div', { class: 'qrow' + (q.amount === min && quotes.length > 1 ? ' low' : '') },
        el('div', null, el('b', { text: q.name }), ' ', chip(q.kind, q.amount === min && quotes.length > 1 ? 'good' : ''), q.amount === min && quotes.length > 1 ? chip('Lowest', 'good') : null),
        el('div', { class: 'amt', text: money(q.amount) }), rm,
        note ? el('div', { class: 'note', text: note }) : null));
    });
  }


  function jobBar() {
    var thumb = typeof job.thumb === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(job.thumb)
      ? el('img', { class: 'thumb', src: job.thumb, alt: 'Your photo' }) : null;
    var when = job.at ? new Date(job.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
    var notes = typeof job.notes === 'string' ? job.notes : '';
    return el('div', { class: 'jobbar' },
      thumb,
      el('div', { class: 'jobtext' },
        el('div', { class: 'label-h', text: 'Your job' }),
        el('div', { text: notes || 'Diagnosed from your photo' }),
        el('div', { class: 'fine', text: [job.zip ? 'ZIP ' + job.zip : '', when].filter(Boolean).join(' · ') })),
      el('a', { class: 'btn small', href: '/', text: 'New job' }));
  }

  renderResults();
})();
