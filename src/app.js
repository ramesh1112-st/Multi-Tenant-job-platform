(function () {
  const STORAGE_KEY = "hireloop-platform-state-v1";
  const CHANNEL = "hireloop-realtime";
  const stages = ["Applied", "Screening", "Interview", "Offer", "Hired"];
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL) : null;

  const state = loadState();
  const ui = {
    tenantSelect: document.querySelector("#tenantSelect"),
    roleSelect: document.querySelector("#roleSelect"),
    workspaceLabel: document.querySelector("#workspaceLabel"),
    pageTitle: document.querySelector("#pageTitle"),
    activityFeed: document.querySelector("#activityFeed"),
    seedBtn: document.querySelector("#seedBtn"),
    views: {
      dashboard: document.querySelector("#dashboardView"),
      jobs: document.querySelector("#jobsView"),
      applications: document.querySelector("#applicationsView"),
      talent: document.querySelector("#talentView")
    }
  };

  const session = {
    tenantId: state.tenants[0].id,
    role: "admin",
    view: "dashboard"
  };

  init();

  function init() {
    renderTenantOptions();
    ui.roleSelect.value = session.role;
    ui.tenantSelect.addEventListener("change", () => {
      session.tenantId = ui.tenantSelect.value;
      announce("Workspace switched", `Viewing ${currentTenant().name}`);
      render();
    });
    ui.roleSelect.addEventListener("change", () => {
      session.role = ui.roleSelect.value;
      announce("Role changed", `Acting as ${titleCase(session.role)}`);
      render();
    });
    document.querySelectorAll(".nav-tabs button").forEach((button) => {
      button.addEventListener("click", () => {
        session.view = button.dataset.view;
        render();
      });
    });
    ui.seedBtn.addEventListener("click", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seedData()));
      location.reload();
    });
    if (channel) {
      channel.addEventListener("message", (event) => {
        if (event.data === "state-updated") {
          Object.assign(state, loadState());
          render();
        }
      });
    }
    render();
  }

  function render() {
    const tenant = currentTenant();
    ui.workspaceLabel.textContent = `${tenant.name} / ${titleCase(session.role)}`;
    ui.pageTitle.textContent = titleCase(session.view);
    document.querySelectorAll(".nav-tabs button").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === session.view);
    });
    Object.entries(ui.views).forEach(([name, view]) => view.classList.toggle("active", name === session.view));
    renderDashboard();
    renderJobs();
    renderApplications();
    renderTalent();
    renderActivity();
  }

  function renderDashboard() {
    const tenant = currentTenant();
    const jobs = tenant.jobs;
    const applications = tenant.applications;
    const openJobs = jobs.filter((job) => job.status === "Open").length;
    const hired = applications.filter((app) => app.stage === "Hired").length;
    const interviews = applications.filter((app) => app.stage === "Interview").length;
    const conversion = applications.length ? Math.round((hired / applications.length) * 100) : 0;

    ui.views.dashboard.innerHTML = `
      <section class="grid-4">
        ${metric("Open jobs", openJobs)}
        ${metric("Applications", applications.length)}
        ${metric("Interviews", interviews)}
        ${metric("Hire rate", `${conversion}%`)}
      </section>
      <section class="grid-2">
        <article class="panel">
          <div class="section-heading"><h2>Hiring Funnel</h2><p>Current tenant only</p></div>
          <div class="pipeline">${stages.map((stage) => renderStage(stage, applications)).join("")}</div>
        </article>
        <article class="panel">
          <div class="section-heading"><h2>Tenant Isolation</h2><p>Separate jobs, candidates, and activity</p></div>
          <div class="job-list">
            ${state.tenants.map((item) => `
              <div class="job-card">
                <header><strong>${escapeHtml(item.name)}</strong><span class="tag">${item.plan}</span></header>
                <p class="muted">${item.jobs.length} jobs, ${item.applications.length} applications</p>
              </div>
            `).join("")}
          </div>
        </article>
      </section>
    `;
  }

  function renderJobs() {
    const tenant = currentTenant();
    const canManage = session.role !== "candidate";
    const form = canManage ? `
      <article class="panel">
        <div class="section-heading"><h2>Create Job</h2><p>Published inside ${escapeHtml(tenant.name)}</p></div>
        ${document.querySelector("#jobFormTemplate").innerHTML}
      </article>
    ` : "";

    ui.views.jobs.innerHTML = `
      ${form}
      <section class="panel">
        <div class="section-heading"><h2>Job Board</h2><p>${tenant.jobs.length} tenant jobs</p></div>
        <div class="job-list">
          ${tenant.jobs.map((job) => renderJobCard(job, canManage)).join("") || empty("No jobs yet.")}
        </div>
      </section>
    `;

    const jobForm = ui.views.jobs.querySelector("#jobForm");
    if (jobForm) {
      jobForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(jobForm).entries());
        tenant.jobs.unshift({ id: id("job"), createdAt: Date.now(), ...data });
        announce("Job published", `${data.title} was added to ${tenant.name}`);
        persist();
        jobForm.reset();
        render();
      });
    }

    ui.views.jobs.querySelectorAll("[data-apply]").forEach((button) => {
      button.addEventListener("click", () => applyToJob(button.dataset.apply));
    });
    ui.views.jobs.querySelectorAll("[data-close]").forEach((button) => {
      button.addEventListener("click", () => updateJobStatus(button.dataset.close, "Closed"));
    });
    ui.views.jobs.querySelectorAll("[data-pause]").forEach((button) => {
      button.addEventListener("click", () => updateJobStatus(button.dataset.pause, "Paused"));
    });
    ui.views.jobs.querySelectorAll("[data-open]").forEach((button) => {
      button.addEventListener("click", () => updateJobStatus(button.dataset.open, "Open"));
    });
  }

  function renderApplications() {
    const tenant = currentTenant();
    ui.views.applications.innerHTML = `
      <section class="panel">
        <div class="section-heading"><h2>Application Pipeline</h2><p>Move candidates through stages</p></div>
        <div class="pipeline">${stages.map((stage) => renderStage(stage, tenant.applications, true)).join("")}</div>
      </section>
    `;
    ui.views.applications.querySelectorAll("[data-stage-app]").forEach((select) => {
      select.addEventListener("change", () => {
        const application = tenant.applications.find((app) => app.id === select.dataset.stageApp);
        application.stage = select.value;
        announce("Pipeline updated", `${application.candidateName} moved to ${application.stage}`);
        persist();
        render();
      });
    });
  }

  function renderTalent() {
    const tenant = currentTenant();
    const candidates = tenant.candidates;
    ui.views.talent.innerHTML = `
      <section class="panel">
        <div class="section-heading"><h2>Talent Pool</h2><p>Candidates available to this tenant</p></div>
        <div class="candidate-list">
          ${candidates.map((candidate) => `
            <article class="candidate-card">
              <header><strong>${escapeHtml(candidate.name)}</strong><span class="tag">${candidate.experience}</span></header>
              <p class="muted">${escapeHtml(candidate.title)} · ${escapeHtml(candidate.location)}</p>
              <div class="tag-row">${candidate.skills.map((skill) => `<span class="tag">${escapeHtml(skill)}</span>`).join("")}</div>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderActivity() {
    const tenant = currentTenant();
    ui.activityFeed.innerHTML = tenant.activity.slice(0, 12).map((item) => `
      <div class="activity-item">
        <strong>${escapeHtml(item.title)}</strong>
        <p class="muted">${escapeHtml(item.body)}</p>
        <time>${new Date(item.at).toLocaleString()}</time>
      </div>
    `).join("") || empty("No activity yet.");
  }

  function renderJobCard(job, canManage) {
    const statusClass = `status-${job.status.toLowerCase()}`;
    return `
      <article class="job-card">
        <header>
          <div>
            <h3>${escapeHtml(job.title)}</h3>
            <p class="muted">${escapeHtml(job.department)} · ${escapeHtml(job.location)}</p>
          </div>
          <span class="tag ${statusClass}">${escapeHtml(job.status)}</span>
        </header>
        <p>${escapeHtml(job.description)}</p>
        <div class="tag-row">
          <span class="tag">${escapeHtml(job.type)}</span>
          <span class="tag">${escapeHtml(job.salary)}</span>
          <span class="tag">${applicationCount(job.id)} applicants</span>
        </div>
        <div class="actions">
          ${session.role === "candidate" && job.status === "Open" ? `<button class="primary" data-apply="${job.id}" type="button">Apply</button>` : ""}
          ${canManage && job.status !== "Open" ? `<button class="secondary" data-open="${job.id}" type="button">Open</button>` : ""}
          ${canManage && job.status === "Open" ? `<button class="secondary" data-pause="${job.id}" type="button">Pause</button>` : ""}
          ${canManage && job.status !== "Closed" ? `<button class="danger" data-close="${job.id}" type="button">Close</button>` : ""}
        </div>
      </article>
    `;
  }

  function renderStage(stage, applications, editable) {
    const items = applications.filter((app) => app.stage === stage);
    return `
      <div class="stage">
        <h3>${stage}<span>${items.length}</span></h3>
        ${items.map((app) => `
          <div class="application-card">
            <strong>${escapeHtml(app.candidateName)}</strong>
            <span class="muted">${escapeHtml(jobTitle(app.jobId))}</span>
            ${editable ? `<select data-stage-app="${app.id}">${stages.map((option) => `<option ${option === app.stage ? "selected" : ""}>${option}</option>`).join("")}</select>` : ""}
          </div>
        `).join("") || `<p class="muted">No candidates</p>`}
      </div>
    `;
  }

  function applyToJob(jobId) {
    const tenant = currentTenant();
    const candidate = tenant.candidates[Math.floor(Math.random() * tenant.candidates.length)];
    const alreadyApplied = tenant.applications.some((app) => app.jobId === jobId && app.candidateId === candidate.id);
    if (alreadyApplied) {
      announce("Duplicate application blocked", `${candidate.name} already applied to ${jobTitle(jobId)}`);
      persist();
      render();
      return;
    }
    tenant.applications.unshift({
      id: id("app"),
      jobId,
      candidateId: candidate.id,
      candidateName: candidate.name,
      stage: "Applied",
      appliedAt: Date.now()
    });
    announce("Application received", `${candidate.name} applied to ${jobTitle(jobId)}`);
    persist();
    render();
  }

  function updateJobStatus(jobId, status) {
    const job = currentTenant().jobs.find((item) => item.id === jobId);
    job.status = status;
    announce("Job status changed", `${job.title} is now ${status}`);
    persist();
    render();
  }

  function currentTenant() {
    return state.tenants.find((tenant) => tenant.id === session.tenantId) || state.tenants[0];
  }

  function renderTenantOptions() {
    ui.tenantSelect.innerHTML = state.tenants.map((tenant) => `<option value="${tenant.id}">${escapeHtml(tenant.name)}</option>`).join("");
    ui.tenantSelect.value = session.tenantId;
  }

  function jobTitle(jobId) {
    const job = currentTenant().jobs.find((item) => item.id === jobId);
    return job ? job.title : "Archived job";
  }

  function applicationCount(jobId) {
    return currentTenant().applications.filter((app) => app.jobId === jobId).length;
  }

  function announce(title, body) {
    currentTenant().activity.unshift({ id: id("act"), title, body, at: Date.now() });
    currentTenant().activity = currentTenant().activity.slice(0, 40);
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (channel) channel.postMessage("state-updated");
  }

  function loadState() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      const seeded = seedData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    try {
      return JSON.parse(stored);
    } catch {
      return seedData();
    }
  }

  function seedData() {
    return {
      tenants: [
        tenant("tenant-acme", "Acme Cloud", "Scale", [
          job("job-1", "Platform Engineer", "Infrastructure", "Remote", "Full-time", "$135k - $165k", "Open", "Build reliable deployment systems for customer-facing cloud products."),
          job("job-2", "Product Designer", "Design", "New York", "Full-time", "$110k - $140k", "Open", "Design recruiter workflows, analytics screens, and candidate experiences."),
          job("job-3", "Data Analyst", "Revenue", "Austin", "Contract", "$70/hr", "Paused", "Create hiring reports and pipeline dashboards for leadership.")
        ]),
        tenant("tenant-nova", "Nova Health", "Enterprise", [
          job("job-4", "Clinical Operations Lead", "Operations", "Chicago", "Full-time", "$95k - $120k", "Open", "Coordinate patient operations hiring across regional teams."),
          job("job-5", "Security Engineer", "Security", "Remote", "Full-time", "$145k - $175k", "Open", "Protect healthcare workflows, audit access, and improve platform compliance.")
        ]),
        tenant("tenant-studio", "Studio Ember", "Starter", [
          job("job-6", "Motion Designer", "Creative", "Los Angeles", "Contract", "$85/hr", "Open", "Create launch visuals for brand films, social campaigns, and product stories.")
        ])
      ]
    };
  }

  function tenant(idValue, name, plan, jobs) {
    const candidates = [
      { id: idValue + "-c1", name: "Aarav Mehta", title: "Frontend Engineer", location: "Bengaluru", experience: "5 yrs", skills: ["React", "TypeScript", "Design Systems"] },
      { id: idValue + "-c2", name: "Maya Johnson", title: "Product Manager", location: "Remote", experience: "7 yrs", skills: ["Roadmaps", "Analytics", "Hiring"] },
      { id: idValue + "-c3", name: "Leah Chen", title: "Security Specialist", location: "Seattle", experience: "6 yrs", skills: ["SOC2", "Cloud", "Risk"] },
      { id: idValue + "-c4", name: "Rohan Iyer", title: "Data Analyst", location: "Pune", experience: "4 yrs", skills: ["SQL", "BI", "Forecasting"] }
    ];
    return {
      id: idValue,
      name,
      plan,
      jobs,
      candidates,
      applications: [
        { id: id("app"), jobId: jobs[0].id, candidateId: candidates[0].id, candidateName: candidates[0].name, stage: "Applied", appliedAt: Date.now() - 86400000 },
        { id: id("app"), jobId: jobs[0].id, candidateId: candidates[1].id, candidateName: candidates[1].name, stage: "Interview", appliedAt: Date.now() - 172800000 }
      ],
      activity: [
        { id: id("act"), title: "Workspace created", body: `${name} demo tenant is ready`, at: Date.now() - 240000 },
        { id: id("act"), title: "Initial applications imported", body: "Seed candidates were added to the hiring pipeline", at: Date.now() - 180000 }
      ]
    };
  }

  function job(idValue, title, department, location, type, salary, status, description) {
    return { id: idValue, title, department, location, type, salary, status, description, createdAt: Date.now() };
  }

  function metric(label, value) {
    return `<article class="metric"><strong>${label}</strong><span>${value}</span></article>`;
  }

  function empty(text) {
    return `<div class="empty">${text}</div>`;
  }

  function id(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
  }

  function titleCase(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }
})();
