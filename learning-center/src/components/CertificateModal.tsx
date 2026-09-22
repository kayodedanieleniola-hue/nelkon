"use client";

export type CertificateData = {
  code: string;
  issuedAt: string;
  grade: string;
  studentName: string;
  studentId: string;
  courseName: string;
};

export default function CertificateModal({
  data,
  onClose,
}: {
  data: CertificateData;
  onClose: () => void;
}) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={overlay}>
      <div style={container}>
        <div style={headerActions} className="no-print">
          <span style={verifyTag}>VERIFIED NAKCONEL ACADEMIC CERTIFICATE</span>
          <div style={btnGroup}>
            <button type="button" onClick={handlePrint} style={printBtn}>
              Print / Save PDF
            </button>
            <button type="button" onClick={onClose} style={closeBtn}>
              Close
            </button>
          </div>
        </div>

        {/* Certificate Frame */}
        <div style={certificateFrame} id="nakconel-certificate">
          <div style={outerBorder}>
            <div style={innerBorder}>
              {/* Top Watermark Header */}
              <div style={topHeader}>
                <div style={logoBadge}>NAKCONEL LEARNING PORTAL</div>
                <span style={certIdCode}>CERTIFICATE ID: {data.code}</span>
              </div>

              {/* Title Section */}
              <div style={titleBox}>
                <h1 style={mainTitle}>Certificate of Completion</h1>
                <p style={subTitle}>This is to officially certify that</p>
              </div>

              {/* Recipient Name */}
              <div style={recipientSection}>
                <h2 style={studentName}>{data.studentName}</h2>
                <span style={studentMeta}>STUDENT ID: {data.studentId}</span>
              </div>

              {/* Statement */}
              <p style={bodyText}>
                has successfully fulfilled all academic requirements, class attendance, and practical exam assessments for the course
              </p>

              {/* Course Title */}
              <div style={courseTitleBox}>
                <h3 style={courseTitle}>{data.courseName}</h3>
                <span style={honorsBadge}>AWARDED WITH {data.grade}</span>
              </div>

              {/* Footer Signatures & Seal */}
              <div style={certFooter}>
                <div style={sigBlock}>
                  <div style={sigLine}>Nakconel Registrar</div>
                  <span style={sigTitle}>Office of Academic Affairs</span>
                </div>

                <div style={goldSeal}>
                  <div style={sealInner}>
                    <span style={{ fontSize: "1rem", fontWeight: 700, letterSpacing: "0.1em" }}>SEAL</span>
                    <span style={sealText}>OFFICIAL CERTIFIED</span>
                  </div>
                </div>

                <div style={sigBlock}>
                  <div style={sigLine}>{new Date(data.issuedAt).toLocaleDateString()}</div>
                  <span style={sigTitle}>Date of Issuance</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(10, 4, 4, 0.94)",
  backdropFilter: "blur(10px)",
  zIndex: 120,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.5rem",
  overflowY: "auto",
} as const;

const container = {
  width: "900px",
  maxWidth: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
} as const;

const headerActions = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
} as const;

const verifyTag = {
  fontSize: "0.8rem",
  color: "#ffd98a",
  fontWeight: 700,
} as const;

const btnGroup = {
  display: "flex",
  gap: "0.5rem",
} as const;

const printBtn = {
  background: "linear-gradient(135deg, #98661B, #d4af37)",
  color: "#1a0808",
  border: "none",
  borderRadius: 6,
  padding: "0.45rem 0.9rem",
  fontSize: "0.85rem",
  fontWeight: 800,
  cursor: "pointer",
} as const;

const closeBtn = {
  background: "#3d1010",
  color: "#ff8080",
  border: "1px solid #ff4d4d",
  borderRadius: 6,
  padding: "0.45rem 0.8rem",
  fontSize: "0.85rem",
  fontWeight: 700,
  cursor: "pointer",
} as const;

const certificateFrame = {
  background: "#fdfbf7",
  color: "#2b1810",
  padding: "1.5rem",
  borderRadius: 8,
  boxShadow: "0 25px 60px rgba(0,0,0,0.9)",
  fontFamily: "Georgia, serif",
} as const;

const outerBorder = {
  border: "6px double #98661B",
  padding: "1rem",
  borderRadius: 6,
} as const;

const innerBorder = {
  border: "1px solid #d4af37",
  padding: "2rem 2.5rem",
  borderRadius: 4,
  textAlign: "center",
  position: "relative",
} as const;

const topHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "1.5rem",
  fontFamily: "sans-serif",
} as const;

const logoBadge = {
  fontSize: "0.75rem",
  fontWeight: 800,
  color: "#804e0a",
  letterSpacing: "0.08em",
} as const;

const certIdCode = {
  fontSize: "0.72rem",
  color: "#6b5849",
  fontWeight: 700,
} as const;

const titleBox = {
  marginBottom: "1rem",
} as const;

const mainTitle = {
  margin: 0,
  fontSize: "2.2rem",
  fontWeight: 700,
  color: "#5c1d1d",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
} as const;

const subTitle = {
  margin: "0.5rem 0 0",
  fontSize: "1rem",
  fontStyle: "italic",
  color: "#6b5849",
} as const;

const recipientSection = {
  margin: "1.25rem 0",
  padding: "0.5rem 0",
  borderBottom: "1px solid #e6d7c3",
  borderTop: "1px solid #e6d7c3",
} as const;

const studentName = {
  margin: 0,
  fontSize: "2.5rem",
  fontWeight: 700,
  color: "#1f0909",
} as const;

const studentMeta = {
  fontSize: "0.75rem",
  color: "#804e0a",
  fontWeight: 700,
  fontFamily: "sans-serif",
  letterSpacing: "0.05em",
} as const;

const bodyText = {
  fontSize: "0.95rem",
  lineHeight: 1.6,
  color: "#4a3c31",
  maxWidth: "600px",
  margin: "0 auto 1.25rem",
} as const;

const courseTitleBox = {
  marginBottom: "2rem",
} as const;

const courseTitle = {
  margin: "0 0 0.5rem",
  fontSize: "1.6rem",
  fontWeight: 700,
  color: "#804e0a",
} as const;

const honorsBadge = {
  display: "inline-block",
  background: "#f3e7d3",
  color: "#804e0a",
  fontSize: "0.75rem",
  fontWeight: 800,
  padding: "0.25rem 0.75rem",
  borderRadius: 20,
  fontFamily: "sans-serif",
  border: "1px solid #d4af37",
} as const;

const certFooter = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  marginTop: "2rem",
  paddingTop: "1rem",
  fontFamily: "sans-serif",
} as const;

const sigBlock = {
  textAlign: "center",
  width: "180px",
} as const;

const sigLine = {
  borderBottom: "2px solid #5c1d1d",
  paddingBottom: "0.2rem",
  fontSize: "0.9rem",
  fontWeight: 700,
  color: "#1f0909",
} as const;

const sigTitle = {
  fontSize: "0.7rem",
  color: "#6b5849",
  marginTop: "0.2rem",
  display: "block",
} as const;

const goldSeal = {
  width: "80px",
  height: "80px",
  borderRadius: "50%",
  background: "linear-gradient(135deg, #d4af37, #98661B)",
  padding: "4px",
  boxShadow: "0 4px 12px rgba(152, 102, 27, 0.4)",
} as const;

const sealInner = {
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  border: "2px dashed #fff",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
} as const;

const sealText = {
  fontSize: "0.5rem",
  fontWeight: 800,
  letterSpacing: "0.05em",
} as const;
