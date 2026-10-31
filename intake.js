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

  var photo = null, photoUrl = null;
  var imageLimits = { mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], maxInputBytes: 25 * 1024 * 1024 };
  var busy = false, ctl = null, progressTimer = null;
  try { sessionStorage.removeItem('snapfix-job'); } catch (e) { /* ignore */ }

  /* Intake */
  function setStatus(text, isErr) {
    var s = $('#status');
    s.textContent = text || '';
    s.classList.toggle('err', !!isErr);
  }
  function setPhoto(f) {
    if (!f) return;
    if (!/^image\//.test(f.type)) { setStatus('Choose an image file.', true); return; }
    if (imageLimits && imageLimits.mediaTypes && imageLimits.mediaTypes.indexOf(f.type) < 0) { setStatus('Use a JPEG, PNG, WebP or GIF photo.', true); return; }
    if (imageLimits && f.size > imageLimits.maxInputBytes) { setStatus('That photo is too large. Try a smaller one.', true); return; }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photo = f;
    photoUrl = URL.createObjectURL(f);
    var img = $('#preview');
    img.src = photoUrl; img.hidden = false;
    $('#drop').classList.add('has-photo');
    $('#remove-photo').hidden = false;
    setStatus('');
  }
  function clearPhoto() {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photo = null; photoUrl = null;
    var img = $('#preview');
    img.removeAttribute('src'); img.hidden = true;
    $('#drop').classList.remove('has-photo');
    $('#remove-photo').hidden = true;
    $('#photo').value = '';
  }
  $('#photo').addEventListener('change', function (e) { setPhoto(e.target.files && e.target.files[0]); });
  $('#remove-photo').addEventListener('click', clearPhoto);
  var drop = $('#drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) setPhoto(f); });

  var PROGRESS = ['Looking at your photo', 'Working out the cause', 'Writing the repair steps', 'Pricing tools and parts', 'Almost done'];
  function startProgress() {
    var i = 0;
    setStatus(PROGRESS[0] + '…');
    progressTimer = setInterval(function () { i = Math.min(i + 1, PROGRESS.length - 1); setStatus(PROGRESS[i] + '…'); }, 6000);
  }
  function stopProgress() { clearInterval(progressTimer); progressTimer = null; }
  function setBusy(b) {
    busy = b;
    $('#go').disabled = b;
    $('#stop').hidden = !b;
    $('#bar').hidden = !b;
  }

  var ERRORS = {
    not_granted: 'Snapfix needs your permission to use Claude. Reload the page and allow it when asked.',
    rate_limited: 'Too many requests right now. Wait a minute, then try again.',
    session_expired: 'Your session expired. Sign in again, then retry.',
    sampling_disabled: 'Claude is not available for this account.',
    image_rejected: 'That photo could not be read. Try another one.',
    images_unavailable: 'Photo analysis is not available in this view. Describe the problem in words instead.',
    refused: 'Claude could not help with that photo. Try a different one or describe the problem.',
    empty_completion: 'No answer came back. Try again with a clearer photo or more detail.',
    invalid_json: 'The answer came back garbled. Press Diagnose to try again.',
    prompt_too_large: 'That description is too long. Shorten it and try again.',
    daily_limit: 'Snapfix has reached its limit for today. Please try again tomorrow.',
    busy: 'Claude is busy right now. Wait a minute and try again.',
    image_too_large: 'That photo is too large. Try a smaller one.',
    bad_request: 'Add a photo or describe the problem, then try again.',
    not_configured: 'This site is not set up yet. The owner needs to add an API key.',
    parse_error: 'The answer came back garbled. Press Diagnose to try again.',
    upstream_error: 'Something went wrong on our side. Press Diagnose to try again.'
  };

  function resizeImage(file, maxSide) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, maxSide / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * scale));
        c.height = Math.max(1, Math.round(h * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { if (b) resolve(b); else reject({ code: 'image_rejected' }); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject({ code: 'image_rejected' }); };
      img.src = url;
    });
  }
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1] || ''); };
      fr.onerror = function () { reject({ code: 'image_rejected' }); };
      fr.readAsDataURL(blob);
    });
  }

  function makeThumb(blob) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        try {
          var s = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.naturalWidth * s));
          c.height = Math.max(1, Math.round(img.naturalHeight * s));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.7));
        } catch (e) { resolve(''); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(''); };
      img.src = url;
    });
  }
  function saveJob(job) {
    var text = JSON.stringify(job);
    try { sessionStorage.setItem('snapfix-job', text); } catch (e) { /* ignore */ }
    try { localStorage.setItem('snapfix-job', text); } catch (e) { /* ignore */ }
  }

  async function diagnose() {
    if (busy) return;
    var notes = $('#notes').value.trim();
    if (!photo && !notes) { setStatus('Add a photo or describe the problem first.', true); return; }
    var body = { notes: notes, zip: $('#zip').value.trim(), skill: $('#skill').value };
    ctl = new AbortController();
    setBusy(true);
    startProgress();
    var thumb = '';
    try {
      if (photo) {
        var small = await resizeImage(photo, 1600);
        body.image = await blobToBase64(small);
        body.mediaType = 'image/jpeg';
        thumb = await makeThumb(small);
      }
      var res = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctl.signal
      });
      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok || !data || !data.result) {
        throw { code: (data && data.error && data.error.code) || (res.status === 429 ? 'rate_limited' : 'upstream_error') };
      }
      saveJob({ result: data.result, notes: notes, zip: body.zip, skill: body.skill, thumb: thumb, at: Date.now() });
      setStatus('Done. Opening your plan\u2026');
      location.assign('/results');
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') setStatus('Stopped.');
      else setStatus((e && ERRORS[e.code]) || 'Something went wrong. Press Diagnose to try again.', true);
    }
    stopProgress();
    setBusy(false);
    ctl = null;
  }
  $('#go').addEventListener('click', diagnose);
  $('#stop').addEventListener('click', function () { if (ctl) ctl.abort(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) { stopProgress(); setBusy(false); setStatus(''); } });
})();
