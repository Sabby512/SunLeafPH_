/* Clean Energy - support chat (lower-right)
 *
 *  - "Assistant" tab : answers questions about the site.
 *        Built-in answers always work. If an Anthropic API key is set in api/config.php,
 *        typed questions are answered by Claude using only this site's facts.
 *  - "Admin" tab     : real messages to the site admins (logged-in visitors) or a contact
 *        form (guests). Admin replies show up here, written from admin.html.
 *
 * Uses the site's own CE.* helpers, so it works in the same two modes as the rest of the
 * site: MySQL (XAMPP) or browser storage (opening the HTML files directly).
 */
(function () {
  "use strict";
  if (window.__ceBot) return;
  window.__ceBot = true;

  /* ------------------------------------------------------------------ helpers */
  var doc = document, root = doc.documentElement;
  function $(s, c) { return (c || doc).querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function el(tag, cls, html) { var e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function page() { try { return (window.CE && CE.page && CE.page()) || "index.html"; } catch (e) { return "index.html"; } }
  function store(k, v) { try { if (v === undefined) return JSON.parse(sessionStorage.getItem(k)); sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} return null; }
  function ago(iso) {
    var d = new Date(iso); if (isNaN(d)) return "";
    var s = (Date.now() - d.getTime()) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + " h ago";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  /* ---------------------------------------------------------------- knowledge */
  var D = function (l, h) { return [l, h]; };
  var KB = [
    { id: "hello", k: ["hi", "hello", "hey", "good morning", "good afternoon", "good evening", "kumusta"], a: "Hi! I'm the SunLeaf PH assistant. Ask me about donating, volunteering, the petition, partnerships or how to reach the team, or pick a topic below." },
    { id: "thanks", k: ["thanks", "thank you", "salamat", "thx"], a: "You're welcome! Anything else I can help with?" },
    { id: "bot", k: ["are you a bot", "are you ai", "are you human", "are you real", "who are you", "what are you"], a: "I'm an automated assistant for this website, not a person. I can answer common questions, and you can switch to the Admin tab to message a real team member." },
    { id: "help", k: ["help", "what can you do", "options", "topics", "menu"], a: "I can help with: donating, volunteering, signing the petition, jobs, supporter sign-up, partnerships, contacting the team, clean energy basics, and account help. What would you like to know?" },
    { id: "human", k: ["human", "real person", "admin", "agent", "staff", "someone", "talk to a person", "speak to", "talk to someone", "live chat", "customer service"], act: "admin", a: "Sure. You can message the site admins from the Admin tab. Logged-in visitors get replies right here in the chat." },
    { id: "about", k: ["what is this", "sunleaf", "sun leaf", "campaign", "sdg", "mission", "about you", "about us", "who runs", "vision", "core values", "values", "commitment to earth", "references", "sources", "where do your facts"], a: "SunLeaf PH is a Philippines-based awareness campaign for affordable and clean energy (UN SDG 7). It shares learning materials and invites people to sign, give, volunteer, work with or partner with the campaign. The About Us page covers our mission and vision, core values, our commitment to Earth, and the references behind our information.", links: [D("About Us & References", "about.html"), D("Learn & Explore", "why-clean-energy.html"), D("Take Action", "take-action.html")] },
    { id: "involved", k: ["get involved", "how can i help", "how do i help", "ways to help", "other ways", "spread the word", "join", "participate", "ambassador", "contribute my time"], a: "There are lots of ways to help: sign the petition, donate or pledge, volunteer, apply for a role, become a supporter, partner with us, or spread the word and save energy at home. Which one interests you?", links: [D("Take Action", "take-action.html"), D("Other ways to help", "other-ways.html")] },
    { id: "donate", k: ["donate", "donation", "give", "pledge", "gcash", "maya", "grabpay", "shopeepay", "coins.ph", "e-wallet", "ewallet", "wallet", "credit card", "debit card", "card", "how much", "amount"], a: "On the Donate page you can give by e-wallet (GCash, Maya, GrabPay, ShopeePay or Coins.ph), by debit/credit card, or organize a local fundraiser. Choose \u20b1100, \u20b1250, \u20b1500, \u20b11,000 or your own amount.\n\nNote: the site only records your pledge. It never takes payment or asks for card, bank or wallet details.", links: [D("Donate", "donate.html")] },
    { id: "safe", k: ["safe", "secure", "charged", "card details", "payment taken", "is my money", "scam", "legit"], a: "Pledges on this site are recorded only. No payment is taken here, and you should never type card, bank or e-wallet details into the site or this chat.", links: [D("Donate", "donate.html")] },
    { id: "fundraiser", k: ["fundraiser", "fundraising", "fun run", "bake sale", "raise funds", "raise money"], a: "You can organize a local fundraiser, such as a fun run, bake sale, creative event or school activity, and tell the team your idea on the Donate page.", links: [D("Plan a fundraiser", "donate.html")] },
    { id: "volunteer", k: ["volunteer", "volunteering", "volunteers", "boluntaryo"], a: "Volunteers help with things like poster and slide making, class awareness talks, hosting an energy-saving challenge, social media sharing, community clean-energy days, and research and fact-checking. Pick what fits you and your time on the Volunteer page.", links: [D("Volunteer", "volunteer.html")] },
    { id: "jobs", k: ["job", "jobs", "career", "careers", "hiring", "work for you", "work for us", "employment", "content writer", "graphic designer", "researcher", "website developer", "community outreach", "vacancy"], a: "The Work for Us page lists five roles: Content Writer, Graphic Designer, Researcher, Website Developer and Community Outreach. Pick a role and register your interest with a short message.", links: [D("Work for Us", "work-for-us.html")] },
    { id: "petition", k: ["petition", "signature", "signatures", "add my name", "sign the petition", "petisyon"], a: "To sign the petition, add your name and email on the petition page. You can choose to appear as anonymous. Each email can sign once.", links: [D("Sign the petition", "sign-petition.html")] },
    { id: "supporter", k: ["supporter", "advocate", "champion", "membership", "join the movement", "become a supporter"], a: "On the Support Us page you can sign up as a Supporter, Advocate or Champion. Schools, local governments, businesses and community groups also work with the campaign.", links: [D("Support Us", "support.html")] },
    { id: "partner", k: ["partner", "partnership", "partnerships", "school", "schools", "university", "lgu", "local government", "business", "company", "organization", "organisation", "collaborate", "collaboration"], a: "Schools, businesses, local governments and community groups can apply to partner with us. It takes about five minutes to apply; then the team reaches out, you plan together, and you launch. Questions first? Email partners@cleanenergy.ph.", links: [D("Become a partner", "partner.html")] },
    { id: "contact", k: ["contact", "email", "e-mail", "phone", "call", "address", "office", "location", "where are you", "office hours", "hours", "open", "visit", "reply", "response time", "how long"], a: "Email hello@cleanenergy.ph or call +63 2 8123 4567. The office is in Makati City, Metro Manila, open Monday to Friday, 9:00 AM \u2013 5:00 PM (PHT). The team aims to reply within 2 business days.", links: [D("Contact page", "contact.html")] },
    { id: "speaker", k: ["speaker", "workshop", "webinar", "invite you", "guest talk", "talk at"], a: "Yes, you can request a speaker or workshop. Use the contact form and tell us the audience, date and topic, such as solar, wind, hydropower or geothermal.", links: [D("Contact us", "contact.html")] },
    { id: "materials", k: ["materials", "images", "copyright", "license", "licence", "credit", "cite", "reuse", "use your", "resources"], a: "Our educational content is meant to be shared. Please credit the SunLeaf PH Clean Energy campaign, and contact us first if you plan to use materials commercially or edit them.", links: [D("Contact us", "contact.html")] },
    { id: "feedback", k: ["feedback", "mistake", "error", "correction", "suggestion", "typo", "wrong information", "report a problem"], a: "Thank you! Send corrections and ideas through the contact form and choose the topic \u201cFeedback or suggestion\u201d.", links: [D("Contact us", "contact.html")] },
    { id: "basics", k: ["learn & explore", "learn and explore", "what is clean energy", "clean energy", "renewable", "solar", "wind", "hydro", "hydropower", "geothermal", "tidal", "bioenergy", "biomass", "nuclear", "fossil"], a: "The Learn & Explore page explains clean energy and covers solar, wind, hydropower, geothermal, tidal, bioenergy and nuclear energy, and how they compare with fossil fuels.", links: [D("Learn & Explore", "why-clean-energy.html")] },
    { id: "compare", k: ["compare", "comparison", "compare energy", "pros and cons", "advantages and disadvantages", "cheapest", "cheaper", "expensive", "cost of", "costs", "estimated cost", "limitations", "environmental impact", "sts", "science technology and society", "best energy source", "which energy source"], a: "The Learn & Explore page has a Compare the Energy Sources section. It sets solar, wind, hydropower, geothermal, tidal, bioenergy and nuclear side by side: main benefits, limitations, estimated costs and environmental impact. Pick any source for its pros and cons and how it connects to Science, Technology and Society (STS). Cost figures are 2024 global averages from IRENA.", links: [D("Compare energy sources", "why-clean-energy.html#compare"), D("References", "about.html#references")] },
    { id: "future", k: ["future", "energy future", "philippines", "storage", "efficiency", "community energy"], a: "Our Energy Future looks at what could change with clean energy, including renewable energy, storage, efficiency, community participation and the Philippines' energy future. Fun fact: the Philippines is one of the world's leading producers of geothermal electricity.", links: [D("Our Energy Future", "our-energy-future.html")] },
    { id: "tips", k: ["save energy", "tips", "electricity", "bill", "reduce", "at home", "home tips", "energy saving", "energy-saving"], a: "Take Action has practical tips for your home, school or community, plus a tool to estimate how much power the sun could give you. Other Ways has a save-energy-at-home checklist.", links: [D("Take Action", "take-action.html"), D("Other ways", "other-ways.html")] },
    { id: "account", k: ["login", "log in", "sign in", "register", "sign up", "create account", "create an account", "account", "password", "forgot", "reset", "can't log in", "cant login"], a: "You can create an account or log in from the top of any page. Forgot your password? Use the reset page to get a 6-digit code. Logged-in visitors can also message the admins from this chat.", links: [D("Log in", "login.html"), D("Create account", "register.html"), D("Forgot password", "forgot-password.html")] }
  ];
  KB.forEach(function (e) {
    e.re = e.k.map(function (k) {
      var p = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return { w: k.indexOf(" ") > -1 ? 3 : (k.length > 5 ? 2 : 1), r: new RegExp("(^|[^a-z0-9])" + p + "(s|es)?($|[^a-z0-9])", "i") };
    });
  });
  function find(text) {
    var best = null, bs = 0;
    KB.forEach(function (e) {
      var s = 0; e.re.forEach(function (x) { if (x.r.test(text)) s += x.w; });
      if (s > bs) { bs = s; best = e; }
    });
    return best;
  }
  var FALLBACK = { a: "I'm not sure about that one. You can pick a topic below, or switch to the Admin tab to ask the team directly.", act: "admin" };

  var CHIPS = [
    ["How can I help?", "involved"], ["How do I donate?", "donate"], ["Volunteer", "volunteer"],
    ["Sign the petition", "petition"], ["Partner with us", "partner"], ["Contact the team", "contact"]
  ];
  var PAGE_FIRST = {
    "donate.html": [["Is it safe to donate?", "safe"], ["Plan a fundraiser", "fundraiser"]],
    "volunteer.html": [["What can volunteers do?", "volunteer"]],
    "work-for-us.html": [["Which roles are open?", "jobs"]],
    "sign-petition.html": [["How does the petition work?", "petition"]],
    "partner.html": [["How do partnerships work?", "partner"]],
    "support.html": [["Supporter levels", "supporter"]],
    "contact.html": [["Office hours & reply time", "contact"]],
    "login.html": [["Forgot my password", "account"]],
    "register.html": [["Account help", "account"]],
    "why-clean-energy.html": [["Types of clean energy", "basics"], ["Compare energy sources", "compare"]],
    "our-energy-future.html": [["Philippines' energy future", "future"]],
    "take-action.html": [["Energy-saving tips", "tips"]],
    "about.html": [["Mission, values & sources", "about"]]
  };
  function chipsForPage() {
    var first = PAGE_FIRST[page()] || [], seen = {}, out = [];
    first.concat(CHIPS).forEach(function (c) { if (!seen[c[1]]) { seen[c[1]] = 1; out.push(c); } });
    return out.slice(0, 7);
  }

  /* -------------------------------------------------------------------- state */
  var S = store("ce-bot") || {};
  S.log = Array.isArray(S.log) ? S.log.slice(-40) : [];
  S.tab = S.tab === "admin" ? "admin" : "bot";
  S.open = !!S.open;
  function save() { S.log = S.log.slice(-40); store("ce-bot", S); }

  var auth = { ready: false, user: null }, aiOn = false, serverMode = false;
  var adminMsgs = [], unseen = 0, adminUnread = 0, busy = false;

  /* ---------------------------------------------------------------------- CSS */
  var CSS = [
    ".ceb,.ceb *{box-sizing:border-box}",
    ".ceb{position:fixed;right:0;bottom:0;z-index:9990;font-family:inherit;font-size:14px;line-height:1.45;color:var(--tx,#2c3e38);pointer-events:none;--ceb-g:var(--g,#0f5a43);--ceb-gt:var(--btn-tx,#fff);--ceb-bg:var(--bg,#fff);--ceb-bg2:var(--bg3,#eef4ee);--ceb-ln:var(--line,#d9e3dc);--ceb-mu:var(--mu,#52645d);--ceb-hd:var(--hd,#0f5a43);--ceb-y:var(--y,#f2b632)}",
    ".ceb>*{pointer-events:auto}",
    "@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .ceb{color-scheme:dark}}",
    ":root[data-theme=dark] .ceb{color-scheme:dark}",
    ".ceb-fab{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));width:48px;height:48px;border-radius:50%;border:0;background:var(--ceb-g);color:var(--ceb-gt);display:grid;place-items:center;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.28);transition:transform .2s,box-shadow .2s;padding:0}",
    ".ceb-fab:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(0,0,0,.32)}",
    ".ceb-fab:focus-visible,.ceb button:focus-visible,.ceb a:focus-visible,.ceb textarea:focus-visible,.ceb input:focus-visible{outline:3px solid var(--ceb-y);outline-offset:2px}",
    ".ceb-fab svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}",
    ".ceb-fab .x{display:none}.ceb.open .ceb-fab .c{display:none}.ceb.open .ceb-fab .x{display:block}",
    ".ceb-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#d92d20;color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center;border:2px solid var(--ceb-bg)}",
    ".ceb-badge[hidden]{display:none}",
    ".ceb-panel{margin:0;padding:0;position:fixed;right:max(16px,env(safe-area-inset-right));bottom:calc(max(16px,env(safe-area-inset-bottom)) + 60px);width:min(330px,calc(100vw - 32px));height:min(460px,calc(100dvh - 100px));background:var(--ceb-bg);border:1px solid var(--ceb-ln);border-radius:16px;box-shadow:0 12px 36px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden;transform-origin:bottom right;animation:cebIn .18s ease-out}",
    ".ceb-panel[hidden]{display:none}",
    "@keyframes cebIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}",
    ".ceb-hd{display:flex;align-items:center;gap:10px;padding:10px 10px 10px 14px;background:var(--ceb-g);color:var(--ceb-gt)}",
    ".ceb-av{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.2);display:grid;place-items:center;flex:none}",
    ".ceb-av svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}",
    ".ceb-hd b{display:block;font-size:1rem;line-height:1.2}.ceb-hd small{display:block;font-size:.76rem;opacity:.9}",
    ".ceb-hd .grow{flex:1;min-width:0}",
    ".ceb-close{background:none;border:0;color:inherit;width:44px;height:44px;margin:-6px -6px -6px 0;border-radius:50%;display:grid;place-items:center;cursor:pointer;flex:none}",
    ".ceb-close:hover{background:rgba(255,255,255,.18)}.ceb-close svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}",
    ".ceb-tabs{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--ceb-ln);background:var(--ceb-bg)}",
    ".ceb-tab{position:relative;background:none;border:0;border-bottom:3px solid transparent;padding:12px 8px;min-height:44px;font:inherit;font-weight:600;font-size:.88rem;color:var(--ceb-mu);cursor:pointer}",
    ".ceb-tab[aria-selected=true]{color:var(--ceb-hd);border-color:var(--ceb-g)}",
    ".ceb-tab .n{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;margin-left:6px;border-radius:9px;background:#d92d20;color:#fff;font-size:11px;font-weight:700;vertical-align:1px}",
    ".ceb-tab .n[hidden]{display:none}",
    ".ceb-log{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:14px 14px 6px;display:flex;flex-direction:column;gap:10px;background:var(--ceb-bg)}",
    ".ceb-m{max-width:88%;padding:10px 13px;border-radius:16px;word-wrap:break-word;overflow-wrap:anywhere;font-size:.93rem}",
    ".ceb-m.b,.ceb-m.a{align-self:flex-start;background:var(--ceb-bg2);border-bottom-left-radius:5px}",
    ".ceb-m.u{align-self:flex-end;background:var(--ceb-g);color:var(--ceb-gt);border-bottom-right-radius:5px}",
    ".ceb-m a.in{color:inherit;text-decoration:underline;font-weight:600}",
    ".ceb-m small.w{display:block;font-size:.72rem;opacity:.75;margin-top:4px}",
    ".ceb-m.a small.w:first-child{margin:0 0 3px;font-weight:700;opacity:.8}",
    ".ceb-links{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}",
    ".ceb-links a,.ceb-links button{display:inline-flex;align-items:center;min-height:36px;padding:6px 13px;border-radius:999px;border:1.5px solid var(--ceb-g);background:var(--ceb-bg);color:var(--ceb-g);font:inherit;font-size:.82rem;font-weight:600;text-decoration:none;cursor:pointer}",
    ".ceb-links a:hover,.ceb-links button:hover{background:var(--ceb-g);color:var(--ceb-gt)}",
    ".ceb-typing{align-self:flex-start;background:var(--ceb-bg2);border-radius:16px;border-bottom-left-radius:5px;padding:13px 15px;display:flex;gap:5px}",
    ".ceb-typing i{width:7px;height:7px;border-radius:50%;background:var(--ceb-mu);opacity:.5;animation:cebDot 1.1s infinite ease-in-out}",
    ".ceb-typing i:nth-child(2){animation-delay:.15s}.ceb-typing i:nth-child(3){animation-delay:.3s}",
    "@keyframes cebDot{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-4px);opacity:1}}",
    ".ceb-chips{display:flex;gap:7px;overflow-x:auto;padding:8px 14px 10px;scrollbar-width:none;-webkit-overflow-scrolling:touch;background:var(--ceb-bg);flex:none}",
    ".ceb-chips::-webkit-scrollbar{display:none}",
    ".ceb-chips button{flex:none;min-height:38px;padding:7px 14px;border-radius:999px;border:1.5px solid var(--ceb-ln);background:var(--ceb-bg);color:var(--tx,#2c3e38);font:inherit;font-size:.82rem;font-weight:600;cursor:pointer;white-space:nowrap}",
    ".ceb-chips button:hover{border-color:var(--ceb-g);color:var(--ceb-g)}",
    ".ceb-form{display:flex;align-items:flex-end;gap:8px;padding:10px 12px calc(12px + env(safe-area-inset-bottom,0px) * 0);border-top:1px solid var(--ceb-ln);background:var(--ceb-bg);flex:none}",
    ".ceb-form[hidden],.ceb-chips[hidden]{display:none}",
    ".ceb-form textarea{flex:1;min-width:0;resize:none;border:1.5px solid var(--ceb-ln);border-radius:14px;padding:10px 12px;font:inherit;font-size:16px;line-height:1.35;max-height:110px;background:var(--ceb-bg);color:var(--tx,#2c3e38)}",
    ".ceb-form textarea:focus{border-color:var(--ceb-g);outline:0}",
    ".ceb-send{flex:none;width:44px;height:44px;border-radius:50%;border:0;background:var(--ceb-g);color:var(--ceb-gt);display:grid;place-items:center;cursor:pointer}",
    ".ceb-send:disabled{opacity:.45;cursor:not-allowed}.ceb-send svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}",
    ".ceb-card{align-self:stretch;border:1px solid var(--ceb-ln);border-radius:14px;padding:14px;background:var(--ceb-bg2)}",
    ".ceb-card h4{margin:0 0 4px;font-size:.95rem;color:var(--ceb-hd)}.ceb-card p{margin:0 0 10px;font-size:.88rem;color:var(--ceb-mu)}",
    ".ceb-card label{display:block;font-size:.78rem;font-weight:700;margin:8px 0 3px;color:var(--ceb-hd)}",
    ".ceb-card input,.ceb-card textarea{width:100%;border:1.5px solid var(--ceb-ln);border-radius:10px;padding:9px 11px;font:inherit;font-size:16px;background:var(--ceb-bg);color:var(--tx,#2c3e38)}",
    ".ceb-card textarea{min-height:76px;resize:vertical}",
    ".ceb-card .err{color:#d92d20;font-size:.8rem;margin:6px 0 0;min-height:1em}",
    ".ceb-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 18px;border-radius:999px;border:1.5px solid var(--ceb-g);background:var(--ceb-g);color:var(--ceb-gt);font:inherit;font-weight:700;font-size:.88rem;cursor:pointer;text-decoration:none}",
    ".ceb-btn.ghost{background:transparent;color:var(--ceb-g)}",
    ".ceb-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}",
    ".ceb-note{align-self:center;text-align:center;font-size:.76rem;color:var(--ceb-mu);padding:2px 10px}",
    "@media (max-width:520px){",
    " .ceb.open .ceb-fab{display:none}",
    " .ceb-panel{left:8px;right:8px;width:auto;bottom:calc(8px + env(safe-area-inset-bottom,0px));height:min(calc(100dvh - 16px - env(safe-area-inset-top,0px)),680px);border-radius:16px}",
    "}",
    "@media (max-width:360px){.ceb-fab{width:46px;height:46px}.ceb-m{max-width:93%}}",
    "@media (max-height:480px) and (orientation:landscape){.ceb-panel{height:calc(100dvh - 16px);bottom:8px}.ceb-chips{display:none}}",
    "@media (prefers-reduced-motion:reduce){.ceb *,.ceb{animation:none!important;transition:none!important}}",
    ":root.reduce-motion .ceb *{animation:none!important;transition:none!important}",
    "@media print{.ceb{display:none!important}}"
  ].join("\n");

  /* ------------------------------------------------------------------- markup */
  var ICON_CHAT = '<svg class="c" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h7M8.5 14h4.5"/></svg><svg class="x" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var ICON_BOT = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V5M9 13h.01M15 13h.01M9.5 16.2c1.4.8 3.6.8 5 0"/><circle cx="12" cy="4" r="1"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  var rootEl, fab, badge, panel, logEl, chipsEl, formEl, ta, sendBtn, tabBot, tabAdmin, tabAdminN, subEl;

  function build() {
    var st = el("style"); st.id = "ceb-style"; st.textContent = CSS; doc.head.appendChild(st);
    rootEl = el("div", "ceb");
    rootEl.innerHTML =
      '<button type="button" class="ceb-fab" aria-label="Open support chat" aria-expanded="false" aria-controls="ceb-panel">' + ICON_CHAT + '<span class="ceb-badge" hidden></span></button>' +
      '<div class="ceb-panel" id="ceb-panel" role="dialog" aria-label="SunLeaf PH support chat" hidden>' +
        '<div class="ceb-hd"><span class="ceb-av">' + ICON_BOT + '</span><div class="grow"><b>SunLeaf PH Support</b><small class="ceb-sub">Assistant</small></div>' +
        '<button type="button" class="ceb-close" aria-label="Close chat">' + ICON_X + '</button></div>' +
        '<div class="ceb-tabs" role="tablist" aria-label="Chat type">' +
          '<button type="button" role="tab" class="ceb-tab" id="ceb-t-bot" aria-controls="ceb-log" aria-selected="true">Assistant</button>' +
          '<button type="button" role="tab" class="ceb-tab" id="ceb-t-admin" aria-controls="ceb-log" aria-selected="false">Message admin<span class="n" hidden></span></button>' +
        '</div>' +
        '<div class="ceb-log" id="ceb-log" role="log" aria-live="polite" aria-relevant="additions"></div>' +
        '<div class="ceb-chips" aria-label="Suggested questions"></div>' +
        '<div class="ceb-form" role="group" aria-label="Write a message"><label class="sr" for="ceb-in" style="position:absolute;left:-9999px">Your message</label>' +
          '<textarea id="ceb-in" rows="1" maxlength="500" placeholder="Ask a question\u2026" autocomplete="off" enterkeyhint="send"></textarea>' +
          '<button type="button" class="ceb-send" aria-label="Send message">' + ICON_SEND + '</button></div>' +
      '</div>';
    doc.body.appendChild(rootEl);
    fab = $(".ceb-fab", rootEl); badge = $(".ceb-badge", rootEl); panel = $(".ceb-panel", rootEl);
    logEl = $(".ceb-log", rootEl); chipsEl = $(".ceb-chips", rootEl); formEl = $(".ceb-form", rootEl);
    ta = $("textarea", formEl); sendBtn = $(".ceb-send", formEl); subEl = $(".ceb-sub", rootEl);
    tabBot = $("#ceb-t-bot", rootEl); tabAdmin = $("#ceb-t-admin", rootEl); tabAdminN = $(".n", tabAdmin);

    fab.addEventListener("click", function () { setOpen(!S.open, true); });
    $(".ceb-close", rootEl).addEventListener("click", function () { setOpen(false, true); });
    tabBot.addEventListener("click", function () { setTab("bot"); });
    tabAdmin.addEventListener("click", function () { setTab("admin"); });
    [tabBot, tabAdmin].forEach(function (t) {
      t.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") { var o = t === tabBot ? tabAdmin : tabBot; o.focus(); o.click(); e.preventDefault(); }
      });
    });
    sendBtn.addEventListener("click", function () { submit(); });
    ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });
    ta.addEventListener("input", grow);
    doc.addEventListener("keydown", function (e) {
      // Esc closes the chat when focus is inside it, or nowhere in particular (e.g. after a form was replaced)
      var a = doc.activeElement;
      if (e.key === "Escape" && S.open && (rootEl.contains(a) || !a || a === doc.body)) setOpen(false, true);
    });
    // links and buttons inside messages
    logEl.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return;
      if (b.dataset.act === "admin") setTab("admin");
      if (b.dataset.act === "bot") setTab("bot");
    });
    chipsEl.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-id]"); if (!b || busy) return;
      var entry = KB.filter(function (x) { return x.id === b.dataset.id; })[0];
      addUser(b.textContent); respond(entry, null);
    });
    if (window.visualViewport) {
      var fit = function () { fitViewport(); };
      visualViewport.addEventListener("resize", fit); visualViewport.addEventListener("scroll", fit);
    }
    window.addEventListener("storage", function (e) { if (e.key === "ce-messages") refreshAdmin(); });
  }

  /* On phones the on-screen keyboard covers fixed elements; keep the panel above it. */
  function fitViewport() {
    try {
      if (!panel || panel.hidden) return;
      var vv = window.visualViewport;
      if (window.innerWidth > 520 || !vv) { panel.style.bottom = ""; panel.style.height = ""; return; }
      var covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      panel.style.bottom = (8 + covered) + "px";
      panel.style.height = Math.min(680, vv.height - 16) + "px";
    } catch (e) {}
  }

  function grow() { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 110) + "px"; }

  /* ---------------------------------------------------------------- rendering */
  function fmt(text) {
    // escape first, then allow only **bold**, newlines and links to the site's own pages
    var h = esc(text);
    h = h.replace(/\[([^\]\n]{1,60})\]\(([\w-]+\.html)\)/g, '<a class="in" href="$2">$1</a>');
    h = h.replace(/\*\*([^*\n]{1,80})\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
    return h;
  }

  function msgNode(m) {
    var n = el("div", "ceb-m " + m.r);
    n.innerHTML = fmt(m.t);
    if (m.links || m.act) {
      var box = el("div", "ceb-links");
      (m.links || []).forEach(function (l) { box.appendChild(el("a", "", esc(l[0]))).setAttribute("href", l[1]); });
      if (m.act === "admin") { var b = el("button", "", "Message an admin"); b.type = "button"; b.dataset.act = "admin"; box.appendChild(b); }
      n.appendChild(box);
    }
    return n;
  }

  function scrollDown() { logEl.scrollTop = logEl.scrollHeight; }

  function renderBot() {
    logEl.innerHTML = "";
    if (!S.log.length) S.log.push({ r: "b", t: KB[0].a });
    S.log.forEach(function (m) { logEl.appendChild(msgNode(m)); });
    var c = chipsForPage(); chipsEl.innerHTML = "";
    c.forEach(function (x) { var b = el("button"); b.type = "button"; b.dataset.id = x[1]; b.textContent = x[0]; chipsEl.appendChild(b); });
    chipsEl.hidden = false; formEl.hidden = false; ta.placeholder = "Ask a question\u2026"; ta.setAttribute("aria-label", "Ask the assistant");
    scrollDown();
  }

  function adminBubble(m) {
    var mine = m.from === "user";
    var n = el("div", "ceb-m " + (mine ? "u" : "a"));
    n.innerHTML = (mine ? "" : '<small class="w">Admin</small>') + fmt(m.body) + '<small class="w">' + esc(ago(m.at)) + "</small>";
    return n;
  }

  function renderAdmin() {
    logEl.innerHTML = ""; chipsEl.hidden = true;
    var u = auth.user;
    if (!auth.ready) { logEl.appendChild(el("p", "ceb-note", "Loading\u2026")); formEl.hidden = true; return; }
    if (!u) { formEl.hidden = true; renderGuest(); return; }
    if (u.role === "admin") {
      formEl.hidden = true;
      var c = el("div", "ceb-card");
      c.innerHTML = "<h4>You're signed in as an admin</h4><p>" + (adminUnread ? "<b>" + adminUnread + " unread message" + (adminUnread === 1 ? "" : "s") + "</b> from visitors are waiting." : "No unread messages right now.") + " Read and reply to visitors from the admin dashboard.</p>" +
        '<div class="ceb-row"><a class="ceb-btn" href="admin.html">Open admin inbox</a></div>';
      logEl.appendChild(c); return;
    }
    formEl.hidden = false; ta.placeholder = "Write to the admins\u2026"; ta.setAttribute("aria-label", "Message to the admins");
    if (!adminMsgs.length) {
      logEl.appendChild(el("p", "ceb-note", "Send a message and an admin will reply here. You're logged in as <b>" + esc(u.email) + "</b>."));
    }
    adminMsgs.forEach(function (m) { logEl.appendChild(adminBubble(m)); });
    scrollDown();
  }

  function renderGuest() {
    var c = el("div", "ceb-card");
    c.innerHTML = "<h4>Message the admins</h4><p>Log in to chat with an admin and see their replies right here. No account? Leave a message and we'll email you back within 2 business days.</p>" +
      '<div class="ceb-row" style="margin:0 0 6px"><a class="ceb-btn" href="login.html?next=' + encodeURIComponent(page()) + '">Log in</a><a class="ceb-btn ghost" href="register.html">Create account</a></div>';
    logEl.appendChild(c);
    var f = el("div", "ceb-card");
    f.innerHTML = "<h4>Or send a message</h4>" +
      '<label for="ceb-gn">Your name</label><input id="ceb-gn" autocomplete="name" maxlength="100">' +
      '<label for="ceb-ge">Email</label><input id="ceb-ge" type="email" autocomplete="email" maxlength="190">' +
      '<label for="ceb-gm">Message</label><textarea id="ceb-gm" maxlength="1000"></textarea>' +
      '<p class="err" role="alert"></p><button class="ceb-btn" id="ceb-guest-send" type="button">Send message</button>';
    logEl.appendChild(f);
    async function sendGuest() {
      var n = $("#ceb-gn", f).value.trim(), em = $("#ceb-ge", f).value.trim(), m = $("#ceb-gm", f).value.trim(), er = $(".err", f), b = $("button", f);
      if (n.length < 2) { er.textContent = "Please enter your name."; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { er.textContent = "Enter a valid email address."; return; }
      if (m.length < 10) { er.textContent = "Please write a short message (at least 10 characters)."; return; }
      er.textContent = ""; b.disabled = true; b.textContent = "Sending\u2026";
      var r = await CE.post("/api/contact", { name: n, email: em, topic: "General question", message: m });
      if (!r.ok) { b.disabled = false; b.textContent = "Send message"; er.textContent = r.error; return; }
      f.innerHTML = "<h4>Message sent \u2713</h4><p>Thank you, " + esc(n.split(" ")[0]) + ". The team will reply to <b>" + esc(em) + "</b> within 2 business days.</p>";
    }
    $("#ceb-guest-send", f).addEventListener("click", sendGuest);
    f.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); sendGuest(); } });
  }

  function badges() {
    var n = auth.user && auth.user.role === "admin" ? adminUnread : unseen;
    var show = n > 0 && !(S.open && S.tab === "admin" && auth.user && auth.user.role !== "admin");
    badge.hidden = !show; badge.textContent = n > 9 ? "9+" : String(n);
    tabAdminN.hidden = !(n > 0); tabAdminN.textContent = n > 9 ? "9+" : String(n);
    fab.setAttribute("aria-label", (S.open ? "Close support chat" : "Open support chat") + (n > 0 ? ", " + n + " new" : ""));
    if (!show) badge.hidden = true;
  }

  function render() {
    tabBot.setAttribute("aria-selected", S.tab === "bot"); tabAdmin.setAttribute("aria-selected", S.tab === "admin");
    tabBot.tabIndex = S.tab === "bot" ? 0 : -1; tabAdmin.tabIndex = S.tab === "admin" ? 0 : -1;
    subEl.textContent = S.tab === "bot" ? (aiOn ? "AI assistant" : "Automated assistant") : "Messages to the team";
    if (S.tab === "bot") renderBot(); else renderAdmin();
    badges();
  }

  function setTab(t) {
    S.tab = t; save(); render();
    if (t === "admin") refreshAdmin(true);
    if (window.matchMedia && matchMedia("(pointer:fine)").matches && !formEl.hidden) ta.focus();
  }

  function setOpen(o, focus) {
    S.open = o; save();
    panel.hidden = !o; rootEl.classList.toggle("open", o);
    fab.setAttribute("aria-expanded", o);
    if (o) {
      render(); fitViewport();
      if (S.tab === "admin") refreshAdmin(true);
      if (focus && window.matchMedia && matchMedia("(pointer:fine)").matches && !formEl.hidden) ta.focus();
    } else {
      panel.style.bottom = ""; panel.style.height = "";
      if (focus) fab.focus();
      badges();
    }
  }

  /* ------------------------------------------------------------- conversation */
  function addUser(text) { var m = { r: "u", t: text }; S.log.push(m); logEl.appendChild(msgNode(m)); save(); scrollDown(); }
  function addBot(m) { m.r = "b"; S.log.push(m); logEl.appendChild(msgNode(m)); save(); scrollDown(); }
  function typing(on) {
    var t = $(".ceb-typing", logEl);
    if (on && !t) { t = el("div", "ceb-typing", "<i></i><i></i><i></i>"); t.setAttribute("aria-label", "Assistant is typing"); logEl.appendChild(t); scrollDown(); }
    if (!on && t) t.remove();
  }
  function setBusy(b) { busy = b; sendBtn.disabled = b; }

  function respond(entry, text) {
    setBusy(true); typing(true);
    setTimeout(function () {
      typing(false);
      var e = entry || FALLBACK;
      addBot({ t: e.a, links: e.links, act: e.act });
      setBusy(false);
    }, 380);
  }

  async function askAI() {
    var turns = S.log.filter(function (m) { return m.t; }).slice(-8).map(function (m) { return { role: m.r === "u" ? "user" : "assistant", content: m.t }; });
    setBusy(true); typing(true);
    var res;
    try {
      var r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: turns, page: page() }) });
      var j = {}; try { j = await r.json(); } catch (e) {}
      res = r.ok && j.ok ? { ok: true, reply: j.reply } : { ok: false, status: r.status, error: j.error };
    } catch (e) { res = { ok: false, status: 0 }; }
    typing(false);
    if (res.ok) { addBot({ t: res.reply, act: /not sure|don'?t know|admin/i.test(res.reply) ? "admin" : undefined }); }
    else if (res.status === 429) { addBot({ t: "You've asked a lot of questions in a short time. Please try again a little later, or message an admin.", act: "admin" }); }
    else { var m = find(turns[turns.length - 1].content.toLowerCase()); addBot({ t: (m || FALLBACK).a, links: (m || FALLBACK).links, act: (m || FALLBACK).act }); }
    setBusy(false);
  }

  async function submit() {
    var text = ta.value.trim(); if (!text || busy) return;
    if (S.tab === "bot") {
      ta.value = ""; grow(); addUser(text);
      var low = text.toLowerCase(), m = find(low);
      var local = m && ["hello", "thanks", "human", "bot", "help"].indexOf(m.id) > -1;   // answered instantly, no AI call
      if (aiOn && !local) askAI(); else respond(m, text);
      return;
    }
    // admin tab (logged-in visitor)
    setBusy(true);
    var r = await CE.msgs.send(text);
    if (!r.ok) { setBusy(false); addNote(r.error || "Could not send. Please try again."); return; }
    ta.value = ""; grow(); setBusy(false);
    await refreshAdmin(true);
  }
  function addNote(t) { logEl.appendChild(el("p", "ceb-note", esc(t))); scrollDown(); }

  /* -------------------------------------------------------- admin <-> visitor */
  async function refreshAdmin(force) {
    if (!auth.ready || !auth.user) return;
    try {
      if (auth.user.role === "admin") {
        var s = await CE.admin.summary();
        if (s && s.ok) adminUnread = s.summary.unread || 0;
      } else {
        var r = await CE.msgs.mine();
        if (r && r.ok) {
          adminMsgs = r.messages;
          var viewing = S.open && S.tab === "admin" && !doc.hidden;
          if (viewing && adminMsgs.some(function (m) { return m.from === "admin" && !m.seen; })) {
            await CE.msgs.markSeen();
            adminMsgs.forEach(function (m) { if (m.from === "admin") m.seen = true; });
          }
          unseen = adminMsgs.filter(function (m) { return m.from === "admin" && !m.seen; }).length;
        }
      }
    } catch (e) {}
    if (S.open && S.tab === "admin") { var keep = ta.value; renderAdmin(); ta.value = keep; }
    badges();
  }

  var tick = 0;
  function poll() {
    if (doc.hidden || !auth.user) return;
    tick++;
    var viewing = S.open && S.tab === "admin";
    if (viewing && serverMode) refreshAdmin();                 // every 10 s while the Admin tab is open
    else if (tick % 6 === 0 && serverMode) refreshAdmin();     // about once a minute otherwise
  }

  /* --------------------------------------------------------------------- boot */
  function start() {
    if (!doc.body || $(".ceb")) return;
    build();
    setOpen(S.open, false);
    render();
    var ready = window.CE && CE.ready ? CE.ready : Promise.resolve();
    ready.then(function () {
      try { auth.user = CE.auth.current(); } catch (e) { auth.user = null; }
      auth.ready = true; aiOn = !!CE.ai; serverMode = CE.mode === "server";
      render();
      if (auth.user) refreshAdmin();
      setInterval(poll, 10000);
    });
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();
})();
