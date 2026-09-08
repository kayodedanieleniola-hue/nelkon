import os

path = r"c:\Users\Duke AI\Desktop\NAKCONEL\templates\admin.html"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Fix 1: CSS --ground
content = content.replace("""  --wine-deep: #1B0404;
  --wine-mid: #3D0A0A;
  --grou
  
  
  
  nd: #0A0202;""", """  --wine-deep: #1B0404;
  --wine-mid: #3D0A0A;
  --ground: #0A0202;""")

# Fix 2: renderAdminChatsList & openAdminChatModal
bad_chats_block = """  openRecordInspector(`Campaign Submission: ${qst.fullName || item.email}`, `Record ID #${item.id}`, {
  "Full Name": qst.fullName || item.email,
  "Email": item.email,
  "Booking ID": item.id,
  "Date Booked": fmtDate(item.createdAt)
  });
  }


  const filtered = rows.filter(item => {
  if (!q) return true;
  const textStr = `${item.visitorName} ${item.visitorEmail} ${item.lastMessage} ${item.teamMemberName}`.toLowerCase();
  return textStr.includes(q);
  });

  const list = document.getElementById('chatRows');
  list.innerHTML = filtered.length ? filtered.map((item, idx) => `
  <tr class="clickable-row" onclick="openAdminChatModal('${esc(item.id)}', '${esc(item.visitorName || item.visitorEmail || 'Website Visitor')}', '${esc(item.visitorEmail || '')}')">
  <td class="cell-row-idx">${idx + 1}</td>
  <td><strong>${esc(item.visitorName || 'Website Visitor')}</strong></td>
  <td class="cell-mono">${esc(item.visitorEmail || '-')}</td>
  <td style="max-width:320px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(item.lastMessage || 'No messages yet')}</td>
  <td><span class="chip">${esc(item.teamMemberName || 'Team')}</span></td>
  <td class="cell-mono">#${esc(item.id)}</td>
  <td style="display:flex; gap:6px;">
  <button class="btn primary" style="padding:4px 10px; font-size:11px;">Open Chat</button>
  <button class="btn" style="padding:4px 8px;font-size:11px; color:#f7a3a3;" onclick="event.stopPropagation(); deleteChatConversation('${esc(item.id)}', '${esc(item.visitorName || 'Visitor')}')">Delete</button>
  document.getElementById('modalVisitorName').textContent = visitorName || 'Visitor Conversation';
  document.getElementById('modalVisitorMeta').textContent = visitorMeta || 'Team Inbox';
  chatModalOverlay.classList.add('active');

  await loadAdminChatMessages();
  clearInterval(chatPollTimer);
  chatPollTimer = setInterval(loadAdminChatMessages, 3500);
  }"""

good_chats_block = """  openRecordInspector(`Campaign Submission: ${qst.fullName || item.email}`, `Record ID #${item.id}`, {
    "Full Name": qst.fullName || item.email,
    "Email": item.email,
    "Business Name": qst.business,
    "Business Challenge": qst.challenge,
    "Selected Package": pkg.name,
    "Payment Reference": pay.reference,
    "Created Date": fmtDate(item.createdAt)
  });
}

async function loadCampaigns() {
  const data = await adminFetch('/api/admin/campaign-registrations');
  masterData.campaign = data.registrations || [];
  await renderCampaigns();
}

/* =========================================================
   WORKSHEET 4: VISITOR SUPPORT CHAT INBOX
   ========================================================= */
function renderAdminChatsList() {
  const rows = masterData.chats || [];
  document.getElementById('tabCountChats').textContent = rows.length;
  const q = getSearchQuery();

  const filtered = rows.filter(item => {
    if (!q) return true;
    const textStr = `${item.visitorName} ${item.visitorEmail} ${item.lastMessage} ${item.teamMemberName}`.toLowerCase();
    return textStr.includes(q);
  });

  const list = document.getElementById('chatRows');
  list.innerHTML = filtered.length ? filtered.map((item, idx) => `
    <tr class="clickable-row" onclick="openAdminChatModal('${esc(item.id)}', '${esc(item.visitorName || item.visitorEmail || 'Website Visitor')}', '${esc(item.visitorEmail || '')}')">
      <td class="cell-row-idx">${idx + 1}</td>
      <td><strong>${esc(item.visitorName || 'Website Visitor')}</strong></td>
      <td class="cell-mono">${esc(item.visitorEmail || '-')}</td>
      <td style="max-width:320px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(item.lastMessage || 'No messages yet')}</td>
      <td><span class="chip">${esc(item.teamMemberName || 'Team')}</span></td>
      <td class="cell-mono">#${esc(item.id)}</td>
      <td style="display:flex; gap:6px;">
        <button class="btn primary" style="padding:4px 10px; font-size:11px;">Open Chat</button>
        <button class="btn" style="padding:4px 8px;font-size:11px; color:#f7a3a3;" onclick="event.stopPropagation(); deleteChatConversation('${esc(item.id)}', '${esc(item.visitorName || 'Visitor')}')">Delete</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="7" style="text-align:center; padding:24px;" class="muted">No matching conversations found.</td></tr>';
}

async function deleteChatConversation(convId, visitorName) {
  if (!confirm(`Are you sure you want to permanently delete chat conversation with '${visitorName}' (#${convId})? This action cannot be undone.`)) return;
  try {
    await adminFetch(`/api/admin/chat/conversations/${encodeURIComponent(convId)}`, { method: 'DELETE' });
    await loadAdminChats();
    loadAdminSummary();
    alert(`Chat conversation with '${visitorName}' has been permanently deleted.`);
  } catch (err) {
    logAdminError('Could not delete chat conversation', err, { convId });
    alert(err.message || 'Failed to delete chat conversation.');
  }
}

async function loadAdminChats() {
  const data = await adminFetch('/api/admin/chat/conversations');
  masterData.chats = data.conversations || [];
  renderAdminChatsList();
}

async function openAdminChatModal(id, visitorName, visitorMeta) {
  activeChatId = id;
  document.getElementById('modalVisitorName').textContent = visitorName || 'Visitor Conversation';
  document.getElementById('modalVisitorMeta').textContent = visitorMeta || 'Team Inbox';
  chatModalOverlay.classList.add('active');

  await loadAdminChatMessages();
  clearInterval(chatPollTimer);
  chatPollTimer = setInterval(loadAdminChatMessages, 3500);
}"""

if bad_chats_block in content:
    content = content.replace(bad_chats_block, good_chats_block)
    print("Replaced bad_chats_block successfully!")
else:
    print("bad_chats_block not found directly, replacing regex pattern...")
    import re
    content = re.sub(
        r'openRecordInspector\(`Campaign Submission:.*?(?=function closeAdminChatModal\(\))',
        good_chats_block + "\n\n",
        content,
        flags=re.DOTALL
    )

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Saved clean admin.html!")
