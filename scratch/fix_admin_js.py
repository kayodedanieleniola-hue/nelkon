import os
import re

path = r"c:\Users\Duke AI\Desktop\NAKCONEL\templates\admin.html"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Pattern matching from deleteCareerRegistration down to deleteStrategyCall
pattern = re.compile(
    r'async function deleteCareerRegistration\(regId, applicantName\) \{.*?(?=async function deleteStrategyCall\(callId, clientName\))',
    re.DOTALL
)

replacement = """async function deleteCareerRegistration(regId, applicantName) {
      if (!confirm(`Are you sure you want to permanently delete the registration for '${applicantName}' (#${regId})? This action cannot be undone.`)) return;
      try {
        await adminFetch(`/api/admin/career-registrations/${encodeURIComponent(regId)}`, { method: 'DELETE' });
        await loadCareerRegistrations();
        loadAdminSummary();
        alert(`Registration for '${applicantName}' has been permanently deleted.`);
      } catch (err) {
        logAdminError('Could not delete career registration', err, { registrationId: regId });
        alert(err.message || 'Failed to delete registration.');
      }
    }

    /* =========================================================
       WORKSHEET 2: STRATEGY CALL BOOKINGS RENDERING
       ========================================================= */
    function renderStrategyCalls() {
      const rows = masterData.calls || [];
      document.getElementById('tabCountCalls').textContent = rows.length;
      const q = getSearchQuery();

      const filtered = rows.filter(item => {
        if (!q) return true;
        const textStr = `${item.name} ${item.email} ${item.message} ${item.status} ${item.id}`.toLowerCase();
        return textStr.includes(q);
      });

      const tbody = document.getElementById('callsRows');
      tbody.innerHTML = filtered.length ? filtered.map((item, idx) => {
        const statusClass = item.status === 'completed' ? 'badge-completed' : item.status === 'contacted' ? 'badge-contacted' : 'badge-new';
        const isEnquiry = item.type === 'enquiry' || String(item.message || '').startsWith('[Enquiry]');
        const recordType = isEnquiry ? 'Enquiry' : 'Strategic Call';
        return `<tr class="clickable-row" onclick="inspectCallRecord('${esc(item.id)}')">
      <td class="cell-row-idx">${idx + 1}</td>
      <td><strong>${esc(item.name || 'Unknown')}</strong></td>
      <td class="cell-mono">${esc(item.email || '-')}</td>
      <td><span class="${isEnquiry ? 'badge-contacted' : 'badge-new'}">${recordType}</span></td>
      <td style="max-width:300px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(item.message || '-')}</td>
      <td><span class="${statusClass}">${esc(item.status || 'new')}</span></td>
      <td class="cell-mono">#${esc(item.id)}</td>
      <td class="cell-mono">${esc(fmtDate(item.createdAt))}</td>
      <td style="display:flex; gap:6px;">
        <button class="btn" style="padding:4px 8px;font-size:11px" onclick="event.stopPropagation(); updateCallStatus('${esc(item.id)}', '${item.status === 'new' ? 'contacted' : 'completed'}')">
          Mark ${item.status === 'new' ? 'Contacted' : 'Completed'}
        </button>
        <button class="btn" style="padding:4px 8px;font-size:11px; color:#f7a3a3;" onclick="event.stopPropagation(); deleteStrategyCall('${esc(item.id)}', '${esc(item.name || 'Client')}')">Delete</button>
      </td>
    </tr>`;
      }).join('') : '<tr><td colspan="9" style="text-align:center; padding:24px;" class="muted">No matching enquiries or strategy calls found.</td></tr>';
    }

    """

new_content, count = pattern.subn(replacement, content, count=1)

if count > 0:
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Successfully cleaned up duplicated JS in admin.html!")
else:
    print("Regex pattern did not match.")
