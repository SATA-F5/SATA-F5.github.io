(function () {
  "use strict";

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /* =======================================================
     Toast + copy
     ======================================================= */
  var toastEl = $("#toast");
  var toastText = $("#toastText");
  var toastTimer = null;
  function toast(message) {
    if (!toastEl) return;
    toastText.textContent = message;
    toastEl.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2400);
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    ta.remove();
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    }
    fallbackCopy(text);
    return Promise.resolve();
  }

  document.addEventListener("click", function (event) {
    var target = event.target.closest("[data-copy]");
    if (target) {
      var val = target.getAttribute("data-copy") || "";
      copyText(val).then(function () { toast("已复制到剪贴板"); });
      return;
    }
    var targetBtn = event.target.closest("[data-copy-target]");
    if (targetBtn) {
      var el = document.getElementById(targetBtn.getAttribute("data-copy-target"));
      if (!el) return;
      var text = (el.textContent || "").trim();
      if (!text || text.indexOf("未获取") === 0) {
        toast("虚拟 IP 尚未分配，请先启动网络");
        return;
      }
      if ((targetBtn.textContent || "").indexOf("复制 IP") !== -1) {
        text = text.split(":")[0];
      }
      copyText(text).then(function () { toast("已复制：" + text); });
      return;
    }
    var toastBtn = event.target.closest("[data-toast]");
    if (toastBtn) {
      toast(toastBtn.getAttribute("data-toast") || "操作完成");
    }
  });

  /* =======================================================
     Navigation / scroll progress / back to top
     ======================================================= */
  var sections = $$("section[data-section]");
  var navLinks = $$(".nav-link");
  var nav = $("#nav");
  var scrollBar = $("#scrollBar");
  var toTop = $("#toTop");
  var currentSection = "overview";

  function setActiveNav(id) {
    if (id === currentSection) return;
    currentSection = id;
    navLinks.forEach(function (link) {
      var active = link.getAttribute("data-nav") === id;
      link.classList.toggle("active", active);
      if (active && nav && window.innerWidth <= 860) {
        var navRect = nav.getBoundingClientRect();
        var linkRect = link.getBoundingClientRect();
        var left = nav.scrollLeft + (linkRect.left - navRect.left) - (nav.clientWidth - linkRect.width) / 2;
        nav.scrollTo({ left: Math.max(0, left), behavior: reduced ? "auto" : "smooth" });
      }
    });
  }

  function updateScroll() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (scrollBar) scrollBar.style.width = (progress * 100).toFixed(2) + "%";
    if (toTop) toTop.classList.toggle("show", window.scrollY > 560);

    var mark = window.scrollY + 150;
    var found = sections.length ? sections[0].getAttribute("data-section") : "overview";
    sections.forEach(function (section) {
      if (section.offsetTop <= mark) found = section.getAttribute("data-section");
    });
    setActiveNav(found);
  }

  var scrollTicking = false;
  window.addEventListener("scroll", function () {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(function () {
      updateScroll();
      scrollTicking = false;
    });
  }, { passive: true });
  window.addEventListener("resize", updateScroll);

  navLinks.forEach(function (link) {
    link.addEventListener("click", function () {
      setActiveNav(link.getAttribute("data-nav"));
    });
  });
  if (toTop) {
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    });
  }

  /* =======================================================
     Reveal on scroll
     ======================================================= */
  var revealObserver = null;
  if ("IntersectionObserver" in window && !reduced) {
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    $$(".reveal").forEach(function (el) { revealObserver.observe(el); });
  } else {
    $$(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  /* =======================================================
     Counter animation
     ======================================================= */
  function animateCount(el) {
    if (el.dataset.done === "1") return;
    el.dataset.done = "1";
    var from = Number(el.getAttribute("data-from") || 0);
    var to = Number(el.getAttribute("data-to") || 0);
    if (reduced) { el.textContent = String(to); return; }
    var start = performance.now();
    var duration = 1200;
    function frame(now) {
      var p = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(from + (to - from) * eased));
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = String(to);
    }
    requestAnimationFrame(frame);
  }
  var countObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            countObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.4 })
    : null;
  $$(".count").forEach(function (el) {
    if (countObserver) countObserver.observe(el);
    else animateCount(el);
  });

  /* =======================================================
     Hero network canvas
     ======================================================= */
  function initHeroCanvas() {
    var canvas = $("#netCanvas");
    var hero = $("#overview");
    if (!canvas || !hero || reduced) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var W = 0, H = 0, nodes = [], pulses = [], raf = 0, lastDraw = 0;
    var pointer = { x: -9999, y: -9999, active: false };
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var visible = !document.hidden;

    function build() {
      var count = Math.max(22, Math.min(66, Math.round((W * H) / 24000)));
      nodes = [];
      for (var i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: 1 + Math.random() * 1.7,
          phase: Math.random() * Math.PI * 2
        });
      }
      pulses = [];
      for (var p = 0; p < 15; p++) {
        pulses.push({
          a: Math.floor(Math.random() * count),
          b: Math.floor(Math.random() * count),
          t: Math.random(),
          speed: 0.003 + Math.random() * 0.006
        });
      }
    }

    function resize() {
      var rect = hero.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      draw();
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      var linkDist = Math.min(148, Math.max(100, W * 0.09));
      var linkDist2 = linkDist * linkDist;

      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var a = nodes[i], b = nodes[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < linkDist2) {
            var alpha = (1 - Math.sqrt(d2) / linkDist) * 0.2;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = "rgba(82, 186, 255, " + alpha.toFixed(3) + ")";
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      for (var p = 0; p < pulses.length; p++) {
        var pulse = pulses[p];
        var pa = nodes[pulse.a], pb = nodes[pulse.b];
        if (!pa || !pb) continue;
        pulse.t += pulse.speed;
        if (pulse.t > 1) {
          pulse.t = 0;
          pulse.a = Math.floor(Math.random() * nodes.length);
          pulse.b = Math.floor(Math.random() * nodes.length);
          continue;
        }
        var px = pa.x + (pb.x - pa.x) * pulse.t;
        var py = pa.y + (pb.y - pa.y) * pulse.t;
        ctx.beginPath();
        ctx.arc(px, py, 1.7, 0, Math.PI * 2);
        ctx.fillStyle = p % 3 === 0 ? "rgba(63, 240, 192, 0.9)" : "rgba(0, 210, 255, 0.9)";
        ctx.shadowColor = p % 3 === 0 ? "rgba(63, 240, 192, 0.8)" : "rgba(0, 210, 255, 0.8)";
        ctx.shadowBlur = 7;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      var now = performance.now() * 0.001;
      for (var n = 0; n < nodes.length; n++) {
        var node = nodes[n];
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < -10) node.x = W + 10;
        if (node.x > W + 10) node.x = -10;
        if (node.y < -10) node.y = H + 10;
        if (node.y > H + 10) node.y = -10;

        if (pointer.active) {
          var pdx = node.x - pointer.x, pdy = node.y - pointer.y;
          var pd2 = pdx * pdx + pdy * pdy;
          if (pd2 < 12000 && pd2 > 0.01) {
            var force = (1 - pd2 / 12000) * 0.22;
            node.x += pdx * force * 0.06;
            node.y += pdy * force * 0.06;
          }
        }

        var pulseR = node.r + Math.sin(now * 1.8 + node.phase) * 0.45;
        ctx.beginPath();
        ctx.arc(node.x, node.y, Math.max(0.6, pulseR), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(135, 221, 255, 0.72)";
        ctx.shadowColor = "rgba(0, 180, 255, 0.65)";
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    function loop(now) {
      if (!visible) { raf = 0; return; }
      if (!lastDraw || now - lastDraw > 32) {
        lastDraw = now;
        draw();
      }
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (!raf && visible) raf = requestAnimationFrame(loop);
    }
    function stop() {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }

    hero.addEventListener("pointermove", function (event) {
      var rect = hero.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
    }, { passive: true });
    hero.addEventListener("pointerleave", function () {
      pointer.active = false;
      pointer.x = -9999;
      pointer.y = -9999;
    }, { passive: true });

    document.addEventListener("visibilitychange", function () {
      visible = !document.hidden;
      if (visible) start();
      else stop();
    });
    window.addEventListener("resize", resize);
    if ("ResizeObserver" in window) {
      new ResizeObserver(resize).observe(hero);
    }
    resize();
    start();
  }

  /* =======================================================
     Feature card spotlight
     ======================================================= */
  $$(".spotlight").forEach(function (card) {
    card.addEventListener("pointermove", function (event) {
      var rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", (event.clientX - rect.left) + "px");
      card.style.setProperty("--my", (event.clientY - rect.top) + "px");
    }, { passive: true });
  });

  /* =======================================================
     Quick start tabs
     ======================================================= */
  $$(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      $$(".tab").forEach(function (t) {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      $$(".tab-panel").forEach(function (panel) { panel.classList.remove("active"); });
      var panel = document.getElementById(tab.getAttribute("data-tab"));
      if (panel) panel.classList.add("active");
    });
  });

  /* =======================================================
     Command reference
     ======================================================= */
  var COMMANDS = [
    { cmd: "/easytier start <网络名称> <中继服务器> [密码]", copy: "/easytier start mc public.easytier.cn:11010 mypassword", desc: "启动 EasyTier 网络；兼容旧形式 /easytier <名称> <中继> [密码]", tag: "核心", cls: "tag-core" },
    { cmd: "/easytier stop", copy: "/easytier stop", desc: "停止当前 EasyTier 实例", tag: "核心", cls: "tag-core" },
    { cmd: "/easytier status", copy: "/easytier status", desc: "查看运行状态、网络名称、配置文件与虚拟 IP", tag: "状态", cls: "tag-state" },
    { cmd: "/easytier peer", copy: "/easytier peer", desc: "查看已连接节点：延迟、丢包、rx/tx、NAT 类型", tag: "状态", cls: "tag-state" },
    { cmd: "/easytier node", copy: "/easytier node", desc: "查看本节点信息", tag: "状态", cls: "tag-state" },
    { cmd: "/easytier route", copy: "/easytier route", desc: "查看虚拟网络路由表", tag: "网络", cls: "tag-net" },
    { cmd: "/easytier portforward add <tcp|udp> <端口> <虚拟IP> <MC端口>", copy: "/easytier portforward add tcp 25565 10.126.1.7 54321", desc: "添加端口转发规则，将虚拟端口映射到实际 Minecraft 端口", tag: "转发", cls: "tag-forward" },
    { cmd: "/easytier portforward remove <tcp|udp> <端口>", copy: "/easytier portforward remove tcp 25565", desc: "移除指定端口转发规则", tag: "转发", cls: "tag-forward" },
    { cmd: "/easytier portforward list", copy: "/easytier portforward list", desc: "列出当前端口转发规则", tag: "转发", cls: "tag-forward" },
    { cmd: "/easytier config list", copy: "/easytier config list", desc: "列出所有网络配置", tag: "配置", cls: "tag-config" },
    { cmd: "/easytier config use <网络名称>", copy: "/easytier config use mc", desc: "设置活动配置，供 reload 与自启动使用", tag: "配置", cls: "tag-config" },
    { cmd: "/easytier config save", copy: "/easytier config save", desc: "保存当前运行中的配置", tag: "配置", cls: "tag-config" },
    { cmd: "/easytier config delete <网络名称>", copy: "/easytier config delete friends", desc: "删除指定网络配置；运行中的配置需先停止", tag: "配置", cls: "tag-config" },
    { cmd: "/easytier autostart on [网络名称]", copy: "/easytier autostart on mc", desc: "开启服务器世界自启动，进入世界时自动拉起网络", tag: "自启动", cls: "tag-auto" },
    { cmd: "/easytier autostart off", copy: "/easytier autostart off", desc: "关闭服务器世界自启动", tag: "自启动", cls: "tag-auto" },
    { cmd: "/easytier autostart status", copy: "/easytier autostart status", desc: "查看自启动开关与当前世界的配置", tag: "自启动", cls: "tag-auto" },
    { cmd: "/easytier reload", copy: "/easytier reload", desc: "从 active.json 重新加载并启动活动配置", tag: "配置", cls: "tag-config" }
  ];

  var cmdList = $("#cmdList");
  var cmdSearch = $("#cmdSearch");
  var cmdFilters = $("#cmdFilters");
  var cmdCount = $("#cmdCount");
  var activeTag = "全部";

  function renderCommands() {
    if (!cmdList) return;
    var query = (cmdSearch ? cmdSearch.value : "").trim().toLowerCase();
    var visible = COMMANDS.filter(function (item) {
      var tagOk = activeTag === "全部" || item.tag === activeTag;
      var haystack = (item.cmd + " " + item.desc + " " + item.tag).toLowerCase();
      return tagOk && (!query || haystack.indexOf(query) !== -1);
    });
    if (cmdCount) cmdCount.textContent = visible.length + " COMMANDS";
    if (!visible.length) {
      cmdList.innerHTML = '<div class="cmd-empty">没有匹配的命令，试试别的关键词。</div>';
      return;
    }
    cmdList.innerHTML = visible.map(function (item, index) {
      return '<article class="cmd-item" style="animation-delay:' + (index * 0.018).toFixed(3) + 's">' +
        '<div class="cmd-main">' +
          '<div class="cmd-meta"><span class="cmd-tag ' + item.cls + '">' + esc(item.tag) + '</span><span class="cmd-desc">' + esc(item.desc) + '</span></div>' +
          '<code class="cmd-code">' + esc(item.cmd) + '</code>' +
        '</div>' +
        '<button class="cmd-copy" type="button" data-copy="' + esc(item.copy) + '" aria-label="复制命令"><svg class="icon"><use href="#i-copy"/></svg></button>' +
      '</article>';
    }).join("");
  }

  if (cmdSearch) {
    cmdSearch.addEventListener("input", renderCommands);
    cmdSearch.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        cmdSearch.value = "";
        renderCommands();
      }
    });
  }
  if (cmdFilters) {
    cmdFilters.addEventListener("click", function (event) {
      var btn = event.target.closest(".filter");
      if (!btn) return;
      activeTag = btn.getAttribute("data-tag");
      $$(".filter", cmdFilters).forEach(function (f) { f.classList.toggle("active", f === btn); });
      renderCommands();
    });
  }
  renderCommands();

  /* =======================================================
     FAQ accordion
     ======================================================= */
  $$(".faq-q").forEach(function (button) {
    button.addEventListener("click", function () {
      var item = button.closest(".faq-item");
      var open = item.classList.contains("open");
      $$(".faq-item").forEach(function (other) {
        other.classList.remove("open");
        var q = $(".faq-q", other);
        if (q) q.setAttribute("aria-expanded", "false");
      });
      if (!open) {
        item.classList.add("open");
        button.setAttribute("aria-expanded", "true");
      }
    });
  });

  /* =======================================================
     In-game UI simulation
     ======================================================= */
  var mc = {
    log: $("#mcLog"),
    badge: $("#mcBadge"),
    state: $("#mcState"),
    addr: $("#mcAddr"),
    toggle: $("#mcToggle"),
    statusBtn: $("#mcStatusBtn"),
    back: $("#mcBack"),
    configView: $("#mcConfigView"),
    statusView: $("#mcStatusView"),
    statusState: $("#mcStatusState"),
    statusIp: $("#mcStatusIp"),
    running: true,
    busy: false
  };

  function logClass(text) {
    if (text.indexOf("[ERROR]") !== -1) return "error";
    if (text.indexOf("[WARN]") !== -1) return "warn";
    if (text.indexOf("[INFO]") !== -1) return "info";
    return "sys";
  }

  function scrollLog() {
    if (mc.log) mc.log.scrollTop = mc.log.scrollHeight;
  }

  function trimLog() {
    if (!mc.log) return;
    while (mc.log.children.length > 80) mc.log.removeChild(mc.log.firstChild);
  }

  async function typeLogLine(text) {
    if (!mc.log) return;
    var line = document.createElement("div");
    line.className = "log-line " + logClass(text);
    var span = document.createElement("span");
    var caret = document.createElement("i");
    caret.className = "log-caret";
    line.appendChild(span);
    line.appendChild(caret);
    mc.log.appendChild(line);
    trimLog();
    scrollLog();

    if (reduced) {
      span.textContent = text;
      caret.remove();
      return;
    }
    for (var i = 0; i < text.length; i += 2) {
      span.textContent = text.slice(0, i + 2);
      scrollLog();
      await wait(7);
    }
    span.textContent = text;
    caret.remove();
    scrollLog();
  }

  async function logSequence(lines) {
    for (var i = 0; i < lines.length; i++) {
      await typeLogLine(lines[i]);
      await wait(80);
    }
  }

  function setMcRunning(running) {
    mc.running = running;
    if (mc.badge) {
      mc.badge.textContent = running ? "运行中" : "已停止";
      mc.badge.className = "mc-badge" + (running ? "" : " stopped");
    }
    if (mc.state) {
      mc.state.textContent = running ? "运行中" : "已停止";
      mc.state.className = running ? "" : "stopped";
    }
    if (mc.addr) mc.addr.textContent = running ? "10.126.1.7:25565" : "未获取虚拟IP";
    if (mc.statusState) {
      mc.statusState.textContent = running ? "运行中" : "已停止";
      mc.statusState.className = running ? "green" : "";
      mc.statusState.style.color = running ? "" : "var(--red)";
    }
    if (mc.statusIp) mc.statusIp.textContent = running ? "10.126.1.7" : "--";
    if (mc.toggle) {
      mc.toggle.textContent = running ? "停止" : "启动";
      mc.toggle.classList.toggle("stop", running);
    }
  }

  async function startMc() {
    if (mc.busy) return;
    mc.busy = true;
    if (mc.toggle) mc.toggle.disabled = true;
    if (mc.badge) { mc.badge.textContent = "启动中"; mc.badge.className = "mc-badge starting"; }
    if (mc.state) { mc.state.textContent = "启动中"; mc.state.className = "starting"; }
    await logSequence([
      "[INFO] 正在启动 EasyTier（异步）...",
      "[INFO] 二进制已就绪，跳过下载",
      "[INFO] 配置文件: mc.toml",
      "[INFO] 进程已启动，等待虚拟IP分配...",
      "[INFO] 当前虚拟IP: 10.126.1.7",
      "[INFO] 端口转发: tcp 25565 -> 10.126.1.7:54321",
      "[INFO] 好友连接地址: 10.126.1.7:25565"
    ]);
    setMcRunning(true);
    if (mc.toggle) mc.toggle.disabled = false;
    mc.busy = false;
    toast("EasyTier 已启动，虚拟 IP 10.126.1.7");
  }

  function stopMc() {
    if (mc.busy) return;
    mc.busy = true;
    if (mc.toggle) mc.toggle.disabled = true;
    setMcRunning(false);
    logSequence([
      "[INFO] 正在停止 EasyTier（异步）...",
      "[INFO] 端口转发规则已清理",
      "[INFO] EasyTier 已停止"
    ]).then(function () {
      mc.busy = false;
      if (mc.toggle) mc.toggle.disabled = false;
    });
    toast("EasyTier 已停止");
  }

  if (mc.toggle) {
    mc.toggle.addEventListener("click", function () {
      if (mc.running) stopMc();
      else startMc();
    });
  }
  if (mc.statusBtn) {
    mc.statusBtn.addEventListener("click", function () {
      if (mc.configView) mc.configView.hidden = true;
      if (mc.statusView) mc.statusView.hidden = false;
    });
  }
  if (mc.back) {
    mc.back.addEventListener("click", function () {
      if (mc.statusView) mc.statusView.hidden = true;
      if (mc.configView) mc.configView.hidden = false;
    });
  }

  if (mc.log) {
    setMcRunning(true);
    mc.busy = true;
    if (mc.toggle) mc.toggle.disabled = true;

    var playInitialLogs = function () {
      logSequence([
        "[INFO] 加载配置: mc.net",
        "[INFO] 检测到 EasyTier CLI: 已就绪",
        "[INFO] EasyTier 启动成功，等待虚拟IP分配...",
        "[INFO] 当前虚拟IP: 10.126.1.7",
        "[INFO] 端口转发: tcp 25565 -> 10.126.1.7:54321",
        "[INFO] 好友连接地址: 10.126.1.7:25565"
      ]).then(function () {
        mc.busy = false;
        if (mc.toggle) mc.toggle.disabled = false;
      });
    };

    var mcWindow = mc.log.closest(".mc-window");
    if ("IntersectionObserver" in window && !reduced && mcWindow) {
      var gameObserver = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          gameObserver.disconnect();
          setTimeout(playInitialLogs, 320);
        }
      }, { threshold: 0.18 });
      gameObserver.observe(mcWindow);
    } else {
      playInitialLogs();
    }
  }

  /* =======================================================
     Screenshot lightbox
     ======================================================= */
  var lightbox = $("#shotLightbox");
  var lightboxImg = $("#lightboxImg");
  var lightboxTitle = $("#lightboxTitle");
  var lightboxDesc = $("#lightboxDesc");
  var lastShotFocus = null;

  function openLightbox(trigger) {
    if (!lightbox || !lightboxImg) return;
    var sourceImg = $(".shot-frame img", trigger);
    lastShotFocus = trigger;
    lightboxImg.src = trigger.getAttribute("data-src") || "";
    lightboxImg.alt = sourceImg ? sourceImg.alt : "";
    if (lightboxTitle) lightboxTitle.textContent = trigger.getAttribute("data-title") || "";
    if (lightboxDesc) lightboxDesc.textContent = trigger.getAttribute("data-desc") || "";
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    var closeBtn = $(".lightbox-close", lightbox);
    if (closeBtn) closeBtn.focus();
  }

  function closeLightbox() {
    if (!lightbox || !lightbox.classList.contains("open")) return;
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lastShotFocus) lastShotFocus.focus();
  }

  $$("[data-shot]").forEach(function (trigger) {
    trigger.addEventListener("click", function () { openLightbox(trigger); });
  });
  if (lightbox) {
    lightbox.addEventListener("click", function (event) {
      if (event.target.closest("[data-close]") || event.target === lightbox) closeLightbox();
    });
  }
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeLightbox();
  });

  /* =======================================================
     Init
     ======================================================= */
  var year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());

  initHeroCanvas();
  updateScroll();
  window.addEventListener("load", updateScroll);
})();
