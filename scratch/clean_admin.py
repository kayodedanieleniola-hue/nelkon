path = r"c:\Users\Duke AI\Desktop\NAKCONEL\templates\admin.html"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

bad_block = """        "Attachments": attachments,
        "Business Name": qst.business,
        "Business Challenge": qst.challenge,
        "Target Audience": qst.audience,
        "Main Goal": qst.goal,
        "Selected Package": pkg.name,
        "Package Details": pkg.summary,
        "Payment Reference": pay.reference,
        "Payment Amount": pay.amount ? `${pay.amount / 100} ${pay.currency || ''}` : null,
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
        "Booking ID": item.id,
        "Date Booked": fmtDate(item.createdAt)
      });
    }"""

good_block = """        "Attachments": attachments,
        "Booking ID": item.id,
        "Date Booked": fmtDate(item.createdAt)
      });
    }"""

# Replace CRLF / LF variations
content_clean = content.replace(bad_block.replace("\n", "\r\n"), good_block.replace("\n", "\r\n"))
if content_clean == content:
    content_clean = content.replace(bad_block, good_block)

if content_clean != content:
    with open(path, "w", encoding="utf-8") as f:
        f.write(content_clean)
    print("Successfully cleaned admin.html!")
else:
    print("Could not match bad_block directly, scanning line by line...")
