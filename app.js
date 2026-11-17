// NexusAI by Kulbeer — live search + category filters (vanilla JS, no framework)
(function(){
  var searchInput = document.getElementById('toolSearch');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.tool-card'));
  var pills = Array.prototype.slice.call(document.querySelectorAll('.pill'));
  var emptyMsg = document.getElementById('noResults');
  var activeCat = 'all';
  function apply(){
    var q = searchInput ? searchInput.value.trim().toLowerCase() : '';
    var visible = 0;
    cards.forEach(function(card){
      var text = (card.textContent || '').toLowerCase();
      var cat = card.getAttribute('data-category') || '';
      var okQ = !q || text.indexOf(q) !== -1;
      var okC = activeCat === 'all' || cat === activeCat;
      var show = okQ && okC;
      card.style.display = show ? '' : 'none';
      if(show) visible++;
    });
    if(emptyMsg) emptyMsg.style.display = visible === 0 ? 'block' : 'none';
  }
  if(searchInput) searchInput.addEventListener('input', apply);
  pills.forEach(function(p){
    p.addEventListener('click', function(){
      pills.forEach(function(x){ x.classList.remove('active'); });
      p.classList.add('active');
      activeCat = p.getAttribute('data-filter') || 'all';
      apply();
    });
  });
  apply();
})();
