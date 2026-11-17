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
