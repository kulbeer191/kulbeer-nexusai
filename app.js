// NexusAI by Kulbeer — Google-style AI search engine (vanilla JS, no framework)
// Features: relevance-ranked live search, autocomplete suggestions, trending
// pills, 9 category tabs, live result counter.
(function(){
  var searchInput = document.getElementById('toolSearch');
  var grid = document.getElementById('toolGrid');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.tool-card'));
  var pills = Array.prototype.slice.call(document.querySelectorAll('.pill:not(.saved-pill)'));
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
      cat: card.getAttribute('data-category') || '',
      slug: (link ? link.getAttribute('href') : '').replace(/^tools\//, '').replace(/\.html$/, ''),
      votes: parseInt(card.getAttribute('data-votes') || '0', 10) || 0
    };
  });

  /* ---- Upvotes, bookmarks ("Saved Tools") and sorting (Upgrade #6) ---- */
  var VOTE_KEY = 'nexusai_upvotes_v1';
  var SAVE_KEY = 'nexusai_saved_v1';
  function lsGet(key){ try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch(e){ return null; } }
  function lsSet(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){} }
  var upvoted = lsGet(VOTE_KEY) || {};
  var saved = lsGet(SAVE_KEY) || [];
  var savedOnly = false;
  var sortMode = 'featured';
  var sortSelect = document.getElementById('sortSelect');
  var savedPill = document.getElementById('savedPill');
  function currentVotes(m){ return m.votes + (upvoted[m.slug] ? 1 : 0); }
  function isSaved(m){ return saved.indexOf(m.slug) >= 0; }
  function hasFree(p){
    return (/free/i.test(p) && !/\bno\b[\s\S]*\bfree\b/i.test(p)) || /\$0\b/.test(p);
  }
  function renderVoteSave(m){
    var up = m.card.querySelector('.upvote-btn');
    if (up) {
      var on = !!upvoted[m.slug];
      up.classList.toggle('active', on);
      up.setAttribute('aria-pressed', on ? 'true' : 'false');
      var n = up.querySelector('.upvote-count');
      if (n) n.textContent = String(currentVotes(m));
    }
    var sv = m.card.querySelector('.save-btn');
    if (sv) {
      var svOn = isSaved(m);
      sv.classList.toggle('active', svOn);
      sv.setAttribute('aria-pressed', svOn ? 'true' : 'false');
      sv.textContent = svOn ? '🔖 Saved ✓' : '🔖 Save';
    }
  }
  function updateSavedPill(){
    if (savedPill) savedPill.textContent = '🔖 Saved (' + saved.length + ')';
  }
  meta.forEach(function(m){
    var up = m.card.querySelector('.upvote-btn');
    if (up) up.addEventListener('click', function(){
      if (upvoted[m.slug]) delete upvoted[m.slug]; else upvoted[m.slug] = true;
      lsSet(VOTE_KEY, upvoted);
      renderVoteSave(m);
      if (sortMode === 'trending') apply();
    });
    var sv = m.card.querySelector('.save-btn');
    if (sv) sv.addEventListener('click', function(){
      var i = saved.indexOf(m.slug);
      if (i >= 0) saved.splice(i, 1); else saved.push(m.slug);
      lsSet(SAVE_KEY, saved);
      renderVoteSave(m);
      updateSavedPill();
      if (savedOnly) apply();
    });
  });
  if (savedPill) savedPill.addEventListener('click', function(){
    savedOnly = !savedOnly;
    savedPill.classList.toggle('active', savedOnly);
    savedPill.setAttribute('aria-pressed', savedOnly ? 'true' : 'false');
    apply();
  });
  if (sortSelect) sortSelect.addEventListener('change', function(){
    sortMode = sortSelect.value;
    apply();
  });
  meta.forEach(renderVoteSave);
  updateSavedPill();

  function wordsOf(q){ return q.split(/\s+/).filter(function(w){ return w.length > 0; }); }

  // Relevance score: exact title match first, then title words, then
  // category/tag, then price (e.g. "free"), then description.
  // "No free plan" must not match a "free" search: strip that phrase from
  // the price before matching (same rule as hasFree() for the badge/sort).
  function score(m, q, words){
    var title = m.title.toLowerCase(), tag = m.tag.toLowerCase(),
        price = m.price.toLowerCase().replace(/no free plan/g, ''), desc = m.desc.toLowerCase();
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
    if (savedOnly) counter.textContent += ' \u2022 Saved only';
  }

  function apply(){
    var q = searchInput ? searchInput.value.trim().toLowerCase() : '';
    var words = wordsOf(q);
    var visible = [];
    meta.forEach(function(m){
      var okC = activeCat === 'all' || m.cat === activeCat;
      var okS = !savedOnly || isSaved(m);
      var s = q ? score(m, q, words) : 1;
      m.score = s;
      if (okC && okS && s > 0) visible.push(m);
    });
    // Rank: chosen sort wins; "Featured" keeps relevance, then original order.
    if (sortMode === 'trending') {
      visible.sort(function(a, b){ return (currentVotes(b) - currentVotes(a)) || (a.index - b.index); });
    } else if (sortMode === 'free') {
      visible.sort(function(a, b){
        var fa = hasFree(a.price) ? 0 : 1, fb = hasFree(b.price) ? 0 : 1;
        return (fa - fb) || (currentVotes(b) - currentVotes(a)) || (a.index - b.index);
      });
    } else if (sortMode === 'az') {
      visible.sort(function(a, b){ return a.title.localeCompare(b.title) || (a.index - b.index); });
    } else {
      visible.sort(function(a, b){ return (b.score - a.score) || (a.index - b.index); });
    }
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
      if (n === 0 && savedOnly && saved.length === 0) emptyMsg.textContent = "You haven't saved any tools yet — tap \uD83D\uDD16 Save on any card to keep it here.";
      else if (n === 0 && q) emptyMsg.textContent = "No tools match '" + q + "'. Try a different keyword, or browse All tools.";
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

  /* ?q= deep link: pre-fill the search box from the URL (also powers the
     WebSite SearchAction in the JSON-LD schema on index.html). */
  try {
    var qs = new URLSearchParams(window.location.search);
    var q0 = qs.get('q');
    if (q0 && searchInput) searchInput.value = q0;
  } catch (e) {}

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

  /* Shared with the AI Stack Recommender: add a card to the comparison. */
  window.NexusAICompare = {
    add: function(card){
      if (!card) return false;
      if (selected.indexOf(card) >= 0) return true;
      if (selected.length >= MAX) {
        showToast('You can compare up to 3 tools — remove one to add another.');
        return false;
      }
      selected.push(card);
      var btn = card.querySelector('.compare-toggle');
      if (btn) setToggle(card, btn, true);
      renderBar();
      return true;
    }
  };
})();

