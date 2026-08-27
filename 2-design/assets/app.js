/* 宠途空运 · 原型交互 */
(function () {
  const RI = "https://cdn.jsdelivr.net/npm/remixicon@4.5.0/fonts/remixicon.css";

  /**
   * 底部 Tab 图标 —— 换图只改这里，或直接替换 assets/tab/ 里的同名文件。
   *
   * 目录：wx-project/2-design/assets/tab/
   *   tab-home.svg          首页未选中
   *   tab-home-active.svg   首页选中
   *   tab-order.svg         订单未选中
   *   tab-order-active.svg  订单选中
   *   tab-me.svg            我的未选中
   *   tab-me-active.svg     我的选中
   *
   * 把新图标（png / svg / jpg）放进该文件夹，文件名保持一致即可；
   * 若要用别的文件名，改下面 idle / active 两个字段。
   */
  const TAB_ICONS = [
    { id: "home", href: "home.html", label: "首页", idle: "tab-home.svg", active: "tab-home-active.svg" },
    { id: "orders", href: "orders.html", label: "订单", idle: "tab-order.svg", active: "tab-order-active.svg" },
    { id: "me", href: "me.html", label: "我的", idle: "tab-me.svg", active: "tab-me-active.svg" }
  ];

  function ensureCss() {
    if (!document.querySelector('link[href*="remixicon"]')) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = RI;
      document.head.appendChild(l);
    }
    const cssHref = document.body.dataset.css || relative("assets/app.css");
    if (!document.querySelector(`link[href="${cssHref}"]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = cssHref;
      document.head.appendChild(l);
    }
  }

  function relative(path) {
    const inPages = /\/pages\/[^/]+\.html$/.test(location.pathname) || location.pathname.endsWith("/pages/");
    return inPages ? "../" + path : path;
  }

  function pageFile() {
    return (location.pathname.split("/").pop() || "home.html").split("?")[0];
  }

  function bootGallery() {
    document.querySelectorAll(".filters button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".filters button").forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
        const f = btn.dataset.filter;
        document.querySelectorAll(".shot").forEach((s) => {
          s.style.display = !f || s.dataset.group === f ? "" : "none";
        });
      });
    });
  }

  function bootPhone() {
    if (window.self !== window.top) document.body.classList.add("in-iframe");

    const title = document.body.dataset.title || "";
    const tab = document.body.dataset.tab || "";
    const back = document.body.dataset.back;
    const light = document.body.dataset.nav === "light";
    const extraSlot = document.getElementById("navExtra");
    const extra = extraSlot ? extraSlot.innerHTML : document.body.dataset.extra || "";
    extraSlot?.remove();
    const app = document.getElementById("app");
    if (!app) return;

    const studio = document.createElement("div");
    studio.className = "studio";
    studio.innerHTML = `
      <div class="device">
        <div class="side-btn"></div>
        <div class="device-screen ${light ? "overlay-nav" : ""}">
          <div class="island"></div>
          <div class="wx-status ${light ? "light" : ""}">
            <div class="wx-time">9:41</div>
            <div class="status-right">
              ${light ? extra : ""}
              <div class="capsule">
                <span>···</span>
                <span>○</span>
              </div>
            </div>
          </div>
          <header class="wx-nav ${light ? "light" : ""}">
            ${tab ? `<div style="width:44px"></div>` : `<div class="back" data-go="${back && back !== "none" ? back : "home.html"}" aria-label="返回"><span class="chev">&lt;</span></div>`}
            <div class="title">${title}</div>
            <div class="nav-extra">${light ? "" : extra}</div>
          </header>
          <main class="screen"></main>
          ${tab ? tabbar(tab) : ""}
          <div class="home-indicator"></div>
          <div class="mask" id="mask"></div>
          <div class="sheet" id="sheet"></div>
          <div class="modal" id="modal"></div>
          <div class="toast" id="toast"></div>
        </div>
      </div>
    `;
    const screen = studio.querySelector("main.screen");
    screen.appendChild(app);
    document.body.prepend(studio);

    bindNav(studio);
    bindGo(document);
    bindSwitches();
    pageHooks();
  }

  function tabbar(active) {
    const base = relative("assets/tab/");
    return `<nav class="tabbar">${TAB_ICONS
      .map((it) => {
        const src = base + (it.id === active ? it.active : it.idle);
        return `<a href="${it.href}" class="${it.id === active ? "on" : ""}">
        <img class="tab-ico" src="${src}" alt="${it.label}" />
        ${it.label}
      </a>`;
      })
      .join("")}</nav>`;
  }

  function bindNav(root) {
    root.querySelectorAll(".back").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        location.href = el.getAttribute("data-go") || "home.html";
      });
    });
  }

  function bindGo(root) {
    root.addEventListener("click", (e) => {
      const t = e.target.closest("[data-go]");
      if (!t || t.classList.contains("back")) return;
      const to = t.getAttribute("data-go");
      if (!to) return;
      if (to.startsWith("toast:")) {
        toast(to.slice(6));
        return;
      }
      if (to.startsWith("sheet:")) {
        openNamedSheet(to.slice(6));
        return;
      }
      location.href = to;
    });
  }

  function bindSwitches() {
    document.querySelectorAll(".switch").forEach((el) => {
      el.addEventListener("click", () => {
        el.classList.toggle("on");
        el.dispatchEvent(new CustomEvent("change", { bubbles: true }));
      });
    });
  }

  window.toast = function (msg, ms) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(window.__tt);
    window.__tt = setTimeout(() => el.classList.remove("show"), ms || 1600);
  };

  window.openSheet = function (title, items, onPick) {
    const sheet = document.getElementById("sheet");
    const mask = document.getElementById("mask");
    sheet.innerHTML = `<div class="grab"></div><div class="h2" style="margin-bottom:8px">${title}</div>` +
      items
        .map(
          (it, i) =>
            `<div class="sheet-item" data-i="${i}"><span>${it.label}</span><span class="faint">${it.sub || ""}</span></div>`
        )
        .join("");
    mask.classList.add("show");
    requestAnimationFrame(() => sheet.classList.add("show"));
    const close = () => {
      sheet.classList.remove("show");
      mask.classList.remove("show");
    };
    mask.onclick = close;
    sheet.querySelectorAll(".sheet-item").forEach((el) => {
      el.onclick = () => {
        onPick && onPick(items[+el.dataset.i], +el.dataset.i);
        close();
      };
    });
  };

  window.openModal = function ({ title, body, ok, cancel, onOk }) {
    const modal = document.getElementById("modal");
    const mask = document.getElementById("mask");
    modal.innerHTML = `<h3>${title}</h3><p>${body || ""}</p>
      <div class="acts">
        <button class="btn btn-ghost" id="m-cancel">${cancel || "取消"}</button>
        <button class="btn" id="m-ok">${ok || "确定"}</button>
      </div>`;
    modal.classList.add("show");
    mask.classList.add("show");
    const close = () => {
      modal.classList.remove("show");
      mask.classList.remove("show");
    };
    modal.querySelector("#m-cancel").onclick = close;
    modal.querySelector("#m-ok").onclick = () => {
      close();
      onOk && onOk();
    };
    mask.onclick = close;
  };

  function openNamedSheet(name) {
    if (name === "from" || name === "to") {
      const cities = ["杭州", "北京", "上海", "广州", "深圳", "成都", "武汉", "西安", "南京", "重庆"];
      openSheet(name === "from" ? "选择出发城市" : "选择到达城市", cities.map((c) => ({ label: c })), (it) => {
        const el = document.querySelector(`[data-city="${name}"]`);
        if (el) el.textContent = it.label;
      });
    }
    if (name === "species") {
      openSheet("选择种类", [{ label: "猫" }, { label: "狗" }, { label: "其他（以承运方可运为准）" }], (it) => {
        const el = document.getElementById("speciesVal");
        if (el) el.textContent = it.label;
      });
    }
    if (name === "breed") {
      const sp = (document.getElementById("speciesVal") || {}).textContent || "猫";
      const list = sp.includes("狗")
        ? ["柯基", "金毛", "泰迪", "边牧", "比熊"]
        : ["英国短毛猫", "布偶", "中华田园猫", "美短", "暹罗"];
      openSheet("选择品种", list.map((c) => ({ label: c })), (it) => {
        const el = document.getElementById("breedVal");
        if (el) el.textContent = it.label;
      });
    }
    if (name === "date") {
      openSheet(
        "上门取件日",
        ["08月28日 周四", "08月29日 周五", "08月30日 周六", "08月31日 周日", "09月01日 周一"].map((c) => ({
          label: c,
          sub: "航班由承运方安排"
        })),
        (it) => {
          const el = document.getElementById("dateVal");
          if (el) el.textContent = it.label;
        }
      );
    }
  }

  function pageHooks() {
    const file = pageFile();

    document.querySelectorAll(".tab[data-filter]").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab[data-filter]").forEach((t) => t.classList.remove("on"));
        tab.classList.add("on");
        const f = tab.dataset.filter;
        document.querySelectorAll("[data-status]").forEach((card) => {
          card.style.display = f === "all" || card.dataset.status === f ? "" : "none";
        });
      });
    });

    const swap = document.getElementById("swapCity");
    if (swap) {
      swap.addEventListener("click", () => {
        const a = document.querySelector('[data-city="from"]');
        const b = document.querySelector('[data-city="to"]');
        if (!a || !b) return;
        const t = a.textContent;
        a.textContent = b.textContent;
        b.textContent = t;
      });
    }

    const goBook = document.getElementById("goBook");
    if (goBook) {
      goBook.addEventListener("click", () => {
        const from = document.querySelector('[data-city="from"]')?.textContent;
        const to = document.querySelector('[data-city="to"]')?.textContent;
        if (!from || from.includes("请选择") || !to || to.includes("请选择")) {
          toast("请先选择出发和到达城市");
          return;
        }
        if (from === to) {
          toast("出发与到达不能相同");
          return;
        }
        location.href = "addresses.html";
      });
    }

    document.querySelectorAll(".stepper").forEach((st) => {
      const val = st.querySelector("b");
      st.querySelector(".minus")?.addEventListener("click", () => {
        let n = parseFloat(val.textContent) || 0;
        n = Math.max(0.5, +(n - 0.5).toFixed(1));
        val.textContent = n;
      });
      st.querySelector(".plus")?.addEventListener("click", () => {
        let n = parseFloat(val.textContent) || 0;
        n = Math.min(40, +(n + 0.5).toFixed(1));
        val.textContent = n;
      });
    });

    const quoteBtn = document.getElementById("doQuote");
    if (quoteBtn) {
      quoteBtn.addEventListener("click", () => {
        quoteBtn.textContent = "询价中…";
        setTimeout(() => (location.href = "quote-result.html"), 700);
      });
    }

    if (file === "quote-result.html") bindQuote();
    if (file === "pay.html") bindPay();
    if (file === "fulfill.html") bindFulfill();
    if (file === "cities.html") bindCities();
    if (file === "pet-edit.html") {
      document.getElementById("savePet")?.addEventListener("click", () => {
        toast("已保存");
        setTimeout(() => (location.href = "pets.html"), 700);
      });
    }
    if (file === "me-addresses.html") bindAddrForm();
    if (file === "docs.html") bindDocs();
    if (file === "invoice.html") bindInvoice();
    if (file === "order-detail.html") bindOrderDetail();
    if (file === "surcharge.html") {
      document.getElementById("paySur")?.addEventListener("click", () => {
        toast("补差支付成功");
        setTimeout(() => (location.href = "order-detail.html"), 800);
      });
    }
    document.getElementById("copyWaybill")?.addEventListener("click", () => toast("运单号已复制"));
    document.getElementById("pasteAddr")?.addEventListener("click", () => {
      document.getElementById("sName").value = "陈七";
      document.getElementById("sPhone").value = "13500135005";
      document.getElementById("sDist").value = "西湖区";
      document.getElementById("sDetail").value = "文三路 478 号华星时代广场 12 楼";
      toast("已识别寄件地址");
    });
    document.getElementById("saveAddrBook")?.addEventListener("click", () => toast("已保存到地址簿"));
    document.getElementById("logout")?.addEventListener("click", () => {
      openModal({
        title: "退出登录",
        body: "退出后需重新授权微信才能查看订单。",
        ok: "退出",
        onOk: () => {
          toast("已退出");
          setTimeout(() => (location.href = "me.html"), 600);
        }
      });
    });
  }

  function bindQuote() {
    const state = { crate: false, crateIdx: 1, agency: false, insure: false, declared: 3000 };
    const crates = [
      { name: "小型航空箱 55cm", price: 268 },
      { name: "中型航空箱 68cm", price: 388 },
      { name: "大型航空箱 81cm", price: 528 }
    ];
    const freight = 1580;

    function render() {
      let extra = 0;
      if (state.crate) extra += crates[state.crateIdx].price;
      if (state.agency) extra += 200;
      if (state.insure) extra += Math.max(1, Math.round(state.declared * 0.01));
      document.getElementById("totalYuan").textContent = (freight + extra).toFixed(2);
      const bar = document.getElementById("totalYuanBar");
      if (bar) bar.textContent = (freight + extra).toFixed(2);
      document.getElementById("crateBox").classList.toggle("hide", !state.crate);
      document.getElementById("insureBox").classList.toggle("hide", !state.insure);
      document.getElementById("cratePrice").textContent = state.crate ? "¥" + crates[state.crateIdx].price : "自备";
      document.getElementById("agencyPrice").textContent = state.agency ? "¥200" : "自备证明";
      document.getElementById("insurePrice").textContent = state.insure ? "已选" : "不保价";
    }

    document.getElementById("swCrate")?.addEventListener("change", (e) => {
      state.crate = e.target.classList.contains("on");
      render();
    });
    document.getElementById("swAgency")?.addEventListener("change", (e) => {
      state.agency = e.target.classList.contains("on");
      render();
    });
    document.getElementById("swInsure")?.addEventListener("change", (e) => {
      state.insure = e.target.classList.contains("on");
      render();
    });
    document.querySelectorAll(".crate-opt span").forEach((el, i) => {
      el.addEventListener("click", () => {
        document.querySelectorAll(".crate-opt span").forEach((x) => x.classList.remove("on"));
        el.classList.add("on");
        state.crateIdx = i;
        render();
      });
    });
    document.getElementById("declared")?.addEventListener("input", (e) => {
      state.declared = Number(e.target.value) || 0;
      render();
    });
    render();
  }

  function bindPay() {
    const agree = document.getElementById("agree");
    document.getElementById("doPay")?.addEventListener("click", () => {
      if (!agree?.classList.contains("on")) {
        toast("请先同意运输服务协议");
        return;
      }
      const btn = document.getElementById("doPay");
      btn.textContent = "支付中…";
      setTimeout(() => {
        toast("支付成功，正在向承运方下单");
        setTimeout(() => (location.href = "order-detail.html"), 900);
      }, 600);
    });
    document.getElementById("authPhone")?.addEventListener("click", (e) => {
      e.currentTarget.textContent = "已授权 135****5005";
      e.currentTarget.classList.add("btn-ghost");
      toast("手机号已授权");
    });
  }

  function bindFulfill() {
    document.querySelectorAll(".add-ph").forEach((el) => {
      el.addEventListener("click", () => {
        const img = document.createElement("img");
        img.className = "ph";
        img.src =
          el.dataset.kind === "crate"
            ? "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=300&q=80"
            : "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=300&q=80";
        el.parentElement.insertBefore(img, el);
        toast("已添加示例照片");
      });
    });
  }

  function bindCities() {
    document.querySelectorAll(".city-grid").forEach((grid) => {
      grid.addEventListener("click", (e) => {
        const c = e.target.closest(".city");
        if (!c) return;
        grid.querySelectorAll(".city").forEach((x) => x.classList.remove("on"));
        c.classList.add("on");
      });
    });
  }

  function bindAddrForm() {
    const form = document.getElementById("addrForm");
    document.getElementById("openAddrForm")?.addEventListener("click", () => form?.classList.remove("hide"));
    document.getElementById("saveNewAddr")?.addEventListener("click", () => {
      toast("地址已保存");
      form?.classList.add("hide");
    });
  }

  function bindDocs() {
    document.getElementById("uploadDoc")?.addEventListener("click", () => {
      const title = document.getElementById("docTitle")?.value || "检疫证明";
      toast("已上传「" + title + "」");
    });
    document.querySelectorAll("[data-del-doc]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        el.closest(".card")?.remove();
        toast("已删除");
      });
    });
  }

  function bindInvoice() {
    document.querySelectorAll("[data-save-inv]").forEach((el) => {
      el.addEventListener("click", () => toast("抬头已保存"));
    });
    document.querySelectorAll("[data-issue-inv]").forEach((el) => {
      el.addEventListener("click", () => toast("已提交开具，电子票将发至邮箱"));
    });
  }

  function bindOrderDetail() {
    document.getElementById("cancelOrder")?.addEventListener("click", () => {
      openModal({
        title: "确认取消",
        body: "未生成运单全额退；已下单未揽收将扣除 ¥50 手续费。已揽收不可退。",
        ok: "申请取消",
        onOk: () => toast("已提交取消申请")
      });
    });
  }

  ensureCss();
  if (document.body.dataset.gallery) bootGallery();
  else bootPhone();
})();
