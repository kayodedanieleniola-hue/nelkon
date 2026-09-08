import os

path = r"c:\Users\Duke AI\Desktop\NAKCONEL\templates\admin.html"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace the broken worksheet panel section
start_marker = "<!-- WORKSHEET 1: CAREER & TRAINING APPLICATIONS -->"
end_marker = "<!-- MODAL 1: REGISTER NEW ADMIN MODAL -->"

worksheets_html = """<!-- WORKSHEET 1: CAREER & TRAINING APPLICATIONS -->
        <div class="worksheet-panel active" id="sheet-career">
          <div class="excel-table-wrap">
            <table class="excel-table">
              <thead>
                <tr>
                  <th class="col-row-idx">#</th>
                  <th>Applicant Name</th>
                  <th>Email Address</th>
                  <th>Phone</th>
                  <th>Type / Track</th>
                  <th>Program Title</th>
                  <th>Status</th>
                  <th>Submission ID</th>
                  <th>Date Submitted</th>
                  <th>Cell Action</th>
                </tr>
              </thead>
              <tbody id="careerRows">
                <tr>
                  <td colspan="10" style="text-align:center; padding:24px;" class="muted">Loading training & career submissions...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- WORKSHEET 2: ENQUIRIES AND STRATEGY CALLS -->
        <div class="worksheet-panel" id="sheet-calls">
          <div class="excel-table-wrap">
            <table class="excel-table">
              <thead>
                <tr>
                  <th class="col-row-idx">#</th>
                  <th>Client Name</th>
                  <th>Email Address</th>
                  <th>Type</th>
                  <th>Enquiry Details</th>
                  <th>Status</th>
                  <th>Booking ID</th>
                  <th>Date Booked</th>
                  <th>Cell Action</th>
                </tr>
              </thead>
              <tbody id="callsRows">
                <tr>
                  <td colspan="9" style="text-align:center; padding:24px;" class="muted">Loading enquiries and strategy calls...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- WORKSHEET 3: CAMPAIGN SUBMISSIONS -->
        <div class="worksheet-panel" id="sheet-campaign">
          <div class="excel-table-wrap">
            <table class="excel-table">
              <thead>
                <tr>
                  <th class="col-row-idx">#</th>
                  <th>Full Name</th>
                  <th>Email Address</th>
                  <th>Business Name</th>
                  <th>Primary Challenge</th>
                  <th>Package Selected</th>
                  <th>Package Price</th>
                  <th>Payment Status</th>
                  <th>Pay Reference</th>
                  <th>Submission Date</th>
                  <th>Cell Action</th>
                </tr>
              </thead>
              <tbody id="campaignRows">
                <tr>
                  <td colspan="11" style="text-align:center; padding:24px;" class="muted">Loading campaign submissions...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- WORKSHEET 4: VISITOR SUPPORT CHAT INBOX -->
        <div class="worksheet-panel" id="sheet-chats">
          <div class="excel-table-wrap">
            <table class="excel-table">
              <thead>
                <tr>
                  <th class="col-row-idx">#</th>
                  <th>Visitor Name</th>
                  <th>Visitor Email</th>
                  <th>Last Message Preview</th>
                  <th>Assigned Agent</th>
                  <th>Chat ID</th>
                  <th>Cell Action</th>
                </tr>
              </thead>
              <tbody id="chatRows">
                <tr>
                  <td colspan="7" style="text-align:center; padding:24px;" class="muted">Loading chat inbox...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- WORKSHEET 5: REGISTERED USERS -->
        <div class="worksheet-panel" id="sheet-users">
          <div class="excel-table-wrap">
            <table class="excel-table">
              <thead>
                <tr>
                  <th class="col-row-idx">#</th>
                  <th>User Name</th>
                  <th>Email Address</th>
                  <th>Firebase User ID (UID)</th>
                  <th>Email Verification</th>
                  <th>Activities & Monitor</th>
                  <th>Cell Action</th>
                </tr>
              </thead>
              <tbody id="userRows">
                <tr>
                  <td colspan="7" style="text-align:center; padding:24px;" class="muted">Loading user accounts...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- WORKSHEET 6: ADMIN TEAM -->
        <div class="worksheet-panel" id="sheet-team">
          <div class="section-title" style="margin:0 0 8px;">Admin Management</div>
          <p class="muted" style="margin:0 0 16px;">Master Admins can view every admin account, grant or remove Master Admin access, and deactivate or reactivate accounts.</p>
          <div class="excel-table-wrap">
            <table class="excel-table">
              <thead>
                <tr>
                  <th class="col-row-idx">#</th>
                  <th>Admin Name & Username</th>
                  <th>Official Email</th>
                  <th>Role Title</th>
                  <th>Access Tier</th>
                  <th>Account Status</th>
                  <th>Cell Action</th>
                </tr>
              </thead>
              <tbody id="teamRows">
                <tr>
                  <td colspan="7" style="text-align:center; padding:24px;" class="muted">Loading admin team...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </section>
  </main>

  """

idx_start = content.find(start_marker)
idx_end = content.find(end_marker)

if idx_start != -1 and idx_end != -1:
    new_content = content[:idx_start] + worksheets_html + content[idx_end:]
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Successfully restored all 6 worksheets in admin.html!")
else:
    print(f"Could not find markers: start={idx_start}, end={idx_end}")
