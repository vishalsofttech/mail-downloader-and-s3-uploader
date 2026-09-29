// S3 Migration Explorer Client Application
(function () {
  const state = {
    databases: [],
    currentDb: "",
    searchQuery: "",
    statusFilter: "all",
    currentPage: 1,
    pageLimit: 25,
    totalPages: 1,
    totalRecords: 0,
    currentFiles: [],
    autoRefreshTimer: null,
    searchDebounceTimer: null,
  };

  // DOM Elements
  const dbSelect = document.getElementById("dbSelect");
  const autoRefreshToggle = document.getElementById("autoRefreshToggle");
  const refreshBtn = document.getElementById("refreshBtn");
  const searchInput = document.getElementById("searchInput");
  const clearSearchBtn = document.getElementById("clearSearchBtn");
  const filterPills = document.getElementById("filterPills");
  const limitSelect = document.getElementById("limitSelect");
  const tableBody = document.getElementById("tableBody");
  const paginationInfo = document.getElementById("paginationInfo");
  const pageIndicator = document.getElementById("pageIndicator");
  const firstPageBtn = document.getElementById("firstPageBtn");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const lastPageBtn = document.getElementById("lastPageBtn");

  // Stats DOM
  const statTotal = document.getElementById("statTotal");
  const statTotalSize = document.getElementById("statTotalSize");
  const statUploaded = document.getElementById("statUploaded");
  const statUploadedSize = document.getElementById("statUploadedSize");
  const statProgress = document.getElementById("statProgress");
  const statPending = document.getElementById("statPending");
  const statUploading = document.getElementById("statUploading");
  const statFailed = document.getElementById("statFailed");
  const progressBarFill = document.getElementById("progressBarFill");
  const progressLabel = document.getElementById("progressLabel");
  const progressBytesLabel = document.getElementById("progressBytesLabel");

  // Modal DOM
  const detailModal = document.getElementById("detailModal");
  const modalBody = document.getElementById("modalBody");
  const modalCloseBtn = document.getElementById("modalCloseBtn");
  const modalCloseBtn2 = document.getElementById("modalCloseBtn2");
  const toast = document.getElementById("toast");

  // Mail Modal DOM
  const mailModal = document.getElementById("mailModal");
  const mailSubjectTitle = document.getElementById("mailSubjectTitle");
  const mailTabGroup = document.getElementById("mailTabGroup");
  const mailThemeToggleBtn = document.getElementById("mailThemeToggleBtn");
  const mailThemeIcon = document.getElementById("mailThemeIcon");
  const mailDownloadEmlBtn = document.getElementById("mailDownloadEmlBtn");
  const mailS3DirectBtn = document.getElementById("mailS3DirectBtn");
  const mailModalCloseBtn = document.getElementById("mailModalCloseBtn");
  const mailModalCloseBtn2 = document.getElementById("mailModalCloseBtn2");
  const mailLoadingState = document.getElementById("mailLoadingState");
  const mailLoadingSubtext = document.getElementById("mailLoadingSubtext");
  const mailErrorState = document.getElementById("mailErrorState");
  const mailErrorMessage = document.getElementById("mailErrorMessage");
  const mailErrorDetail = document.getElementById("mailErrorDetail");
  const mailRetryBtn = document.getElementById("mailRetryBtn");
  const mailContentView = document.getElementById("mailContentView");
  const mailSenderAvatar = document.getElementById("mailSenderAvatar");
  const mailFromName = document.getElementById("mailFromName");
  const mailFromEmail = document.getElementById("mailFromEmail");
  const mailToList = document.getElementById("mailToList");
  const mailCcRow = document.getElementById("mailCcRow");
  const mailCcList = document.getElementById("mailCcList");
  const mailDateFull = document.getElementById("mailDateFull");
  const mailSourceChip = document.getElementById("mailSourceChip");
  const mailS3KeyText = document.getElementById("mailS3KeyText");
  const mailCopyS3KeyBtn = document.getElementById("mailCopyS3KeyBtn");
  const mailAttachmentsCard = document.getElementById("mailAttachmentsCard");
  const attachmentsCountLabel = document.getElementById("attachmentsCountLabel");
  const mailAttachmentsGrid = document.getElementById("mailAttachmentsGrid");
  const mailHtmlPanel = document.getElementById("mailHtmlPanel");
  const mailHtmlIframe = document.getElementById("mailHtmlIframe");
  const mailTextPanel = document.getElementById("mailTextPanel");
  const mailTextContent = document.getElementById("mailTextContent");
  const mailHeadersPanel = document.getElementById("mailHeadersPanel");
  const mailHeadersTable = document.getElementById("mailHeadersTable");
  const mailFooterMeta = document.getElementById("mailFooterMeta");

  // Mail Viewer State
  const mailState = {
    activeId: null,
    activeData: null,
    activeTab: "html",
    isDarkTheme: false,
  };

  // Utilities
  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let val = Number(bytes);
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    return `${val.toFixed(2)} ${units[i]}`;
  }

  function formatDate(isoStr) {
    if (!isoStr) return "--";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return isoStr;
    }
  }

  function escapeHtml(text) {
    if (!text) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(msg = "Copied to clipboard!") {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast();
    }).catch(() => {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      showToast();
    });
  }

  // API Calls
  async function fetchDatabases() {
    try {
      const res = await fetch("/api/databases");
      if (!res.ok) throw new Error("Failed to load databases");
      const data = await res.json();
      state.databases = data.databases || [];
      renderDatabaseSelect();
    } catch (err) {
      console.error(err);
      tableBody.innerHTML = `<tr><td colspan="7" class="empty-cell">Error loading databases: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderDatabaseSelect() {
    dbSelect.innerHTML = "";
    if (state.databases.length === 0) {
      dbSelect.innerHTML = `<option value="">No databases found</option>`;
      return;
    }

    state.databases.forEach((db) => {
      const opt = document.createElement("option");
      opt.value = db.id;
      const typeTag = db.type === "active" ? "[ACTIVE]" : "[COMPLETED]";
      const countTag = db.totalRecords ? `${db.totalRecords.toLocaleString()} files` : "0 files";
      const sizeTag = formatBytes(db.sizeBytes);
      opt.textContent = `${typeTag} ${db.filename} (${countTag} - ${sizeTag})`;
      if (db.isDefault && !state.currentDb) {
        state.currentDb = db.id;
      }
      dbSelect.appendChild(opt);
    });

    if (state.currentDb) {
      dbSelect.value = state.currentDb;
    } else {
      state.currentDb = state.databases[0].id;
      dbSelect.value = state.currentDb;
    }

    // Trigger initial data fetch
    refreshAll();
  }

  async function fetchStats() {
    if (!state.currentDb) return;
    try {
      const res = await fetch(`/api/stats?db=${encodeURIComponent(state.currentDb)}`);
      if (!res.ok) throw new Error("Failed to load stats");
      const s = await res.json();

      statTotal.textContent = (s.total || 0).toLocaleString();
      statTotalSize.textContent = formatBytes(s.total_bytes);

      statUploaded.textContent = (s.uploaded || 0).toLocaleString();
      statUploadedSize.textContent = formatBytes(s.uploaded_bytes);
      statProgress.textContent = `${s.progress_percent || 0}%`;

      statPending.textContent = (s.pending || 0).toLocaleString();
      statUploading.textContent = (s.uploading || 0).toLocaleString();
      statFailed.textContent = (s.failed || 0).toLocaleString();

      progressBarFill.style.width = `${Math.min(100, Math.max(0, s.progress_percent || 0))}%`;
      progressLabel.textContent = `Migration Progress: ${s.progress_percent || 0}% (${(s.uploaded || 0).toLocaleString()} / ${(s.total || 0).toLocaleString()} files)`;
      progressBytesLabel.textContent = `${formatBytes(s.uploaded_bytes)} / ${formatBytes(s.total_bytes)}`;
    } catch (err) {
      console.error("Stats error:", err);
    }
  }

  async function fetchFiles() {
    if (!state.currentDb) return;

    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="loading-cell">
          <div class="spinner"></div>
          <span>Searching database...</span>
        </td>
      </tr>
    `;

    try {
      const params = new URLSearchParams({
        db: state.currentDb,
        search: state.searchQuery,
        status: state.statusFilter,
        page: state.currentPage,
        limit: state.pageLimit,
      });

      const res = await fetch(`/api/files?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch files");
      const data = await res.json();

      state.currentFiles = data.files || [];
      state.totalRecords = data.total || 0;
      state.totalPages = data.totalPages || 1;
      state.currentPage = data.page || 1;

      renderTable();
      renderPagination();
    } catch (err) {
      console.error("Files error:", err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-cell">
            <span style="color: var(--status-failed-text);">Failed to load files: ${escapeHtml(err.message)}</span>
          </td>
        </tr>
      `;
    }
  }

  function renderTable() {
    if (state.currentFiles.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-cell">
            <div style="font-size: 1.8rem; margin-bottom: 8px;">🔍</div>
            <div>No matching files found.</div>
            <div style="font-size: 0.8rem; margin-top: 4px; color: var(--text-dim);">Try adjusting your search query or status filter.</div>
          </td>
        </tr>
      `;
      return;
    }

    const rowsHtml = state.currentFiles.map((file) => {
      const status = (file.status || "pending").toLowerCase();
      const statusIcon = status === "uploaded" ? "✓" : status === "failed" ? "✕" : status === "uploading" ? "⟳" : "⏳";
      const uploadedTime = formatDate(file.uploaded_at || file.created_at);
      const fileName = file.relative_path ? file.relative_path.split("/").pop() : "Unnamed";

      return `
        <tr>
          <td class="row-id">#${file.id}</td>
          <td>
            <span class="status-badge ${status}">
              <span class="status-dot"></span>
              <span>${status}</span>
            </span>
          </td>
          <td>
            <div class="file-info">
              <span class="file-relative clickable" title="Click to read email: ${escapeHtml(file.relative_path)}" onclick="window.appOpenMail(${file.id})">${escapeHtml(file.relative_path || file.file_path)}</span>
              <span class="file-s3">
                <span>s3://${escapeHtml(file.s3_key)}</span>
                <button class="copy-mini-btn" title="Copy S3 Key" onclick="window.appCopy('${escapeHtml(file.s3_key)}')">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </span>
            </div>
          </td>
          <td><span class="file-size">${formatBytes(file.file_size)}</span></td>
          <td style="color: var(--text-muted);">${file.retries || 0}</td>
          <td><span class="timestamp">${uploadedTime}</span></td>
          <td style="text-align: center;">
            <div class="action-group">
              <button class="read-mail-btn" onclick="window.appOpenMail(${file.id})" title="Read email in mail format">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <span>Read Mail</span>
              </button>
              <button class="view-btn" onclick="window.appShowDetail(${file.id})" title="View upload metadata">Info</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    tableBody.innerHTML = rowsHtml;
  }

  function renderPagination() {
    const start = state.totalRecords === 0 ? 0 : (state.currentPage - 1) * state.pageLimit + 1;
    const end = Math.min(state.currentPage * state.pageLimit, state.totalRecords);

    paginationInfo.textContent = `Showing ${start.toLocaleString()} - ${end.toLocaleString()} of ${state.totalRecords.toLocaleString()} files`;
    pageIndicator.textContent = `Page ${state.currentPage} of ${state.totalPages}`;

    firstPageBtn.disabled = state.currentPage <= 1;
    prevPageBtn.disabled = state.currentPage <= 1;
    nextPageBtn.disabled = state.currentPage >= state.totalPages;
    lastPageBtn.disabled = state.currentPage >= state.totalPages;
  }

  function openFileDetail(id) {
    const file = state.currentFiles.find((f) => f.id === id);
    if (!file) return;

    const status = (file.status || "pending").toLowerCase();

    modalBody.innerHTML = `
      <div class="detail-row">
        <span class="detail-label">Status & Record ID</span>
        <div class="detail-value">
          <span class="status-badge ${status}">
            <span class="status-dot"></span>
            <span>${status}</span>
          </span>
          <span style="font-family: 'JetBrains Mono', monospace; color: var(--text-muted);">Record ID: #${file.id}</span>
        </div>
      </div>

      <div class="detail-row">
        <span class="detail-label">Relative Path</span>
        <div class="detail-value mono">
          <span>${escapeHtml(file.relative_path || "--")}</span>
          <button class="copy-mini-btn" title="Copy" onclick="window.appCopy('${escapeHtml(file.relative_path || "")}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      </div>

      <div class="detail-row">
        <span class="detail-label">S3 Destination Key</span>
        <div class="detail-value mono">
          <span>${escapeHtml(file.s3_key || "--")}</span>
          <button class="copy-mini-btn" title="Copy" onclick="window.appCopy('${escapeHtml(file.s3_key || "")}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      </div>

      <div class="detail-row">
        <span class="detail-label">Local File Path</span>
        <div class="detail-value mono" style="font-size: 0.76rem;">
          <span>${escapeHtml(file.file_path || "--")}</span>
          <button class="copy-mini-btn" title="Copy" onclick="window.appCopy('${escapeHtml(file.file_path || "")}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div class="detail-row">
          <span class="detail-label">File Size</span>
          <div class="detail-value mono">
            ${formatBytes(file.file_size)} (${(file.file_size || 0).toLocaleString()} bytes)
          </div>
        </div>

        <div class="detail-row">
          <span class="detail-label">ETag (MD5 Checksum)</span>
          <div class="detail-value mono" style="font-size: 0.78rem;">
            ${escapeHtml(file.etag || "None")}
          </div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div class="detail-row">
          <span class="detail-label">Uploaded At</span>
          <div class="detail-value">
            ${formatDate(file.uploaded_at)}
          </div>
        </div>

        <div class="detail-row">
          <span class="detail-label">Retries Count</span>
          <div class="detail-value">
            ${file.retries || 0} attempts
          </div>
        </div>
      </div>

      ${file.last_error ? `
        <div class="detail-row">
          <span class="detail-label" style="color: #f87171;">Last Upload Error</span>
          <div class="detail-error">
            ${escapeHtml(file.last_error)}
          </div>
        </div>
      ` : ""}
    `;

    detailModal.style.display = "flex";
  }

  function closeModal() {
    detailModal.style.display = "none";
  }

  // =====================================================
  // EMAIL VIEWER FUNCTIONS
  // =====================================================

  function getSenderInitials(name, email) {
    if (name && name.trim()) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return name.trim().substring(0, 2).toUpperCase();
    }
    if (email) {
      const user = email.split("@")[0];
      return user.substring(0, 2).toUpperCase();
    }
    return "EM";
  }

  function getFileIcon(filename) {
    const ext = (filename.split(".").pop() || "").toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "🖼️";
    if (["pdf"].includes(ext)) return "📄";
    if (["doc", "docx", "txt", "rtf"].includes(ext)) return "📝";
    if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
    if (["zip", "rar", "tar", "gz", "7z"].includes(ext)) return "📦";
    return "📎";
  }

  function renderRecipients(recipientsList, containerEl) {
    containerEl.innerHTML = "";
    if (!recipientsList || recipientsList.length === 0) {
      containerEl.innerHTML = `<span style="color: var(--text-dim); font-size: 0.76rem;">(None)</span>`;
      return;
    }
    recipientsList.forEach((rcpt) => {
      const pill = document.createElement("span");
      pill.className = "recipient-pill";
      pill.title = rcpt.address || rcpt.text;
      pill.textContent = rcpt.name ? `${rcpt.name} <${rcpt.address}>` : rcpt.address || rcpt.text;
      containerEl.appendChild(pill);
    });
  }

  function switchMailTab(tabName) {
    mailState.activeTab = tabName;
    mailTabGroup.querySelectorAll(".mail-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });

    mailHtmlPanel.style.display = tabName === "html" ? "flex" : "none";
    mailTextPanel.style.display = tabName === "text" ? "flex" : "none";
    mailHeadersPanel.style.display = tabName === "headers" ? "flex" : "none";
  }

  function toggleMailTheme() {
    mailState.isDarkTheme = !mailState.isDarkTheme;
    mailHtmlIframe.classList.toggle("dark-theme", mailState.isDarkTheme);
    mailThemeIcon.textContent = mailState.isDarkTheme ? "🌙 Dark" : "☀️ Light";
  }

  function closeMailModal() {
    mailModal.style.display = "none";
    mailState.activeId = null;
    mailState.activeData = null;
    try {
      mailHtmlIframe.srcdoc = "about:blank";
    } catch {}
  }

  async function openMailModal(id) {
    mailState.activeId = id;
    mailModal.style.display = "flex";

    // Show loading state
    mailLoadingState.style.display = "flex";
    mailErrorState.style.display = "none";
    mailContentView.style.display = "none";
    mailSubjectTitle.textContent = "Loading email...";
    mailLoadingSubtext.textContent = `Connecting to S3 bucket & parsing RFC822 mail #${id}...`;

    try {
      const res = await fetch(`/api/mail?db=${encodeURIComponent(state.currentDb)}&id=${id}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}: Failed to load email`);
      }

      const mail = await res.json();
      mailState.activeData = mail;

      // Populate header info
      mailSubjectTitle.textContent = mail.subject || "(No Subject)";
      mailSubjectTitle.title = mail.subject || "";

      // Sender Avatar & Name
      const fromObj = mail.from?.value?.[0] || {};
      const fromName = fromObj.name || mail.from?.text || "Unknown Sender";
      const fromEmail = fromObj.address || "";
      mailSenderAvatar.textContent = getSenderInitials(fromName, fromEmail);
      mailFromName.textContent = fromName;
      mailFromEmail.textContent = fromEmail ? `<${fromEmail}>` : "";

      // Recipients To & Cc
      renderRecipients(mail.to?.value || [], mailToList);

      if (mail.cc && mail.cc.value && mail.cc.value.length > 0) {
        mailCcRow.style.display = "flex";
        renderRecipients(mail.cc.value, mailCcList);
      } else {
        mailCcRow.style.display = "none";
      }

      // Date
      mailDateFull.textContent = formatDate(mail.date || mail.uploadedAt);
      mailSourceChip.textContent = mail.source === "s3_url" ? "S3 Direct URL" : mail.source === "s3_sdk" ? "S3 SDK" : "Local Disk";

      // S3 destination key & copy button
      mailS3KeyText.textContent = mail.s3Key || "--";
      mailCopyS3KeyBtn.onclick = () => copyToClipboard(mail.s3Key || "");

      // S3 Direct Button
      if (mail.s3Url) {
        mailS3DirectBtn.href = mail.s3Url;
        mailS3DirectBtn.style.display = "inline-flex";
      } else {
        mailS3DirectBtn.style.display = "none";
      }

      // Download .EML button
      mailDownloadEmlBtn.href = `/api/mail/raw?db=${encodeURIComponent(state.currentDb)}&id=${mail.id}`;
      mailDownloadEmlBtn.download = (mail.relativePath ? mail.relativePath.split("/").pop() : `email-${mail.id}.eml`);

      // Attachments
      const regularAttachments = (mail.attachments || []).filter((a) => !a.isInline);
      if (regularAttachments.length > 0) {
        mailAttachmentsCard.style.display = "flex";
        attachmentsCountLabel.textContent = `Attachments (${regularAttachments.length})`;
        mailAttachmentsGrid.innerHTML = regularAttachments.map((att) => {
          const downloadUrl = `/api/mail/attachment?db=${encodeURIComponent(state.currentDb)}&id=${mail.id}&index=${att.index}`;
          const icon = getFileIcon(att.filename);
          return `
            <a href="${downloadUrl}" class="attachment-chip" download="${escapeHtml(att.filename)}" title="Download ${escapeHtml(att.filename)}">
              <span class="att-icon">${icon}</span>
              <span class="att-name">${escapeHtml(att.filename)}</span>
              <span class="att-size">(${formatBytes(att.size)})</span>
              <span class="att-dl-icon">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </span>
            </a>
          `;
        }).join("");
      } else {
        mailAttachmentsCard.style.display = "none";
      }

      // Populate HTML in Iframe
      const emailHtml = mail.html || (mail.text ? `<pre style="font-family: monospace; white-space: pre-wrap;">${escapeHtml(mail.text)}</pre>` : "<p><i>(No message content)</i></p>");
      const baseStyles = `
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 20px;
            padding: 0;
            font-size: 14px;
            line-height: 1.6;
            color: #1f2937;
            background: #ffffff;
            word-break: break-word;
          }
          img { max-width: 100% !important; height: auto !important; }
          table { max-width: 100% !important; }
          a { color: #2563eb; text-decoration: underline; }
          blockquote { border-left: 3px solid #cbd5e1; margin: 10px 0; padding-left: 12px; color: #64748b; }
        </style>
      `;

      try {
        const doc = mailHtmlIframe.contentWindow.document;
        doc.open();
        doc.write(baseStyles + emailHtml);
        doc.close();
      } catch {
        mailHtmlIframe.srcdoc = baseStyles + emailHtml;
      }

      // Populate Plain Text
      mailTextContent.textContent = mail.text || "(No plain text version available)";

      // Populate Headers
      if (mail.headers && mail.headers.length > 0) {
        mailHeadersTable.innerHTML = mail.headers.map((h) => `
          <div class="header-entry">
            <span class="header-entry-key">${escapeHtml(h.key)}:</span>
            <span class="header-entry-val">${escapeHtml(h.value)}</span>
          </div>
        `).join("");
      } else {
        mailHeadersTable.innerHTML = `<p style="color: var(--text-dim); padding: 12px;">No header records available</p>`;
      }

      // Default to HTML view, or fallback to text if only text exists
      switchMailTab(mail.hasHtml ? "html" : "text");

      // Footer
      mailFooterMeta.textContent = `Database: ${state.currentDb} | Status: ${mail.status} | Size: ${formatBytes(mail.fileSize)}`;

      // Reveal content
      mailLoadingState.style.display = "none";
      mailContentView.style.display = "flex";

    } catch (err) {
      console.error("Failed to fetch/render mail:", err);
      mailLoadingState.style.display = "none";
      mailErrorState.style.display = "flex";
      mailErrorMessage.textContent = "Unable to load email";
      mailErrorDetail.textContent = err.message;
      mailRetryBtn.onclick = () => openMailModal(id);
    }
  }

  function refreshAll() {
    fetchStats();
    fetchFiles();
  }

  // Global hooks for inline onclick
  window.appCopy = copyToClipboard;
  window.appShowDetail = openFileDetail;
  window.appOpenMail = openMailModal;

  // Event Listeners
  dbSelect.addEventListener("change", (e) => {
    state.currentDb = e.target.value;
    state.currentPage = 1;
    refreshAll();
  });

  refreshBtn.addEventListener("click", () => {
    const icon = refreshBtn.querySelector(".refresh-icon");
    if (icon) icon.classList.add("spinning");
    refreshAll();
    setTimeout(() => {
      if (icon) icon.classList.remove("spinning");
    }, 600);
  });

  autoRefreshToggle.addEventListener("change", (e) => {
    if (e.target.checked) {
      state.autoRefreshTimer = setInterval(refreshAll, 5000);
    } else {
      if (state.autoRefreshTimer) {
        clearInterval(state.autoRefreshTimer);
        state.autoRefreshTimer = null;
      }
    }
  });

  searchInput.addEventListener("input", (e) => {
    const val = e.target.value;
    clearSearchBtn.style.display = val ? "block" : "none";

    clearTimeout(state.searchDebounceTimer);
    state.searchDebounceTimer = setTimeout(() => {
      state.searchQuery = val;
      state.currentPage = 1;
      fetchFiles();
    }, 300);
  });

  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearSearchBtn.style.display = "none";
    state.searchQuery = "";
    state.currentPage = 1;
    fetchFiles();
  });

  filterPills.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill-btn");
    if (!pill) return;

    filterPills.querySelectorAll(".pill-btn").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");

    state.statusFilter = pill.dataset.status;
    state.currentPage = 1;
    fetchFiles();
  });

  limitSelect.addEventListener("change", (e) => {
    state.pageLimit = parseInt(e.target.value, 10);
    state.currentPage = 1;
    fetchFiles();
  });

  // Pagination Listeners
  firstPageBtn.addEventListener("click", () => {
    if (state.currentPage > 1) {
      state.currentPage = 1;
      fetchFiles();
    }
  });

  prevPageBtn.addEventListener("click", () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      fetchFiles();
    }
  });

  nextPageBtn.addEventListener("click", () => {
    if (state.currentPage < state.totalPages) {
      state.currentPage++;
      fetchFiles();
    }
  });

  lastPageBtn.addEventListener("click", () => {
    if (state.currentPage < state.totalPages) {
      state.currentPage = state.totalPages;
      fetchFiles();
    }
  });

  // Modal Closers
  modalCloseBtn.addEventListener("click", closeModal);
  modalCloseBtn2.addEventListener("click", closeModal);
  detailModal.addEventListener("click", (e) => {
    if (e.target === detailModal) closeModal();
  });

  // Mail Modal Listeners
  mailModalCloseBtn.addEventListener("click", closeMailModal);
  mailModalCloseBtn2.addEventListener("click", closeMailModal);
  mailModal.addEventListener("click", (e) => {
    if (e.target === mailModal) closeMailModal();
  });

  mailTabGroup.addEventListener("click", (e) => {
    const tabBtn = e.target.closest(".mail-tab");
    if (tabBtn) switchMailTab(tabBtn.dataset.tab);
  });

  mailThemeToggleBtn.addEventListener("click", toggleMailTheme);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (mailModal.style.display !== "none") {
        closeMailModal();
      } else if (detailModal.style.display !== "none") {
        closeModal();
      }
    }
  });

  // Initialize
  fetchDatabases();
})();
