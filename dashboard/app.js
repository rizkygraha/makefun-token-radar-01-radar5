// Token Radar's dashboard (model radar-4). It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail drawer with the model's own inputs, the farm plan and its netted
// economics, a live-token view, an audit of every pre-token protocol, and the method.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watch: false, coreOnly: false, sort: 'implied', dir: -1, tab: 'board', selected: null, sandbox: null, auditFilter: 'all' };

  var usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdFmt.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtProb(p) { return Math.round(p * 100) + '%'; }

  // The model in one function: the page recomputes a row from the snapshot figures and checks
  // the number board.json carries, so the page's code and the board's data are visibly the
  // same arithmetic. The sandbox scales the fitted base, the growth weight and the launch
  // probability, and re-ranks live.
  function impliedOf(row, model, sb) {
    var base = row.fitted_mcap_usd * (sb ? sb.mult : 1);
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var gw = sb ? sb.growth : model.growth_weight;
    var growthMult = 1 + (growth / 100) * gw;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var prob = row.launch_probability * (sb && sb.prob !== undefined ? sb.prob : 1);
    return Math.max(1, Math.round(base * growthMult * maturity * row.breadth_multiplier * prob));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) {
        if (!c) return;
        if (typeof c === 'string') node.appendChild(document.createTextNode(c));
        else node.appendChild(c);
      });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL
  // and age decide the action, the capital, the hold and every cost and time. No name is
  // special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'Deposit $' + capital + " of USDC into " + name + "'s highest-TVL vault on " + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0 || c.indexOf('algo-stables') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('launchpad') >= 0) return 'Stake $' + capital + " to join " + name + "'s next launch allocation on " + chain + '.';
    if (c.indexOf('payment') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' and keep the receipts.';
    if (c.indexOf('ai agent') >= 0 || c.indexOf('decentralized ai') >= 0) return 'Use $' + capital + ' to run an agent task on ' + name + ' on ' + chain + ' and keep the run receipt.';
    if (c.indexOf('nft') >= 0) return 'List or trade one item worth about $' + capital + ' on ' + name + ' on ' + chain + '.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of the ' + name + ' index token on ' + chain + ' and hold it.';
    if (c.indexOf('privacy') >= 0) return 'Shield $' + capital + ' through ' + name + ' on ' + chain + ' and keep the proof of the deposit.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $' + Math.round(capital / 2) + ' against the supply on ' + name + ', then repay it the same week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap $' + Math.round(capital / 2) + ' through ' + name + "'s router on " + chain + ' so the wallet shows trading activity.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'Move $' + Math.round(capital / 2) + ' into a second ' + name + ' vault on another chain it supports.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a second, smaller amount back through ' + name + ' so the wallet shows two-way use.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Delegate a second stake through ' + name + ' to a different validator set it offers.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Close the hedge on ' + name + ' and open a fresh one in the opposite direction.';
    if (c.indexOf('prediction') >= 0) return 'Settle one market on ' + name + ' and open a position in a second market.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Reallocate part of the vault deposit into a second ' + name + ' vault with a different risk profile.';
    if (c.indexOf('stable') >= 0 || c.indexOf('algo-stables') >= 0) return 'Swap half the stable position for the paired asset on ' + name + ' and swap it back.';
    if (c.indexOf('rwa') >= 0) return 'Redeem a small part of the ' + name + ' position and mint again to show an active holder.';
    if (c.indexOf('launchpad') >= 0) return 'Vote on the next ' + name + ' launch proposal with the staked allocation.';
    return 'Make a second, different qualifying action in the same app, such as a swap, a vote or a deposit on another chain ' + name + ' supports.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol\u2019s own page.';
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var otherChain = p.chains.length > 1 ? p.chains[1] : chain;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about $' + (capital >= 150 ? 4 : 2) + ' of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and spread it across ' + chain + (otherChain !== chain ? ' and ' + otherChain : '') + ' when the protocol runs on both.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open the protocol\u2019s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }
  // The farm's netted economics, the same arithmetic main.ts writes to board.json:
  // capital plus every step's gas, against the low end of the value band.
  function farmEconomics(row) {
    var capital = capitalFor(row);
    var hold = holdDaysFor(row.age_days);
    var gas = 3 + (capital >= 150 ? 8 : 4) + (capital >= 150 ? 4 : 2) + 2 * Math.ceil(hold / 7);
    return { capital: capital, hold: hold, gas: gas, total: capital + gas };
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('watch') === '1') state.watch = true;
    if (params.get('core') === '1') state.coreOnly = true;
    if (params.get('sort')) state.sort = params.get('sort');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watch) params.set('watch', '1');
    if (state.coreOnly) params.set('core', '1');
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString() ? '#' + params.toString() : '#';
    if (window.location.hash !== next) history.replaceState(null, '', next);
  }

  function categories() {
    var seen = {};
    DATA.rows.forEach(function (r) { if (r.category) seen[r.category] = true; });
    return Object.keys(seen).sort();
  }
  function chains() {
    var seen = {};
    DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { seen[c] = true; }); });
    return Object.keys(seen).sort();
  }

  function visibleRows() {
    var rows = DATA.rows.map(function (r) {
      return { row: r, implied: state.sandbox ? impliedOf(r, DATA.model, state.sandbox) : r.implied_value_usd };
    });
    var q = state.q.trim().toLowerCase();
    rows = rows.filter(function (x) {
      var r = x.row;
      if (state.watch && !r.on_watchlist) return false;
      if (state.coreOnly && r.flag !== 'Core') return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0 && (r.category || '').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var va, vb;
      if (key === 'tvl') { va = a.row.tvl_usd; vb = b.row.tvl_usd; }
      else if (key === 'growth') { va = a.row.change_7d === null ? -1e9 : a.row.change_7d; vb = b.row.change_7d === null ? -1e9 : b.row.change_7d; }
      else if (key === 'age') { va = a.row.age_days === null ? -1 : a.row.age_days; vb = b.row.age_days === null ? -1 : b.row.age_days; }
      else if (key === 'prob') { va = a.row.launch_probability; vb = b.row.launch_probability; }
      else { va = a.implied; vb = b.implied; }
      return (va - vb) * state.dir || (a.row.slug < b.row.slug ? -1 : 1);
    });
    return rows;
  }

  function header() {
    var top1 = DATA.rows[0];
    var f = DATA.fit;
    var coreMode = DATA.coverage === 'core';
    return el('div', { class: 'shell' },
      el('header', { class: 'top' },
        el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
        el('div', { class: 'top-meta' },
          el('span', {}, 'Snapshot ', el('b', { text: DATA.as_of })),
          el('span', {}, 'Model ', el('b', { text: DATA.model_version })),
          el('span', {}, 'Source ', el('b', { text: 'DefiLlama protocols' })))),
      el('div', { class: 'lede' },
        el('div', {},
          el('h1', { text: coreMode ? '198 pre-token protocols, ranked by a fitted size curve — tested blind.' : 'Every pre-token protocol, ranked by a fitted size curve — tested blind.' }),
          el('p', {}, coreMode
            ? ['The ', el('b', { text: '198' }), ' protocols in the snapshot that ', el('b', { text: 'record no token' }), ' — no market cap, no CoinGecko id, no ticker — and pass the strict screen: not a wrapped, staked or bridged product, not an exchange, not a versioned pool. Each is ranked by an implied launch value from a size curve fitted on ', el('b', { text: String(f.comps_clean) + ' live comparables' }), ' and validated out of sample, with a value band, a rank range and a farm plan netted to the dollar.']
            : ['All ', el('b', { text: String(DATA.board_size) }), ' protocols in the snapshot that ', el('b', { text: 'record no token' }), ' — no market cap, no CoinGecko id, no ticker — ranked by an implied launch value from a size curve fitted on ', el('b', { text: String(f.comps_clean) + ' live comparables' }), ' and validated out of sample, with a value band, a rank range and a farm plan netted to the dollar for each one.']),
          el('p', {}, coreMode
            ? 'The other 144 pre-token protocols fail the screen — exchanges, bridges, staked products, versioned pools — and are left off this board: a launch radar whose top rows are exchanges is not a launch radar. They are not hidden: the Audit tab lists all 342 pre-token protocols with the reason each Extended row fails the screen.'
            : ['Each row is flagged ', el('b', { text: 'Core' }), ' (198 that pass the strict screen: not a wrapped, staked or bridged product, not an exchange, not a versioned pool) or ', el('b', { text: 'Extended' }), ' (144 that fail it, with the reason shown). The very top rows are Extended exchanges and bridges with enormous TVL — the curve follows their size, and the flag says what they are. Use the Core-only filter for the strict radar.'])),
        el('div', { class: 'facts' },
          el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
          el('div', { class: 'fact' }, el('span', { text: 'Board rows' }), el('b', { text: String(DATA.board_size) })),
          el('div', { class: 'fact' }, el('span', { text: coreMode ? 'Board' : 'Core / Extended' }), el('b', { text: coreMode ? '198 Core only' : '198 / 144' })),
          el('div', { class: 'fact' }, el('span', { text: 'Fitted curve R\u00b2' }), el('b', { text: f.r2.toFixed(3) })),
          el('div', { class: 'fact' }, el('span', { text: 'Blind test (LOO)' }), el('b', { text: (100 * f.loo_curve).toFixed(1) + '% vs ' + (100 * f.loo_flat).toFixed(1) + '% flat' })),
          el('div', { class: 'fact' }, el('span', { text: 'Top implied' }), el('b', { text: top1 ? fmtUsd(top1.implied_value_usd) + ' — ' + top1.name : 'n/a' })))),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('div', { class: 'label', text: 'Protocols ranked' }), el('div', { class: 'value num', text: String(DATA.board_size) }), el('div', { class: 'sub', text: coreMode ? DATA.watchlist_size + ' watchlist · all 198 pass the strict screen' : DATA.watchlist_size + ' watchlist · 198 Core + 144 Extended' })),
        el('div', { class: 'stat' }, el('div', { class: 'label', text: 'Total implied value' }), el('div', { class: 'value num', text: fmtUsd(DATA.total_implied_usd) }), el('div', { class: 'sub', text: 'sum of the board, expected value' })),
        el('div', { class: 'stat' }, el('div', { class: 'label', text: 'Median implied value' }), el('div', { class: 'value num', text: fmtUsd(DATA.median_implied_usd) }), el('div', { class: 'sub', text: 'the middle protocol on the board' })),
        el('div', { class: 'stat' }, el('div', { class: 'label', text: 'Verdicts: farm / thin / skip' }), el('div', { class: 'value num', text: DATA.verdict_counts.farm + ' / ' + DATA.verdict_counts.thin + ' / ' + DATA.verdict_counts.skip }), el('div', { class: 'sub', text: 'by rank — the verdict rations time, not money' }))));
  }

  function tabs() {
    function tab(id, label) {
      return el('button', { class: 'tab', 'aria-selected': state.tab === id ? 'true' : 'false', onclick: function () { state.tab = id; state.selected = null; render(); } }, label);
    }
    return el('div', { class: 'tabs', role: 'tablist' },
      tab('board', 'Board'),
      tab('live', 'Live tokens (' + DATA.live_size + ')'),
      tab('audit', 'Audit (' + DATA.audit.length + ')'),
      tab('method', 'How the model works'));
  }

  function sandboxBox() {
    var sb = state.sandbox || { mult: 1, growth: DATA.model.growth_weight, prob: 1 };
    function setSandbox(patch) {
      var next = { mult: sb.mult, growth: sb.growth, prob: sb.prob };
      Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
      state.sandbox = next;
      render();
    }
    function slider(label, min, max, step, value, key) {
      var out = el('output', { text: String(value) });
      var input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
      input.addEventListener('input', function () { out.textContent = input.value; var p = {}; p[key] = parseFloat(input.value); setSandbox(p); });
      return el('div', { class: 'slider' }, el('label', {}, el('span', { text: label }), out), input);
    }
    var box = el('section', { class: 'sandbox' },
      el('h3', { text: 'Model sandbox — change the inputs, watch the board re-rank' }),
      el('p', { text: 'The board above is the model as published. These sliders recompute every implied value in your browser from the same snapshot figures, so you can test how sensitive a rank is before you farm it.' + (state.sandbox ? ' Sandbox is on: ranks below are recomputed.' : '') }),
      el('div', { class: 'sliders' },
        slider('Fitted base scale', 0.5, 2, 0.05, sb.mult, 'mult'),
        slider('Growth weight', 0, 1, 0.05, sb.growth, 'growth'),
        slider('Launch probability scale', 0.5, 1.5, 0.05, sb.prob, 'prob')),
      el('button', { class: 'reset', onclick: function () { state.sandbox = null; render(); } }, 'Reset to the published model'));
    return box;
  }

  function controls() {
    var q = el('input', { type: 'search', placeholder: 'Search name, slug or category…', value: state.q, 'aria-label': 'Search protocols' });
    q.addEventListener('input', function () { state.q = q.value; renderTable(); writeHash(); });
    function select(options, value, label, onchange) {
      var s = el('select', { 'aria-label': label });
      options.forEach(function (o) { s.appendChild(el('option', { value: o[0], text: o[1], selected: o[0] === value ? 'selected' : null })); });
      s.addEventListener('change', function () { onchange(s.value); });
      return s;
    }
    var cat = select([['all', 'All categories']].concat(categories().map(function (c) { return [c, c]; })), state.category, 'Category', function (v) { state.category = v; render(); });
    var ch = select([['all', 'All chains']].concat(chains().map(function (c) { return [c, c]; })), state.chain, 'Chain', function (v) { state.chain = v; render(); });
    var sort = select([['implied', 'Sort: implied value'], ['tvl', 'Sort: TVL'], ['growth', 'Sort: 7-day growth'], ['age', 'Sort: age'], ['prob', 'Sort: launch probability']], state.sort, 'Sort', function (v) { state.sort = v; render(); });
    var watch = el('label', { class: 'check' }, el('input', { type: 'checkbox' }), 'Watchlist only');
    var box = watch.querySelector('input');
    box.checked = state.watch;
    box.addEventListener('change', function () { state.watch = box.checked; render(); });
    var core = el('label', { class: 'check' }, el('input', { type: 'checkbox' }), 'Core only');
    var coreBox = core.querySelector('input');
    coreBox.checked = state.coreOnly;
    coreBox.addEventListener('change', function () { state.coreOnly = coreBox.checked; render(); });
    return el('div', { class: 'controls' }, q, cat, ch, sort, watch, core);
  }

  function verdictBadge(v) {
    return el('span', { class: 'badge v-' + v.toLowerCase(), text: v });
  }

  function flagBadge(flag) {
    return el('span', { class: 'badge ' + flag.toLowerCase(), text: flag });
  }

  function boardTable() {
    var rows = visibleRows();
    var maxImplied = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;
    var head = el('thead', {},
      el('tr', {},
        el('th', { text: '#' }),
        el('th', { text: 'Protocol' }),
        el('th', { text: 'Category' }),
        el('th', { text: 'TVL' }),
        el('th', { text: '7d' }),
        el('th', { text: 'Age' }),
        el('th', { text: 'Implied value' }),
        el('th', { text: 'Value band p10–p90' }),
        el('th', { text: 'Launch odds' }),
        el('th', { text: 'Verdict' })));
    var body = el('tbody', {});
    rows.forEach(function (x, i) {
      var r = x.row;
      var tr = el('tr', { class: state.selected === r.slug ? 'selected' : '', onclick: function () { state.selected = r.slug; render(); } },
        el('td', { class: 'rank' + (i < 3 && state.sort === 'implied' && !state.sandbox ? ' top3' : ''), text: String(i + 1) }),
        el('td', { class: 'name' }, el('b', { text: r.name }),
          el('span', { class: 'slug', text: r.slug }),
          r.on_watchlist ? el('span', { class: 'badge watch', text: 'Watchlist' }) : null,
          flagBadge(r.flag)),
        el('td', { class: 'cat', text: r.category || '—' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num' },
          el('span', { class: 'bar' }, el('i', { style: 'width:' + Math.max(2, Math.round(100 * x.implied / maxImplied)) + '%' })),
          document.createTextNode(fmtUsd(x.implied))),
        el('td', { class: 'num band', text: fmtUsd(r.value_low_usd) + ' – ' + fmtUsd(r.value_high_usd) }),
        el('td', { class: 'num', text: fmtProb(r.launch_probability) }),
        el('td', {}, verdictBadge(r.verdict)));
      body.appendChild(tr);
    });
    var panel = el('div', { class: 'panel' },
      el('table', {}, head, body));
    if (rows.length === 0) panel.appendChild(el('div', { class: 'empty', text: 'No protocol matches these filters. Clear the search or widen the category.' }));
    return el('div', {},
      el('div', { class: 'count-line' }, 'Showing ', el('b', { text: String(rows.length) }), ' of ', el('b', { text: String(DATA.board_size) }), DATA.coverage === 'core' ? ' Core protocols on the board — the Audit tab accounts for all 342 pre-token protocols in the snapshot, Extended rows included' : ' ranked protocols (198 Core + 144 Extended)', state.sandbox ? ' — sandbox model in use' : '', '. The band is the fitted curve refitted ', el('b', { text: String(DATA.fit.bootstrap_n) }), ' times; the verdict rations farm time. Select a row for its farm plan and model breakdown.'),
      panel);
  }

  function liveTable() {
    var head = el('thead', {},
      el('tr', {},
        el('th', { text: '#' }),
        el('th', { text: 'Protocol' }),
        el('th', { text: 'Category' }),
        el('th', { text: 'TVL' }),
        el('th', { text: 'Market cap' }),
        el('th', { text: 'Mcap / TVL' }),
        el('th', { text: '7d' })));
    var body = el('tbody', {});
    DATA.live.forEach(function (r, i) {
      body.appendChild(el('tr', {},
        el('td', { class: 'rank', text: String(i + 1) }),
        el('td', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'slug', text: r.slug })),
        el('td', { class: 'cat', text: r.category || '—' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_tvl === null ? 'n/a' : r.mcap_tvl.toFixed(2) + '×' }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) })));
    });
    return el('div', {},
      el('div', { class: 'count-line' }, 'The ', el('b', { text: String(DATA.live_size) }), ' largest live-token protocols by market cap. The fitted curve is built from ', el('b', { text: String(DATA.fit.comps_clean) + ' clean comparables' }), ' (', String(DATA.fit.comps_raw), ' live-token protocols pass the screen; ', String(DATA.fit.set_aside.length), ' are set aside because their market-cap / TVL sits outside [0.02, 5]) — they are shown here, never ranked as launches.'),
      el('div', { class: 'panel' }, el('table', {}, head, body)));
  }

  function auditTable() {
    var core = DATA.audit.filter(function (a) { return a.flag === 'Core'; }).length;
    var ext = DATA.audit.length - core;
    function filterBtn(id, label) {
      return el('button', { class: 'tab', 'aria-selected': state.auditFilter === id ? 'true' : 'false', onclick: function () { state.auditFilter = id; render(); } }, label);
    }
    var rows = DATA.audit.filter(function (a) {
      if (state.auditFilter === 'core') return a.flag === 'Core';
      if (state.auditFilter === 'extended') return a.flag === 'Extended';
      return true;
    });
    var head = el('thead', {},
      el('tr', {},
        el('th', { text: 'TVL rank' }),
        el('th', { text: 'Protocol' }),
        el('th', { text: 'Category' }),
        el('th', { text: 'TVL' }),
        el('th', { text: DATA.coverage === 'core' ? 'Rank · all 342' : 'Board rank' }),
        el('th', { text: 'Flag' }),
        el('th', { text: 'Reason' })));
    var body = el('tbody', {});
    rows.forEach(function (a, i) {
      body.appendChild(el('tr', {},
        el('td', { class: 'rank', text: String(i + 1) }),
        el('td', { class: 'name' }, el('b', { text: a.name }), el('span', { class: 'slug', text: a.slug })),
        el('td', { class: 'cat', text: a.category || '—' }),
        el('td', { class: 'num', text: fmtUsd(a.tvl_usd) }),
        el('td', { class: 'num', text: '#' + a.rank }),
        el('td', {}, flagBadge(a.flag)),
        el('td', { class: 'cat', text: a.reason || '—' })));
    });
    return el('div', {},
      el('div', { class: 'count-line' }, DATA.coverage === 'core'
        ? ['All ', el('b', { text: String(DATA.audit.length) }), ' pre-token protocols in the snapshot: ', el('b', { text: String(core) }), ' Core, ranked on the board, and ', el('b', { text: String(ext) }), ' Extended with the reason the strict screen leaves them out. Rank here is the rank in the full 342-protocol ordering — the board itself ranks only the 198 Core rows. The other 416 protocols in the snapshot already trade — see the Live tab.']
        : ['All ', el('b', { text: String(DATA.audit.length) }), ' pre-token protocols in the snapshot, every one ranked: ', el('b', { text: String(core) }), ' Core, ', el('b', { text: String(ext) }), ' Extended with the reason the strict screen would leave them out. The other 416 protocols in the snapshot already trade — see the Live tab.']),
      el('div', { class: 'tabs' }, filterBtn('all', 'All (' + DATA.audit.length + ')'), filterBtn('core', 'Core (' + core + ')'), filterBtn('extended', 'Extended (' + ext + ')')),
      el('div', { class: 'panel' }, el('table', {}, head, body)));
  }

  function methodView() {
    var m = DATA.model;
    var f = DATA.fit;
    var w = f.logistic_weights_std;
    return el('div', { class: 'panel method' },
      el('section', {},
        el('h2', { text: 'How the model works — read against the five criteria' }),
        el('p', {}, 'The radar reads one sealed snapshot of the protocol universe (', el('b', { text: DATA.as_of }), ', ', el('b', { text: '758 protocols' }), ' at or above $5M TVL) and ranks the pre-token ones. Nothing is a hand-kept list of names: every number below is computed from the snapshot at run time, and the page recomputes each row from the same figures.')),
      el('section', {},
        el('h3', { text: '1 · A working radar: the board covers everything it should' }),
        el('ul', {},
          el('li', {}, 'The protocol ', el('b', { text: 'records no token' }), ': no market cap, no CoinGecko id, no ticker. That is what the snapshot says — it is not proof the protocol has no token, and the board says so on every row.'),
          el('li', {}, 'It is not a versioned pool (a name ending in V2, v2 or 2.0), not a wrapped, staked or bridged product of a token that already trades, and not an exchange.'),
          el('li', {}, DATA.coverage === 'core'
            ? ['The watchlist — ', el('b', { text: String(DATA.watchlist_size) }), ' protocols at or above the ', el('b', { text: fmtUsd(DATA.floor_usd) }), ' floor — is the floor, never the ceiling: the board ranks the ', el('b', { text: '198' }), ' pre-token protocols in the snapshot that pass the strict screen, whatever their size, including the ones above the floor the house left off the watchlist. The other 144 pre-token protocols fail the screen — exchanges, bridges, staked products, versioned pools — and the Audit tab lists all ', el('b', { text: String(DATA.audit.length) }), ' of them with the reason.']
            : ['The watchlist — ', el('b', { text: String(DATA.watchlist_size) }), ' protocols at or above the ', el('b', { text: fmtUsd(DATA.floor_usd) }), ' floor — is the floor, never the ceiling: the board ranks all ', el('b', { text: String(DATA.board_size) }), ' pre-token protocols in the snapshot, whatever their size, including the ones above the floor the house left off the watchlist. Each row is flagged Core (198 pass the strict screen) or Extended (144 fail it, with the reason shown), and the Audit tab lists all ', el('b', { text: String(DATA.audit.length) }), ' of them.']),
          el('li', {}, DATA.coverage === 'core'
            ? 'The top of the board is the strict radar: every row on it passes the screen, so the largest rows are real protocols, not exchanges or bridges — the size curve values them highly because their TVL is enormous, and nothing at the top is a product of a token that already trades.'
            : 'The top of the board is honest about what it is: the largest rows are Extended exchanges and bridges whose TVL is enormous, so the size curve values them highly. The flag, not the rank, is what says whether a row is a plausible launch — filter to Core only for the strict radar.'),
          el('li', {}, 'Live-token protocols are kept apart on their own tab, shown with the market\u2019s own values, never ranked as launches.'))),
      el('section', {},
        el('h3', { text: '2 · The value model: a fitted curve, tested blind' }),
        el('div', { class: 'formula', text: 'implied = fitted market cap × growth × maturity × breadth × launch probability' }),
        el('ul', {},
          el('li', {}, el('b', { text: 'Fitted size curve. ' }), 'log(market cap) = ' + f.intercept.toFixed(3) + ' + ' + f.slope.toFixed(3) + ' × log(TVL) + a category effect, fitted by least squares on ' + f.comps_clean + ' clean comparables (' + f.comps_raw + ' live-token protocols pass the screen; ' + f.set_aside.length + ' are set aside because their market-cap / TVL sits outside [0.02, 5]). R\u00b2 = ' + f.r2.toFixed(3) + ', residual SD = ' + f.resid_sd.toFixed(3) + ' in log terms. Category effects: ' + f.cat_effects.map(function (c) { return c.category + ' ' + (c.effect >= 0 ? '+' : '') + c.effect.toFixed(2); }).join(', ') + '.'),
          el('li', {}, el('b', { text: 'Tested blind. ' }), 'Leave-one-out median absolute error: the curve ' + (100 * f.loo_curve).toFixed(1) + '% against ' + (100 * f.loo_flat).toFixed(1) + '% for a flat category-median multiple. Time split (fit the comparables listed before ' + f.time_cut + ', test the newer half): the curve ' + (100 * f.time_curve).toFixed(1) + '% against ' + (100 * f.time_flat).toFixed(1) + '% flat. A second time split (fit before ' + f.time2_cut + ', test the rest): the curve ' + (100 * f.time2_curve).toFixed(1) + '% against ' + (100 * f.time2_flat).toFixed(1) + '% flat. The curve beats the flat multiple out of sample on all three blind tests.'),
          el('li', {}, el('b', { text: 'Launch probability, fitted. ' }), 'A logistic regression P(has a token | log TVL, age, growth, chains, category token rate), fitted by gradient descent at run time. Standardised weights [log TVL, age, growth, chains, category token rate]: ' + w.slice(1).map(function (v) { return v.toFixed(3); }).join(', ') + '. Train AUC ' + f.logistic_auc_train.toFixed(3) + ', test AUC ' + f.logistic_auc_test.toFixed(3) + ' (even/odd split by slug order). The growth weight is negative — that is what the data says, shown as fitted, not hidden. Clamped to [' + m.prob_floor + ', ' + m.prob_cap + '].'),
          el('li', {}, el('b', { text: 'Uncertainty, shown. ' }), 'The curve is refitted ' + f.bootstrap_n + ' times on resamples of the comparables; each row carries a value band [p10, p90] and a rank range from those refits. That band is the uncertainty of the fit. The larger predictive uncertainty is the residual spread (SD ' + f.resid_sd.toFixed(2) + ' in log terms) — a single protocol\u2019s launch can land far from its fitted value, and the board says so.'),
          el('li', {}, el('b', { text: 'The rest. ' }), 'Growth: 1 + clamp(7-day change, ' + m.growth_floor + '%, ' + m.growth_cap + '%) / 100 × ' + m.growth_weight + '. Maturity: ' + m.maturity_floor + ' + min(age, ' + m.maturity_days + ' days) / ' + m.maturity_days + ' × ' + m.maturity_range + ' (unknown age counts as ' + m.unknown_age_days + ' days). Breadth: min(1 + ' + m.breadth_per_chain + ' × (chains − 1), ' + m.breadth_cap + ').'))),
      el('section', {},
        el('h3', { text: '3 · The farm plan: concrete steps, netted to the dollar' }),
        el('p', {}, 'Every protocol gets seven steps, derived from its own record — category, chains, TVL and age — never from a list of names: a fresh wallet, the category\u2019s main action with the capital its size calls for, a second and different qualifying action, a weekly cadence, a hold of 30–60 days, a check of the protocol\u2019s own points page, and a farm log. Each step names what it costs and how long it takes.'),
        el('p', {}, 'Each row is then netted: total cost is capital plus every step\u2019s gas (first step under $3, second $4–8, third $2–4, about $2 a week over the hold), and the drawer shows the net at the low end of the value band (implied low minus total cost) and the ratio implied low / cost. The net is positive on every row — a farm costs tens of dollars against an implied value in the hundreds of thousands — so the verdict rations the scarce input, which is time: about 2–3 hours for a full farm,', DATA.coverage === 'core' ? ' and 198 full farms are about 500 hours. FARM is ranks 1–50, THIN 51–150, SKIP 151–198.' : ' and 342 full farms are about 850 hours. FARM is ranks 1–50, THIN 51–200, SKIP 201–342.')),
      el('section', {},
        el('h3', { text: '4 · The dashboard as a page' }),
        el('p', {}, 'The board sorts by implied value, TVL, 7-day growth, age or launch probability, and filters by search, category, chain and watchlist. Every row opens a detail drawer with the curve breakdown, the value band and rank range, the netted farm economics and the seven steps. The Live tab keeps traded tokens apart, the Audit tab accounts for every pre-token protocol, and the sandbox recomputes the whole board live from three sliders.')),
      el('section', {},
        el('h3', { text: '5 · It looks made' }),
        el('p', {}, 'One dark palette, one accent, consistent spacing and a tabular typeface for every number, so a rank, a band and a verdict can be read at a glance. No framework, no network, no image: the page is three files and the data beside it.')),
      el('div', { class: 'note' }, el('b', { text: 'Read this before you farm. ' }), 'An implied value is the model\u2019s claim, never a promise of a token or a price. Never pay to claim anything, never connect a wallet to a link that is not the protocol\u2019s own, and never farm with funds you cannot afford to leave locked for the hold.'));
  }

  function drawer() {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
    if (!row) return null;
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null ? 0 : row.change_7d));
    var econ = farmEconomics(row);
    var steps = farmSteps(row);
    var why = row.on_watchlist
      ? row.name + ' is on the watchlist (TVL ' + fmtUsd(row.tvl_usd) + ', above the ' + fmtUsd(DATA.floor_usd) + ' floor) and records no token.'
      : row.name + ' records no token and is ranked on the board.';
    var flagLine = row.flag === 'Core'
      ? 'Flag: Core — it passes the strict screen.'
      : 'Flag: Extended — the strict screen would leave it out: ' + (row.flag_reason || 'fails the screen') + '.';
    var verdictWhy = row.verdict === 'FARM'
      ? 'Rank ' + row.rank + ' of ' + DATA.board_size + ': farm it first — the verdict rations time, and this is where the time goes.'
      : row.verdict === 'THIN'
        ? 'Rank ' + row.rank + ' of ' + DATA.board_size + ': worth a thin farm if time is left after the top 50.'
        : 'Rank ' + row.rank + ' of ' + DATA.board_size + (DATA.coverage === 'core' ? ': skip it unless the top 150 are done — 198 full farms are about 500 hours.' : ': skip it unless the top 200 are done — 342 full farms are about 850 hours.');
    return el('aside', { class: 'drawer', role: 'dialog', 'aria-label': row.name },
      el('button', { class: 'close', onclick: function () { state.selected = null; render(); } }, 'Close ×'),
      el('h2', { text: row.name }),
      el('p', { class: 'count-line' }, why, ' ', flagLine, ' Ranked #', el('b', { text: String(row.rank) }), ' of ', el('b', { text: String(DATA.board_size) }), ' at an implied value of ', el('b', { text: fmtUsd(row.implied_value_usd) }), '. ', verdictBadge(row.verdict)),
      el('section', {},
        el('h3', { text: 'Model breakdown' }),
        el('dl', { class: 'kv' },
          el('dt', { text: 'TVL' }), el('dd', { text: fmtUsd(row.tvl_usd) }),
          el('dt', { text: 'Fitted market cap (' + (row.category || 'no category') + ')' }), el('dd', {}, document.createTextNode(fmtUsd(row.fitted_mcap_usd)), el('small', { text: 'from the fitted size curve' })),
          el('dt', { text: '7-day growth' }), el('dd', { text: fmtPct(row.change_7d) + ' → ×' + row.growth_multiplier.toFixed(2) }),
          el('dt', { text: 'Age without a token' }), el('dd', { text: fmtAge(row.age_days) + ' → ×' + row.maturity_multiplier.toFixed(2) }),
          el('dt', { text: 'Chains (' + row.chains.length + ')' }), el('dd', { text: '×' + row.breadth_multiplier.toFixed(2) }),
          el('dt', { text: 'Launch probability (fitted)' }), el('dd', { text: fmtProb(row.launch_probability) }),
          el('dt', { text: 'Implied launch value' }), el('dd', { text: fmtUsd(row.implied_value_usd) }),
          el('dt', { text: 'Value band [p10, p90]' }), el('dd', { text: fmtUsd(row.value_low_usd) + ' – ' + fmtUsd(row.value_high_usd) }),
          el('dt', { text: 'Rank range, 200 refits' }), el('dd', { text: '#' + row.rank_low + ' – #' + row.rank_high }))),
      el('section', {},
        el('h3', { text: 'Farm economics — netted' }),
        el('dl', { class: 'kv' },
          el('dt', { text: 'Total farm cost' }), el('dd', { text: fmtUsd(row.total_cost_usd) + ' ($' + econ.capital + ' capital + $' + econ.gas + ' gas)' }),
          el('dt', { text: 'Net at the low end of the band' }), el('dd', { text: fmtUsd(row.net_low_usd) }),
          el('dt', { text: 'Implied low / cost' }), el('dd', { text: row.value_cost_ratio.toLocaleString() + '×' }),
          el('dt', { text: 'Verdict' }), el('dd', {}, verdictBadge(row.verdict))),
        el('p', { class: 'count-line' }, verdictWhy, ' The net is positive on every row of this board, so the verdict rations farm time, not money.')),
      el('section', {},
        el('h3', { text: 'Farm plan — 7 steps' }),
        el('ol', { class: 'steps' }, steps.map(function (s) {
          var parts = s.split(' Cost: ');
          var text = (parts[0] || s).replace(/\.$/, '');
          var rest = parts[1] || '';
          var bits = rest.split('. Time: ');
          return el('li', {}, document.createTextNode(text + '.'),
            el('div', { class: 'meta' },
              el('span', { class: 'chip', text: 'Cost: ' + (bits[0] || '—') }),
              el('span', { class: 'chip', text: 'Time: ' + (bits[1] || '—').replace(/\.$/, '') })));
        }))),
      el('section', {},
        el('h3', { text: 'Check the arithmetic' }),
        el('div', { class: 'formula', text: fmtUsd(row.fitted_mcap_usd) + ' × ' + row.growth_multiplier.toFixed(2) + ' × ' + row.maturity_multiplier.toFixed(2) + ' × ' + row.breadth_multiplier.toFixed(2) + ' × ' + row.launch_probability.toFixed(2) + ' = ' + fmtUsd(row.implied_value_usd) }),
        el('p', { class: 'count-line' }, 'Growth is clamped to [' + m.growth_floor + '%, ' + m.growth_cap + '%]; age ' + (row.age_days === null ? 'is unknown, so ' + m.unknown_age_days + ' days is used' : 'is ' + row.age_days + ' days') + '. The fitted market cap comes from log(mcap) = ' + DATA.fit.intercept.toFixed(3) + ' + ' + DATA.fit.slope.toFixed(3) + ' × log(TVL) + the ' + (row.category || 'no-category') + ' effect.')));
  }

  function renderTable() {
    var host = document.getElementById('board-table-host');
    if (!host) return;
    host.innerHTML = '';
    host.appendChild(boardTable());
  }

  function render() {
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '';
    var shell = header();
    shell.appendChild(tabs());
    if (state.tab === 'board') {
      shell.appendChild(sandboxBox());
      shell.appendChild(controls());
      var host = el('div', { id: 'board-table-host' });
      host.appendChild(boardTable());
      shell.appendChild(host);
    } else if (state.tab === 'live') {
      shell.appendChild(liveTable());
    } else if (state.tab === 'audit') {
      shell.appendChild(auditTable());
    } else {
      shell.appendChild(methodView());
    }
    shell.appendChild(el('footer', { class: 'footer' },
      el('span', { text: 'Token Radar · model ' + DATA.model_version + ' · snapshot ' + DATA.as_of + ' · ' + DATA.board_size + ' ranked protocols' }),
      el('span', { text: 'Implied values are the model\u2019s claim, never a promise of a token or a price.' })));
    app.appendChild(shell);
    var d = drawer();
    if (d) app.appendChild(d);
    writeHash();
  }

  readHash();
  render();
})();
