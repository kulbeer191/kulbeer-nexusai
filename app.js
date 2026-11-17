// NexusAI by Kulbeer — Google-style AI search engine (vanilla JS, no framework)
// Features: relevance-ranked live search, autocomplete suggestions, trending
// pills, 9 category tabs, live result counter.
(function(){
  var searchInput = document.getElementById('toolSearch');
  var grid = document.getElementById('toolGrid');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.tool-card'));
  var pills = Array.prototype.slice.call(document.querySelectorAll('.pill'));
  var trendPills = Array.prototype.slice.call(document.querySelectorAll('.trend-pill'));
  var emptyMsg = document.getElementById('noResults');
  var counter = document.getElementById('resultCount');
  var ac = document.getElementById('autocomplete');
  var goBtn = document.getElementById('searchGo');
  var activeCat = 'all';
  var total = cards.length;
  var acIndex = -1;
  var hideTimer = null;

  var CAT_LABEL = {all:'All', agents:'Autonomous Agents', chat:'Chat & Writing',
    code:'Code & Dev', image:'Image Generation', video:'Video & Animation',
    voice:'Voice & Audio', marketing:'Marketing & SEO', productivity:'Productivity'};

  // Per-card metadata, read once from the DOM.
  var meta = cards.map(function(card, i){
    var h3 = card.querySelector('h3');
    var tag = card.querySelector('.tag');
    var ps = card.querySelectorAll('p');
    var link = card.querySelector('.actions a');
    return {
      card: card, index: i,
      title: h3 ? h3.textContent.trim() : '',
      tag: tag ? tag.textContent.trim() : '',
      desc: ps.length ? ps[0].textContent.trim() : '',
      price: (function(){ var pr = card.querySelector('.price'); return pr ? pr.textContent.trim() : ''; })(),
      href: link ? link.getAttribute('href') : '',
      cat: card.getAttribute('data-category') || ''
    };
  });

  function wordsOf(q){ return q.split(/\s+/).filter(function(w){ return w.length > 0; }); }

  // Relevance score: exact title match first, then title words, then
  // category/tag, then price (e.g. "free"), then description.
  function score(m, q, words){
    var title = m.title.toLowerCase(), tag = m.tag.toLowerCase(),
        price = m.price.toLowerCase(), desc = m.desc.toLowerCase();
    var s = 0;
    if (title === q) s += 300;
    else if (title.indexOf(q) !== -1) s += 150;
    if (title.indexOf(q) === 0 && q.length > 0) s += 50;
    words.forEach(function(w){
      if (title.indexOf(w) !== -1) s += 100;
      else if (tag.indexOf(w) !== -1) s += 60;
      else if (price.indexOf(w) !== -1) s += 40;
      else if (desc.indexOf(w) !== -1) s += 20;
    });
    return s;
  }

  function setCounter(n, q){
    if (!counter) return;
    var label = CAT_LABEL[activeCat] || activeCat;
    if (q && activeCat !== 'all') counter.textContent = "Showing " + n + " AI tools for '" + q + "' in " + label;
    else if (q) counter.textContent = "Showing " + n + " AI tools for '" + q + "'";
    else if (activeCat !== 'all') counter.textContent = "Showing " + n + " AI tools in " + label;
    else counter.textContent = "Showing " + n + " AI tools";
  }

  function apply(){
    var q = searchInput ? searchInput.value.trim().toLowerCase() : '';
    var words = wordsOf(q);
    var visible = [];
    meta.forEach(function(m){
      var okC = activeCat === 'all' || m.cat === activeCat;
      var s = q ? score(m, q, words) : 1;
      m.score = s;
      if (okC && s > 0) visible.push(m);
    });
    // Rank: highest relevance first; original order breaks ties.
    visible.sort(function(a, b){ return (b.score - a.score) || (a.index - b.index); });
    var shown = {};
    visible.forEach(function(m){ shown[m.index] = true; });
    meta.forEach(function(m){
      m.card.style.display = shown[m.index] ? '' : 'none';
    });
    // Reorder the grid so ranked results appear in rank order.
    visible.forEach(function(m){ grid.appendChild(m.card); });
    var n = visible.length;
    setCounter(n, q);
    if (emptyMsg) {
      emptyMsg.style.display = n === 0 ? 'block' : 'none';
      if (n === 0 && q) emptyMsg.textContent = "No tools match '" + q + "'. Try a different keyword, or browse All tools.";
    }
    return n;
  }

  // ---- Autocomplete ----
  function hideAc(){ if (ac) ac.hidden = true; acIndex = -1; }
  function showAc(){
    if (!ac || !searchInput) return;
    var q = searchInput.value.trim().toLowerCase();
    if (q.length < 1) { hideAc(); return; }
    var words = wordsOf(q);
    var sugg = meta.filter(function(m){ return score(m, q, words) > 0; })
      .sort(function(a, b){ return (score(b, q, words) - score(a, q, words)) || (a.index - b.index); })
      .slice(0, 6);
    if (!sugg.length) { hideAc(); return; }
    var html = sugg.map(function(m){
      return '<button type="button" class="ac-item" data-href="' + m.href + '">' +
        m.title + ' <small>' + (CAT_LABEL[m.cat] || m.cat) + '</small></button>';
    }).join('');
    html += '<button type="button" class="ac-item ac-search" data-search="1">Search for &ldquo;' + q + '&rdquo; &rarr;</button>';
    ac.innerHTML = html;
    ac.hidden = false;
    acIndex = -1;
    Array.prototype.slice.call(ac.querySelectorAll('.ac-item')).forEach(function(item){
      item.addEventListener('mousedown', function(e){
        e.preventDefault();
        var href = item.getAttribute('data-href');
        if (href) window.location.href = href;
        else hideAc();
      });
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', function(){ apply(); showAc(); });
    searchInput.addEventListener('focus', showAc);
    searchInput.addEventListener('blur', function(){ hideTimer = setTimeout(hideAc, 150); });
    searchInput.addEventListener('keydown', function(e){
      if (!ac || ac.hidden) return;
      var items = ac.querySelectorAll('.ac-item');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        acIndex = e.key === 'ArrowDown' ? Math.min(acIndex + 1, items.length - 1) : Math.max(acIndex - 1, 0);
        for (var i = 0; i < items.length; i++) items[i].classList.toggle('active', i === acIndex);
      } else if (e.key === 'Enter' && acIndex >= 0 && items[acIndex]) {
        e.preventDefault();
        items[acIndex].dispatchEvent(new MouseEvent('mousedown'));
      } else if (e.key === 'Escape') { hideAc(); }
    });
  }
  if (goBtn) goBtn.addEventListener('click', function(){
    hideAc(); apply();
    if (grid) grid.scrollIntoView({behavior:'smooth', block:'start'});
  });

  // ---- Category tabs ----
  function setActivePill(p){
    pills.forEach(function(x){ x.classList.remove('active'); });
    if (p) p.classList.add('active');
  }
  pills.forEach(function(p){
    p.addEventListener('click', function(){
      activeCat = p.getAttribute('data-filter') || 'all';
      setActivePill(p);
      apply();
    });
  });

  // ---- Trending pills ----
  trendPills.forEach(function(p){
    p.addEventListener('click', function(){
      var f = p.getAttribute('data-filter');
      var q = p.getAttribute('data-query');
      if (f) {
        activeCat = f;
        if (searchInput) searchInput.value = '';
        pills.forEach(function(x){ x.classList.toggle('active', (x.getAttribute('data-filter') || '') === f); });
      } else if (q) {
        activeCat = 'all';
        if (searchInput) searchInput.value = q;
        setActivePill(pills[0]);
      }
      hideAc();
      apply();
      if (grid) grid.scrollIntoView({behavior:'smooth', block:'start'});
    });
  });

  apply();
})();

/* ---- Side-by-Side Live Tool Comparator ---- */
(function(){
  var MAX = 3;
  var selected = []; /* card elements, in the order the user picked them */
  var bar = document.getElementById('compareBar');
  var namesEl = document.getElementById('compareSelected');
  var nowBtn = document.getElementById('compareNow');
  var clearBtn = document.getElementById('compareClear');
  var modal = document.getElementById('compareModal');
  var modalBody = document.getElementById('compareModalBody');
  var closeBtn = document.getElementById('compareClose');
  var toast = document.getElementById('compareToast');
  var toastTimer = null;
  if (!bar || !nowBtn || !modal) return;

  function esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function cardMeta(card){
    var h3 = card.querySelector('h3');
    var tag = card.querySelector('.tag');
    var desc = card.querySelector('p:not(.price)');
    var price = card.querySelector('.price');
    var links = card.querySelectorAll('.actions a');
    return {
      name: h3 ? h3.textContent.trim() : '',
      category: tag ? tag.textContent.trim() : '',
      desc: desc ? desc.textContent.trim() : '',
      price: price ? price.textContent.trim() : '',
      strengths: (card.getAttribute('data-strengths') || '').split(' • ').filter(function(s){ return s.trim(); }),
      review: links[0] ? links[0].getAttribute('href') : 'index.html',
      official: links[1] ? links[1].getAttribute('href') : null
    };
  }

  function showToast(msg){
    toast.textContent = msg;
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toast.hidden = true; }, 3200);
  }

  function renderBar(){
    if (selected.length === 0) {
      namesEl.innerHTML = '';
      nowBtn.textContent = 'Compare Now (0/' + MAX + ')';
      nowBtn.disabled = true;
      bar.hidden = true;
      document.body.classList.remove('compare-bar-visible');
      return;
    }
    bar.hidden = false;
    document.body.classList.add('compare-bar-visible');
    namesEl.innerHTML = selected.map(function(c){
      return '<span class="compare-chip">' + esc(cardMeta(c).name) + '</span>';
    }).join('');
    nowBtn.textContent = 'Compare Now (' + selected.length + '/' + MAX + ')';
    nowBtn.disabled = selected.length < 2;
  }

  function setToggle(card, btn, on){
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? '✓ Added — remove' : '+ Compare';
  }

  function clearAll(){
    selected.forEach(function(card){
      var btn = card.querySelector('.compare-toggle');
      if (btn) setToggle(card, btn, false);
    });
    selected = [];
    renderBar();
    closeModal();
  }

  function openModal(){
    if (selected.length < 2) return;
    var cols = selected.map(cardMeta);
    var html = '<div class="compare-table-wrap"><table class="compare-table"><tbody>';
    function row(label, cells){
      return '<tr><th scope="row">' + label + '</th>' +
        cells.map(function(c){ return '<td>' + c + '</td>'; }).join('') + '</tr>';
    }
    html += row('Tool', cols.map(function(m){ return '<strong>' + esc(m.name) + '</strong>'; }));
    html += row('Category', cols.map(function(m){ return esc(m.category); }));
    html += row('Pricing model', cols.map(function(m){
      /* "No free plan" must not count as free; a $0 tier is a free plan */
      var hasFreeWord = /free/i.test(m.price) && !/\bno\b[\s\S]*\bfree\b/i.test(m.price);
      var free = hasFreeWord || /\$0\b/.test(m.price);
      var badge = free
        ? '<span class="pricing-badge free">Free + Paid</span>'
        : '<span class="pricing-badge paid">Paid only</span>';
      return badge + '<br><span class="compare-price">' + esc(m.price) + '</span>';
    }));
    html += row('Key strengths', cols.map(function(m){
      if (!m.strengths.length) return esc(m.desc);
      return '<ul class="compare-strengths">' +
        m.strengths.map(function(s){ return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>';
    }));
    html += row('Best use case', cols.map(function(m){ return esc(m.desc); }));
    html += row('Links', cols.map(function(m){
      var out = '<a class="btn btn-small" href="' + esc(m.review) + '">Read Review →</a>';
      if (m.official) {
        out += '<br><a class="btn btn-ghost btn-small" href="' + esc(m.official) +
          '" target="_blank" rel="noopener">Visit Official Site ↗</a>';
      }
      return out;
    }));
    html += '</tbody></table></div>';
    modalBody.innerHTML = html;
    modal.hidden = false;
    document.body.classList.add('compare-modal-open');
    closeBtn.focus();
  }

  function closeModal(){
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('compare-modal-open');
  }

  document.querySelectorAll('.compare-toggle').forEach(function(btn){
    btn.addEventListener('click', function(){
      var card = btn.closest('article');
      if (!card) return;
      var i = selected.indexOf(card);
      if (i >= 0) {
        selected.splice(i, 1);
        setToggle(card, btn, false);
      } else {
        if (selected.length >= MAX) {
          showToast('You can compare up to 3 tools — remove one to add another.');
          return;
        }
        selected.push(card);
        setToggle(card, btn, true);
      }
      renderBar();
    });
  });

  nowBtn.addEventListener('click', openModal);
  clearBtn.addEventListener('click', clearAll);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', function(e){ if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeModal(); });
})();