/* ---- Interactive AI Stack Recommender ("Find My Perfect AI") ---- */
(function(){
  var openBtn = document.getElementById('recommenderOpen');
  var modal = document.getElementById('recModal');
  var body = document.getElementById('recBody');
  var stepLabel = document.getElementById('recStepLabel');
  var closeBtn = document.getElementById('recClose');
  if (!openBtn || !modal || !body || !stepLabel || !closeBtn) return;

  var GOALS = [
    { key:'chat',   label:'Write & Research',    icon:'✍️', cat:'chat' },
    { key:'code',   label:'Code & Build Apps',   icon:'💻', cat:'code' },
    { key:'image',  label:'Generate Images',     icon:'🎨', cat:'image' },
    { key:'video',  label:'Create & Edit Videos', icon:'🎬', cat:'video' },
    { key:'voice',  label:'Voice & Audio',       icon:'🎙️', cat:'voice' },
    { key:'agents', label:'Automate Workflows',  icon:'🤖', cat:'agents' }
  ];
  var BUDGETS = [
    { key:'free',    label:'Free Plan Required',        desc:'Only tools with a free plan' },
    { key:'under30', label:'Freemium / Under $30/mo',  desc:'Free plan, or a paid entry at $30/mo or less' },
    { key:'any',     label:'Any / Best Performance',    desc:'The best tool for the job, whatever it costs' }
  ];
  /* Editorial top-pick order per category, from the review verdicts.
     Tools not listed sort after, alphabetically — so new daily-batch tools
     become candidates automatically, with no code change. */
  var TOP_PICKS = {
    chat:   ['chatgpt','claude','grammarly','jasper','quillbot','writer-com','copy-ai','sudowrite'],
    code:   ['cursor','github-copilot','v0-by-vercel','bolt-new','lovable','replit','devin-desktop','coderabbit'],
    image:  ['midjourney','leonardo-ai','adobe-firefly'],
    video:  ['runway','heygen','kling-ai','pika','luma-dream-machine'],
    agents: ['manus-ai','lindy-ai','zapier-agents','n8n','genspark','perplexity-teammates','skyvern','autogpt'],
    /* Dedicated voice tools (added 2026-11-17). The fallback pool below only
       runs if the voice category is empty again. */
    voice:  ['elevenlabs','descript','murf-ai','suno-ai','udio']
  };
  var state = { goal:null, budget:null };

  function esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function slugOf(href){
    return (href || '').replace(/^tools\//, '').replace(/\.html$/, '');
  }
  function minPrice(p){
    var nums = (p.match(/\$(\d+(?:\.\d+)?)/g) || []).map(function(s){ return parseFloat(s.slice(1)); });
    return nums.length ? Math.min.apply(null, nums) : Infinity;
  }
  function hasFree(p){
    return (/free/i.test(p) && !/\bno\b[\s\S]*\bfree\b/i.test(p)) || /\$0\b/.test(p);
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
  function findCardBySlug(slug){
    var link = document.querySelector('.tool-card a[href="tools/' + slug + '.html"]');
    return link ? link.closest('article') : null;
  }
  function poolFor(cat){
    return Array.prototype.slice.call(document.querySelectorAll('.tool-card'))
      .filter(function(card){
        if (card.getAttribute('data-category') !== cat) return false;
        var tag = card.querySelector('.tag');
        if (tag && /^Comparison/i.test(tag.textContent.trim())) return false;
        return true;
      })
      .map(function(card){ return { card: card, meta: cardMeta(card) }; });
  }
  function rank(pool, goalKey){
    var order = TOP_PICKS[goalKey] || [];
    return pool.slice().sort(function(a, b){
      var ia = order.indexOf(slugOf(a.meta.review));
      var ib = order.indexOf(slugOf(b.meta.review));
      ia = ia < 0 ? 1000 : ia;
      ib = ib < 0 ? 1000 : ib;
      if (ia !== ib) return ia - ib;
      return a.meta.name.localeCompare(b.meta.name);
    });
  }
  function compute(goalKey, budgetKey){
    var goal = null;
    GOALS.forEach(function(g){ if (g.key === goalKey) goal = g; });
    if (!goal) return { results: [], note: '' };
    var pool = poolFor(goal.cat);
    var note = '';
    if (pool.length === 0 && goal.cat === 'voice') {
      pool = TOP_PICKS.voice.map(findCardBySlug)
        .filter(function(c){ return !!c; })
        .map(function(card){ return { card: card, meta: cardMeta(card) }; });
      note = 'No dedicated Voice & Audio tools in the directory yet — these are the closest voice-capable tools (meeting transcription & voice cloning).';
    }
    var filtered = pool;
    if (budgetKey === 'free') {
      filtered = pool.filter(function(x){ return hasFree(x.meta.price); });
    } else if (budgetKey === 'under30') {
      filtered = pool.filter(function(x){ return hasFree(x.meta.price) || minPrice(x.meta.price) <= 30; });
    }
    if (filtered.length < 3 && pool.length > filtered.length) {
      var rest = pool.filter(function(x){ return filtered.indexOf(x) < 0; })
        .sort(function(a, b){ return minPrice(a.meta.price) - minPrice(b.meta.price); });
      if (filtered.length === 0) {
        note = (note ? note + ' ' : '') +
          'No tool in this category matches that budget, so here are the lowest-cost options instead.';
      } else {
        note = (note ? note + ' ' : '') +
          'Only ' + filtered.length + ' in this category match that budget — topped up with the lowest-cost option.';
      }
      filtered = filtered.concat(rest);
    }
    return { results: rank(filtered, goalKey).slice(0, 3), note: note };
  }

  function goalLabel(key){
    var g = null;
    GOALS.forEach(function(x){ if (x.key === key) g = x; });
    return g ? g.label : '';
  }
  function budgetLabel(key){
    var b = null;
    BUDGETS.forEach(function(x){ if (x.key === key) b = x; });
    return b ? b.label : '';
  }

  function renderStep1(){
    stepLabel.textContent = 'Step 1 of 2 — What do you want to achieve?';
    body.innerHTML = '<div class="rec-options">' + GOALS.map(function(g){
      return '<button type="button" class="rec-option" data-goal="' + g.key + '">' +
        '<span class="rec-option-icon" aria-hidden="true">' + g.icon + '</span>' +
        '<span>' + esc(g.label) + '</span></button>';
    }).join('') + '</div>';
    Array.prototype.forEach.call(body.querySelectorAll('[data-goal]'), function(btn){
      btn.addEventListener('click', function(){
        state.goal = btn.getAttribute('data-goal');
        renderStep2();
      });
    });
  }

  function renderStep2(){
    stepLabel.textContent = 'Step 2 of 2 — What is your budget?';
    body.innerHTML =
      '<p class="rec-context">Goal: <strong>' + esc(goalLabel(state.goal)) + '</strong> &nbsp;·&nbsp; ' +
      '<button type="button" class="rec-link" id="recBackGoal">change goal</button></p>' +
      '<div class="rec-options rec-budgets">' + BUDGETS.map(function(b){
        return '<button type="button" class="rec-option rec-budget" data-budget="' + b.key + '">' +
          '<span><span>' + esc(b.label) + '</span><small>' + esc(b.desc) + '</small></span></button>';
      }).join('') + '</div>';
    document.getElementById('recBackGoal').addEventListener('click', renderStep1);
    Array.prototype.forEach.call(body.querySelectorAll('[data-budget]'), function(btn){
      btn.addEventListener('click', function(){
        state.budget = btn.getAttribute('data-budget');
        renderResults();
      });
    });
  }

  function renderResults(){
    var out = compute(state.goal, state.budget);
    stepLabel.textContent = 'Your top 3 matches';
    var html = '';
    if (out.note) html += '<p class="rec-note">' + esc(out.note) + '</p>';
    html += '<p class="rec-context">' + esc(goalLabel(state.goal)) + ' • ' + esc(budgetLabel(state.budget)) +
      ' &nbsp;·&nbsp; <button type="button" class="rec-link" id="recStartOver">start over</button></p>';
    if (!out.results.length) {
      html += '<p class="rec-note">No matches yet for this combination — try another goal or budget, or browse all tools below.</p>';
    } else {
      html += '<div class="rec-results">' + out.results.map(function(x, i){
        var m = x.meta;
        var rankLabel = i === 0 ? 'Best match' : i === 1 ? 'Great alternative' : 'Also worth a look';
        var entry = minPrice(m.price);
        var priceBit = hasFree(m.price) ? 'Free plan available'
          : (isFinite(entry) ? 'From $' + entry + '/mo' : 'See official pricing');
        var reason = priceBit + ' · ' + (m.strengths[0] || m.desc);
        var out2 = '<article class="rec-result">' +
          '<span class="rec-rank">' + rankLabel + '</span>' +
          '<h3>' + esc(m.name) + '</h3>' +
          '<span class="tag">' + esc(m.category) + '</span>' +
          '<p class="rec-price">' + esc(m.price) + '</p>' +
          '<p class="rec-why"><strong>Why this fits you:</strong> ' + esc(reason) + '</p>' +
          '<div class="rec-actions">' +
          '<a class="btn btn-small" href="' + esc(m.review) + '">Read Review →</a>' +
          '<button type="button" class="btn btn-ghost btn-small rec-compare" data-review="' + esc(m.review) + '">+ Compare</button>';
        if (m.official) {
          out2 += '<a class="btn btn-ghost btn-small" href="' + esc(m.official) +
            '" target="_blank" rel="noopener">Visit Official Site ↗</a>';
        }
        return out2 + '</div></article>';
      }).join('') + '</div>';
    }
    body.innerHTML = html;
    var startOver = document.getElementById('recStartOver');
    if (startOver) startOver.addEventListener('click', renderStep1);
    Array.prototype.forEach.call(body.querySelectorAll('.rec-compare'), function(btn){
      btn.addEventListener('click', function(){
        var card = findCardBySlug(slugOf(btn.getAttribute('data-review')));
        if (window.NexusAICompare && window.NexusAICompare.add(card)) {
          btn.textContent = '✓ Added to compare';
          btn.disabled = true;
        }
      });
    });
  }

  function openModal(){
    state.goal = null;
    state.budget = null;
    renderStep1();
    modal.hidden = false;
    document.body.classList.add('rec-modal-open');
    closeBtn.focus();
  }
  function closeModal(){
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('rec-modal-open');
  }

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', function(e){ if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !modal.hidden) closeModal(); });
})();
