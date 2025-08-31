// script.js — Nova UI glue (toasts, dropdown add/remove, stats & tables)
(() => {
  const API = {
    staff: "/api/staff",
    services: "/api/services",
    categories: "/api/categories",
    calls: "/api/calls",
    followups: "/api/followups",
    requests: "/api/requests",
    issues: "/api/issues",
    stats: "/api/stats",
  };

  // ---------- helpers ----------
  const $id = (id) => document.getElementById(id);
  async function jget(url) { const r = await fetch(url); if (!r.ok) throw new Error(await r.text()); return r.json(); }
  async function jpost(url, data) { const r = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(data) }); if (!r.ok) throw new Error(await r.text()); return r.json(); }
  async function jdel(url) { const r = await fetch(url, { method:"DELETE" }); if (!r.ok) throw new Error(await r.text()); return r.json(); }

  function toast(msg) {
    let el = $id("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99;display:none;padding:10px 14px;border-radius:12px;color:#fff;background:#e50914;box-shadow:0 8px 24px rgba(229,9,20,.35);font:600 13px/1 Inter,system-ui";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = "block";
    setTimeout(() => (el.style.display = "none"), 1600);
  }

  // ---------- dropdown helpers ----------
  function buildSelect(select, items, noun) {
    const prev = select.dataset.prevValue || select.value || "";
    select.innerHTML = "";
    items.forEach(i => {
      const op = document.createElement("option");
      op.value = i.name; op.textContent = i.name; op.dataset.id = i._id;
      select.appendChild(op);
    });
    const addOp = document.createElement("option");
    addOp.value = "__add__"+noun; addOp.textContent = "+ Add "+noun; addOp.style.color = "#ff6b6b"; select.appendChild(addOp);
    const remOp = document.createElement("option");
    remOp.value = "__remove__"+noun; remOp.textContent = "– Remove "+noun; remOp.style.color = "#ff6b6b"; select.appendChild(remOp);
    const hasPrev = [...select.options].some(o => o.value === prev);
    select.value = hasPrev ? prev : (select.options[0]?.value || "");
    select.dataset.prevValue = select.value;
  }

  function promptBox({ title, placeholder = "Name", options = [], mode = "add" }) {
    return new Promise(resolve => {
      const mask = document.createElement("div");
      mask.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1000;display:flex;align-items:center;justify-content:center;";
      const box = document.createElement("div");
      box.style.cssText = "width:min(92vw,420px);border-radius:16px;padding:18px;border:1px solid rgba(229,9,20,.4);background:linear-gradient(180deg,rgba(31,31,35,.98),rgba(18,18,22,.98));color:#fff;box-shadow:0 18px 48px rgba(0,0,0,.5)";
      box.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px">
          <div style="font-weight:800;letter-spacing:.3px;color:#ff5d5d">${title}</div>
          <button id="xClose" style="background:#212127;border:1px solid #34343b;color:#fff;border-radius:10px;padding:6px 10px;cursor:pointer">Close</button>
        </div>
        <div id="body"></div>
        <div style="display:flex;gap:10px;margin-top:14px;justify-content:flex-end">
          <button id="ok" style="background:linear-gradient(180deg,#ef4444,#a60711);border:1px solid rgba(229,9,20,.55);border-radius:12px;padding:8px 14px;font-weight:800">OK</button>
        </div>
      `;
      const body = box.querySelector("#body");
      let field;
      if (mode === "remove") {
        field = document.createElement("select");
        field.style.cssText = "width:100%;border-radius:12px;padding:12px 14px;background:#16161a;border:1px solid #2a2a31;color:#fff";
        options.forEach(o => { const op = document.createElement("option"); op.value = o._id; op.textContent = o.name; field.appendChild(op); });
        body.appendChild(field);
      } else {
        field = document.createElement("input");
        field.placeholder = placeholder;
        field.style.cssText = "width:100%;border-radius:12px;padding:12px 14px;background:#16161a;border:1px solid #2a2a31;color:#fff";
        body.appendChild(field);
        setTimeout(() => field.focus(), 30);
      }
      mask.appendChild(box);
      document.body.appendChild(mask);
      function close(out){ document.body.removeChild(mask); resolve(out); }
      box.querySelector("#xClose").onclick = () => close(null);
      box.querySelector("#ok").onclick = () => { close(mode === "remove" ? { id: field.value } : { name: (field.value||"").trim() }); };
    });
  }

  function wireActions(select, noun, listFn, addFn, remFn) {
    if (!select || select.dataset.wired) return;
    select.dataset.wired = "1";
    select.addEventListener("change", async () => {
      const v = select.value;
      const prev = select.dataset.prevValue || "";
      try {
        if (v === "__add__"+noun) {
          const ret = await promptBox({ title: `Add ${noun}`, placeholder: `${noun} name` });
          if (ret && ret.name) {
            await addFn(ret.name);
            const items = await listFn();
            buildSelect(select, items, noun);
            select.value = ret.name;
            select.dataset.prevValue = ret.name;
            toast(`${noun} added`);
          } else select.value = prev;
        } else if (v === "__remove__"+noun) {
          const items = await listFn();
          if (!items.length) { toast(`No ${noun}s to remove`); select.value = prev; return; }
          const choice = await promptBox({ title:`Remove ${noun}`, options: items, mode:"remove" });
          if (choice && choice.id) {
            await remFn(choice.id);
            const fresh = await listFn();
            buildSelect(select, fresh, noun);
            toast(`${noun} removed`);
            select.dataset.prevValue = select.value;
          } else select.value = prev;
        } else if (v.startsWith("__")) {
          select.value = prev; // guard
        } else {
          select.dataset.prevValue = v;
        }
      } catch (e) {
        console.error(e); toast("Error: "+e.message); select.value = prev;
      }
    });
  }

  // data funcs
  const listStaff = () => jget(API.staff);
  const addStaff = (name) => jpost(API.staff, { name });
  const removeStaff = (id) => jdel(`${API.staff}/${id}`);

  const listServices = () => jget(API.services);
  const addService = (name) => jpost(API.services, { name });
  const removeService = (id) => jdel(`${API.services}/${id}`);

  const listCategories = () => jget(API.categories);
  const addCategory = (name) => jpost(API.categories, { name });
  const removeCategory = (id) => jdel(`${API.categories}/${id}`);

  // ---------- Call Follow-Up ----------
  async function initCallFollowUp() {
    const personSel = $id("person-requested");
    const staffSel  = $id("followup-staff");
    const saveCallBtn = $id("save-call");
    const saveFUBtn   = $id("save-followup");

    if (!personSel && !staffSel) return;

    const staff = await listStaff();
    if (personSel) { buildSelect(personSel, staff, "person"); wireActions(personSel, "person", listStaff, addStaff, removeStaff); }
    if (staffSel)  { buildSelect(staffSel,  staff, "person"); wireActions(staffSel,  "person", listStaff, addStaff, removeStaff); }

    // default datetime now
    const dt = $id("call-datetime");
    if (dt && !dt.value) {
      const now = new Date();
      const local = new Date(now.getTime() - now.getTimezoneOffset()*60000).toISOString().slice(0,16);
      dt.value = local;
    }

    saveCallBtn?.addEventListener("click", async () => {
      if (personSel.value.startsWith("__")) return toast("Choose a valid person");
      const payload = {
        callerName: $id("caller-name")?.value || "",
        callerPhone: $id("caller-phone")?.value || "",
        datetime: $id("call-datetime")?.value || "",
        personRequested: personSel.value,
        notes: $id("call-notes")?.value || "",
        notifyEmail: $id("notify-email")?.checked || false,
        notifyWhatsApp: $id("notify-whatsapp")?.checked || false,
      };
      await jpost(API.calls, payload);
      toast("Call saved");
      loadStats().catch(()=>{});
    });

    saveFUBtn?.addEventListener("click", async () => {
      if (staffSel.value.startsWith("__")) return toast("Choose a valid staff");
      const payload = {
        status: $id("followup-status")?.value || "",
        dueDate: $id("followup-due")?.value || "",
        staff: staffSel.value,
        emailReminder: $id("followup-email")?.checked || false,
        waReminder: $id("followup-whatsapp")?.checked || false,
      };
      await jpost(API.followups, payload);
      toast("Follow-up saved");
      loadStats().catch(()=>{});
    });
  }

  // ---------- Customer Request ----------
  async function initCustomerReq() {
    const serviceSel = $id("cust-service");
    const saveBtn = $id("save-customer");
    const recentBody = $id("recent-requests-tbody");
    if (!serviceSel && !recentBody) return;

    const services = await listServices();
    if (serviceSel) { buildSelect(serviceSel, services, "service"); wireActions(serviceSel, "service", listServices, addService, removeService); }

    async function renderRecent() {
      if (!recentBody) return;
      const rows = await jget(API.requests);
      recentBody.innerHTML = rows.map(r => `
        <tr>
          <td class="px-4 py-3">${r.name||""}</td>
          <td class="px-4 py-3">${r.phone||""}</td>
          <td class="px-4 py-3">${r.email||""}</td>
          <td class="px-4 py-3">${r.service||""}</td>
          <td class="px-4 py-3">${r.notes||""}</td>
        </tr>
      `).join("");
    }
    renderRecent();

    saveBtn?.addEventListener("click", async () => {
      if (serviceSel && serviceSel.value.startsWith("__")) return toast("Choose a valid service");
      const payload = {
        name: $id("cust-name")?.value || "",
        phone: $id("cust-phone")?.value || "",
        email: $id("cust-email")?.value || "",
        service: serviceSel?.value || "",
        notes: $id("cust-notes")?.value || "",
      };
      await jpost(API.requests, payload);
      toast("Request saved");
      renderRecent();
    });
  }

  // ---------- Service Issue Tracker ----------
  async function initServiceTracker() {
    const catSel = $id("issue-category");
    const saveBtn = $id("save-issue");
    const tbody = $id("issues-tbody");
    if (!catSel && !tbody) return;

    const cats = await listCategories();
    if (catSel) { buildSelect(catSel, cats, "category"); wireActions(catSel, "category", listCategories, addCategory, removeCategory); }

    async function renderIssues() {
      if (!tbody) return;
      const rows = await jget(API.issues);
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td class="px-4 py-3">${r.customerName||""}</td>
          <td class="px-4 py-3">${r.phone||""}</td>
          <td class="px-4 py-3">${r.vehicleModel||""}</td>
          <td class="px-4 py-3">${r.category||""}</td>
          <td class="px-4 py-3">${r.priority||""}</td>
          <td class="px-4 py-3">${r.dueDate? new Date(r.dueDate).toLocaleDateString(): ""}</td>
          <td class="px-4 py-3">${r.status||""}</td>
        </tr>
      `).join("");
    }
    renderIssues();

    saveBtn?.addEventListener("click", async () => {
      if (catSel && catSel.value.startsWith("__")) return toast("Choose a valid category");
      const payload = {
        customerName: $id("cust-name")?.value || "",
        phone: $id("cust-phone")?.value || "",
        vehicleModel: $id("vehicle-model")?.value || "",
        category: catSel?.value || "",
        description: $id("issue-desc")?.value || "",
        priority: $id("issue-priority")?.value || "",
        staff: $id("issue-staff")?.value || "",
        dueDate: $id("issue-due")?.value || "",
      };
      await jpost(API.issues, payload);
      toast("Issue saved");
      renderIssues();
    });
  }

  // ---------- KPIs / Charts ----------
  async function loadStats() {
    const s = await jget(API.stats);
    if ($id("kpi-today")) $id("kpi-today").textContent = s.todaysCalls ?? 0;
    if ($id("kpi-open")) $id("kpi-open").textContent = s.openFollowups ?? 0;
    if ($id("kpi-completion")) $id("kpi-completion").textContent = (s.completionRate??0) + "%";
    if ($id("kpi-frequent")) $id("kpi-frequent").textContent = (s.frequentCallers||[]).length;

    if (window.Chart) {
      const staffLabels = (s.callsPerStaff||[]).map(x=>x.label);
      const staffCounts = (s.callsPerStaff||[]).map(x=>x.count);

      const ctxA = document.getElementById("chart-calls-per-staff")?.getContext("2d");
      if (ctxA) {
        if (window.__chartA) window.__chartA.destroy();
        window.__chartA = new Chart(ctxA, {
          type: "bar",
          data: { labels: staffLabels, datasets: [{ label:"Calls", data: staffCounts, backgroundColor: "rgba(229,9,20,0.6)" }] },
          options: { responsive: true, scales: { y: { beginAtZero: true } } },
        });
      }
      const ctxB = document.getElementById("chart-completion-rate")?.getContext("2d");
      if (ctxB) {
        if (window.__chartB) window.__chartB.destroy();
        const completed = s.completionRate || 0;
        window.__chartB = new Chart(ctxB, {
          type: "doughnut",
          data: { labels:["Completed","Open"], datasets:[{ data:[completed, 100-completed], backgroundColor:["rgba(229,9,20,0.7)","rgba(255,255,255,0.15)"] }] },
          options: { responsive: true },
        });
      }
    }

    const freqBody = $id("frequent-callers-tbody");
    if (freqBody && Array.isArray(s.frequentCallers)) {
      freqBody.innerHTML = s.frequentCallers.map(r => `
        <tr>
          <td class="px-4 py-3">${r.callerName||""}</td>
          <td class="px-4 py-3">${r.callerPhone||""}</td>
          <td class="px-4 py-3">${r.times||0}</td>
          <td class="px-4 py-3">${r.lastCall? new Date(r.lastCall).toLocaleString() : ""}</td>
        </tr>
      `).join("");
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await Promise.all([initCallFollowUp(), initCustomerReq(), initServiceTracker()]);
      if ($id("kpi-today") || $id("chart-calls-per-staff")) loadStats().catch(()=>{});
    } catch (e) { console.error(e); toast("Init error: "+e.message); }
  });
})();
